import db, { inArray } from "@repo/database";
import { instruments, portfolios, priceBars, positions } from "@repo/database/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PortfolioError, PortfolioService } from "./index";

// A throwaway portfolio of synthetic instruments around the Ukraine as-of (2022-02-25T02:40Z: last bar 02-24).
const AS_OF = new Date("2022-02-25T02:40:00.000Z");
const NAME = `zz-test-portfolio-${process.pid}`;
const A = "ZZPORT_A";
const B = "ZZPORT_B";
let portfolioId = "";

beforeAll(async () => {
  await db.delete(instruments).where(inArray(instruments.symbol, [A, B]));
  await db.insert(instruments).values([
    { symbol: A, name: "Test A", assetClass: "equity", sector: "energy", tradable: true, source: "tiingo" },
    { symbol: B, name: "Test B", assetClass: "etf", sector: "market", tradable: true, source: "tiingo" },
  ]);
  const bar = (symbol: string, date: string, close: number, adjClose: number) => ({
    symbol,
    date,
    open: close,
    high: close,
    low: close,
    close,
    adjClose,
    volume: 1,
  });
  await db.insert(priceBars).values([
    bar(A, "2022-02-23", 100, 50),
    bar(A, "2022-02-24", 110, 55),
    bar(A, "2022-02-25", 999, 999), // after the as-of: must not be used
    bar(B, "2022-02-24", 300, 300),
  ]);
  const [p] = await db.insert(portfolios).values({ name: NAME, nav: 1_000_000 }).returning({ id: portfolios.id });
  portfolioId = p!.id;
  await db.insert(positions).values([
    { portfolioId, symbol: A, targetWeight: 0.6 },
    { portfolioId, symbol: B, targetWeight: 0.3 },
  ]);
});

afterAll(async () => {
  await db.delete(portfolios).where(inArray(portfolios.id, [portfolioId]));
  await db.delete(instruments).where(inArray(instruments.symbol, [A, B]));
  await db.$client.end();
});

describe("portfolio.snapshot", () => {
  it("sizes positions from the close at the as-of and keeps the remainder as cash", async () => {
    const snap = await new PortfolioService().snapshot(portfolioId, AS_OF);
    expect(snap.positions.map((p) => [p.symbol, p.quantity, p.price, p.value])).toEqual([
      // floor(0.6 x 1,000,000 / 110) = 5454; floor(0.3 x 1,000,000 / 300) = 1000
      [A, 5454, 110, 599_940],
      [B, 1000, 300, 300_000],
    ]);
    expect(snap.cash).toBe(1_000_000 - 599_940 - 300_000);
    expect(snap.positions[0]).toMatchObject({ name: "Test A", sector: "energy", weight: 0.59994 });
    expect(snap.positions[0]!.change1d).toBeCloseTo(0.1, 12);
    expect(snap.positions[1]!.change1d).toBeNull();
  });

  it("fails clearly when a holding has no price at the as-of", async () => {
    await expect(new PortfolioService().snapshot(portfolioId, new Date("2022-02-20T00:00:00Z"))).rejects.toBeInstanceOf(PortfolioError);
  });

  it("lists the held symbols", async () => {
    expect((await new PortfolioService().symbols(portfolioId)).sort()).toEqual([A, B]);
  });
});
