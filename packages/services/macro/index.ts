import { LOOSE_TIGHT_INVENTORY, VIX_ELEVATED, VIX_STRESSED, VIX_Z_LOOKBACK_DAYS, type MacroObservation, type MacroSnapshot } from "@repo/contracts";
import defaultDb, { and, asc, desc, eq, gte, lte } from "@repo/database";
import { macroObservations } from "@repo/database/schema";
import { addDays, lastDailyDate, lastWeeklyDate } from "../as-of";

type Db = typeof defaultDb;

/** EIA weekly inventories; everything else in `MACRO_SERIES` is a FRED daily series. */
export const WEEKLY_SERIES = ["WGTSTUS1", "WCESTUS1"] as const;
export const INVENTORY_YEARS = 5;
/** A same-week value in an earlier year must lie within this many days of the anniversary. */
const SAME_WEEK_DAYS = 3;
const CHANGE_DAYS = 20;

type Obs = { date: string; value: number };

function mean(xs: readonly number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function sampleStd(xs: readonly number[]): number {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/** The visibility cut-off for a series (SPEC 5.1): weekly series lag 5 days, daily series 21:00 UTC. */
export function cutoffFor(seriesId: string, asOf: Date): string {
  return (WEEKLY_SERIES as readonly string[]).includes(seriesId) ? lastWeeklyDate(asOf) : lastDailyDate(asOf);
}

/**
 * Latest value against the mean of the same week in each of the previous 5 years.
 * Null when any of those years has no value within 3 days of the anniversary.
 */
export function inventoryVsFiveYear(history: readonly Obs[]): MacroSnapshot["gasolineStocks"] {
  const latest = history.at(-1);
  if (!latest) return null;
  const peers: number[] = [];
  for (let y = 1; y <= INVENTORY_YEARS; y++) {
    const anniversary = Date.parse(`${Number(latest.date.slice(0, 4)) - y}${latest.date.slice(4)}T00:00:00Z`);
    let best: Obs | null = null;
    let bestGap = Infinity;
    for (const o of history) {
      const gap = Math.abs(Date.parse(`${o.date}T00:00:00Z`) - anniversary) / 86_400_000;
      if (gap <= SAME_WEEK_DAYS && gap < bestGap) {
        best = o;
        bestGap = gap;
      }
    }
    if (!best) return null;
    peers.push(best.value);
  }
  const fiveYearAvg = mean(peers);
  const deviation = latest.value / fiveYearAvg - 1;
  const flag = deviation <= -LOOSE_TIGHT_INVENTORY ? "tight" : deviation >= LOOSE_TIGHT_INVENTORY ? "loose" : "normal";
  return { value: latest.value, fiveYearAvg, deviation, flag };
}

export function vixReading(history: readonly Obs[]): MacroSnapshot["vix"] {
  const latest = history.at(-1);
  if (!latest) throw new Error("no VIXCLS value at as-of");
  const window = history.slice(-VIX_Z_LOOKBACK_DAYS).map((o) => o.value);
  const std = window.length >= 2 ? sampleStd(window) : 0;
  const z = std > 0 && window.length === VIX_Z_LOOKBACK_DAYS ? (latest.value - mean(window)) / std : null;
  const flag = latest.value >= VIX_STRESSED ? "stressed" : latest.value >= VIX_ELEVATED ? "elevated" : "calm";
  return { value: latest.value, z, flag };
}

/** Latest value and its change over 20 observations: a difference (`points`) or a fraction (`ratio`). */
export function withChange(history: readonly Obs[], kind: "points" | "ratio", seriesId: string): { value: number; change20d: number } {
  const latest = history.at(-1);
  const before = history.at(-1 - CHANGE_DAYS);
  if (!latest || !before) throw new Error(`not enough ${seriesId} history at as-of`);
  return { value: latest.value, change20d: kind === "points" ? latest.value - before.value : latest.value / before.value - 1 };
}

/** FRED series and EIA weekly inventories from Postgres. Weekly series lag 5 days (SPEC 5.1). */
export class MacroService {
  constructor(private readonly db: Db = defaultDb) {}

  /** `energyExposure` false leaves the inventories null (SPEC 5.5). */
  async snapshot(asOf: Date, energyExposure = true): Promise<MacroSnapshot> {
    const since = (days: number) => addDays(lastDailyDate(asOf), -days);
    const [vix, dgs10, dollar, dff] = await Promise.all([
      this.series("VIXCLS", since(VIX_Z_LOOKBACK_DAYS * 2), asOf),
      this.series("DGS10", since(90), asOf),
      this.series("DTWEXBGS", since(90), asOf),
      this.series("DFF", since(30), asOf),
    ]);
    const inventory = async (id: string) =>
      energyExposure ? inventoryVsFiveYear(await this.series(id, since(366 * INVENTORY_YEARS + 30), asOf)) : null;
    const fedFunds = dff.at(-1);
    if (!fedFunds) throw new Error("no DFF value at as-of");
    return {
      asOf: asOf.toISOString(),
      gasolineStocks: await inventory("WGTSTUS1"),
      crudeStocks: await inventory("WCESTUS1"),
      vix: vixReading(vix),
      // DGS10 is in percent: the change is in percentage points. The dollar index change is a fraction.
      yield10y: withChange(dgs10, "points", "DGS10"),
      dollarIndex: withChange(dollar, "ratio", "DTWEXBGS"),
      fedFunds: fedFunds.value,
    };
  }

  async series(id: string, from: string | undefined, asOf: Date): Promise<MacroObservation[]> {
    const conditions = [eq(macroObservations.seriesId, id), lte(macroObservations.date, cutoffFor(id, asOf))];
    if (from) conditions.push(gte(macroObservations.date, from));
    return this.db
      .select({ seriesId: macroObservations.seriesId, date: macroObservations.date, value: macroObservations.value })
      .from(macroObservations)
      .where(and(...conditions))
      .orderBy(asc(macroObservations.date));
  }

  async latest(id: string, asOf: Date): Promise<MacroObservation | null> {
    const [row] = await this.db
      .select({ seriesId: macroObservations.seriesId, date: macroObservations.date, value: macroObservations.value })
      .from(macroObservations)
      .where(and(eq(macroObservations.seriesId, id), lte(macroObservations.date, cutoffFor(id, asOf))))
      .orderBy(desc(macroObservations.date))
      .limit(1);
    return row ?? null;
  }
}
