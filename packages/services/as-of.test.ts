import { barAvailableAt, weeklyAvailableAt } from "@repo/contracts";
import db, { and, eq, inArray } from "@repo/database";
import { instruments, macroObservations, priceBars } from "@repo/database/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, lastDailyDate, lastWeeklyDate } from "./as-of";
import { MacroService } from "./macro";
import { MarketService } from "./market";

// SPEC 5.1: for asOf = 2021-08-27T21:00Z and the Ukraine preset asOf, no service returns a row dated later.
// Runs against Postgres (compose locally, the CI service container) with rows it inserts and removes.

const IDA = new Date("2021-08-27T21:00:00.000Z");
const UKRAINE = new Date("2022-02-25T02:40:00.000Z");
const SYMBOL = "ZZASOF";
const DAILY = "ZZASOF_DAILY";
const WEEKLY = "WGTSTUS1";

function days(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const DATES = [...days("2021-07-01", "2021-09-10"), ...days("2022-01-10", "2022-03-10")];
const insertedWeekly: string[] = [];

beforeAll(async () => {
  await db.delete(instruments).where(eq(instruments.symbol, SYMBOL));
  await db.insert(instruments).values({ symbol: SYMBOL, name: "as-of test", assetClass: "equity", tradable: true, source: "tiingo" });
  await db.insert(priceBars).values(
    DATES.map((date, i) => ({ symbol: SYMBOL, date, open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, adjClose: 100 + i, volume: 1000 })),
  );
  await db.delete(macroObservations).where(eq(macroObservations.seriesId, DAILY));
  await db.insert(macroObservations).values(DATES.map((date, i) => ({ seriesId: DAILY, date, value: i })));
  // Weekly rows may already exist from the seed; insert only the missing ones and remove only those.
  const weekly = DATES.filter((_, i) => i % 7 === 0);
  const added = await db
    .insert(macroObservations)
    .values(weekly.map((date) => ({ seriesId: WEEKLY, date, value: 200_000 })))
    .onConflictDoNothing()
    .returning({ date: macroObservations.date });
  insertedWeekly.push(...added.map((r) => r.date));
});

afterAll(async () => {
  await db.delete(instruments).where(eq(instruments.symbol, SYMBOL));
  await db.delete(macroObservations).where(eq(macroObservations.seriesId, DAILY));
  if (insertedWeekly.length) {
    await db.delete(macroObservations).where(and(eq(macroObservations.seriesId, WEEKLY), inArray(macroObservations.date, insertedWeekly)));
  }
  await db.$client.end();
});

describe("as-of cut-offs", () => {
  it("makes a daily bar available at 21:00 UTC on its date", () => {
    expect(lastDailyDate(IDA)).toBe("2021-08-27");
    expect(lastDailyDate(new Date("2021-08-27T20:59:59Z"))).toBe("2021-08-26");
    expect(lastDailyDate(UKRAINE)).toBe("2022-02-24");
    expect(barAvailableAt(lastDailyDate(UKRAINE)).getTime()).toBeLessThanOrEqual(UKRAINE.getTime());
  });

  it("makes a weekly value available 5 days after its date", () => {
    expect(lastWeeklyDate(IDA)).toBe("2021-08-22");
    expect(weeklyAvailableAt(lastWeeklyDate(UKRAINE)).getTime()).toBeLessThanOrEqual(UKRAINE.getTime());
  });
});

describe.each([
  ["Ida", IDA],
  ["Ukraine", UKRAINE],
])("no look-ahead at the %s as-of", (_, asOf) => {
  const market = new MarketService();
  const macro = new MacroService();
  const available = (date: string) => barAvailableAt(date).getTime() <= asOf.getTime();

  it("market.bars", async () => {
    const bars = await market.bars(SYMBOL, "2021-01-01", asOf);
    expect(bars.length).toBeGreaterThan(0);
    expect(bars.every((b) => available(b.date))).toBe(true);
    expect(bars.at(-1)?.date).toBe(lastDailyDate(asOf));
  });

  it("market.closesAt", async () => {
    const [close] = await market.closesAt([SYMBOL], asOf);
    expect(close?.date).toBe(lastDailyDate(asOf));
  });

  it("market.returns", async () => {
    const m = await market.returns([SYMBOL], 10, asOf);
    expect(m.returns).toHaveLength(10);
    expect(m.dates.every(available)).toBe(true);
    expect(m.dates.at(-1)).toBe(lastDailyDate(asOf));
  });

  it("market.adv reads only available bars", async () => {
    const adv = await market.adv(SYMBOL, asOf);
    const bars = (await market.bars(SYMBOL, "2021-01-01", asOf)).slice(-20);
    expect(adv).toBeCloseTo(bars.reduce((s, b) => s + b.close * (b.volume ?? 0), 0) / bars.length, 6);
  });

  it("macro.series and macro.latest, daily and weekly", async () => {
    const daily = await macro.series(DAILY, "2021-01-01", asOf);
    expect(daily.length).toBeGreaterThan(0);
    expect(daily.every((o) => available(o.date))).toBe(true);
    expect((await macro.latest(DAILY, asOf))?.date).toBe(lastDailyDate(asOf));

    const weekly = await macro.series(WEEKLY, "2021-01-01", asOf);
    expect(weekly.length).toBeGreaterThan(0);
    expect(weekly.every((o) => weeklyAvailableAt(o.date).getTime() <= asOf.getTime())).toBe(true);
  });
});
