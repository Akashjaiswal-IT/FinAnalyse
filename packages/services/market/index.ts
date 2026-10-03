import type { AssetClass, Instrument, PriceBar, RealizedMove, Sector } from "@repo/contracts";
import defaultDb, { and, asc, desc, eq, gt, gte, inArray, lte } from "@repo/database";
import { instruments, priceBars, type PriceBarRow } from "@repo/database/schema";
import { addDays, lastDailyDate } from "../as-of";
import type { CloseAt, ReturnsMatrix } from "./model";

export * from "./model";

type Db = typeof defaultDb;

export const BARS_FROM = "2015-01-01";
export const ADV_DAYS = 20;

function toBar(r: PriceBarRow): PriceBar {
  return {
    symbol: r.symbol,
    date: r.date,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    adjClose: r.adjClose,
    volume: r.volume,
  };
}

/**
 * Aligns adjusted closes on the dates every symbol has (inner join, ROADMAP gotcha 14) and returns the
 * last `lookback` daily log returns. Fewer rows come back when history is shorter. A date where any
 * close is not positive (WTI settled at -36.98 on 2020-04-20) has no log return and is dropped, so the
 * next return spans the gap.
 */
export function alignReturns(
  symbols: readonly string[],
  closes: ReadonlyMap<string, ReadonlyMap<string, number>>,
  lookback: number,
): ReturnsMatrix {
  const sets = symbols.map((s) => closes.get(s) ?? new Map<string, number>());
  const common = [...(sets[0]?.keys() ?? [])]
    .filter((d) => sets.every((m) => (m.get(d) ?? 0) > 0))
    .sort();
  const dates = common.slice(-(lookback + 1));
  const returns: number[][] = [];
  for (let i = 1; i < dates.length; i++) {
    returns.push(sets.map((m) => Math.log(m.get(dates[i]!)! / m.get(dates[i - 1]!)!)));
  }
  return { symbols: [...symbols], dates: dates.slice(1), returns };
}

/** Prices from Postgres (Tiingo and FRED factors). Every read takes `asOf` (SPEC 5.1). */
export class MarketService {
  constructor(private readonly db: Db = defaultDb) {}

  async instruments(): Promise<Instrument[]> {
    const rows = await this.db.select().from(instruments).orderBy(asc(instruments.symbol));
    return rows.map((r) => ({
      symbol: r.symbol,
      name: r.name,
      assetClass: r.assetClass as AssetClass,
      sector: r.sector as Sector | null,
      tradable: r.tradable,
      source: r.source as "tiingo" | "fred",
      sourceRef: r.sourceRef,
      proxyFor: r.proxyFor,
    }));
  }

  /** Bars from `from` (inclusive, default 2015-01-01) that are available at `asOf`. */
  async bars(symbol: string, from: string | undefined, asOf: Date): Promise<PriceBar[]> {
    const rows = await this.db
      .select()
      .from(priceBars)
      .where(and(eq(priceBars.symbol, symbol), gte(priceBars.date, from ?? BARS_FROM), lte(priceBars.date, lastDailyDate(asOf))))
      .orderBy(asc(priceBars.date));
    return rows.map(toBar);
  }

  /** Symbols with no bar available at `asOf` are left out. */
  async closesAt(symbols: readonly string[], asOf: Date): Promise<CloseAt[]> {
    if (symbols.length === 0) return [];
    const rows = await this.db
      .selectDistinctOn([priceBars.symbol], {
        symbol: priceBars.symbol,
        date: priceBars.date,
        close: priceBars.close,
        adjClose: priceBars.adjClose,
      })
      .from(priceBars)
      .where(and(inArray(priceBars.symbol, [...symbols]), lte(priceBars.date, lastDailyDate(asOf))))
      .orderBy(priceBars.symbol, desc(priceBars.date));
    return rows;
  }

  /** The last `lookback` aligned daily log returns available at `asOf`. */
  async returns(symbols: readonly string[], lookback: number, asOf: Date): Promise<ReturnsMatrix> {
    if (symbols.length === 0) return { symbols: [], dates: [], returns: [] };
    const cutoff = lastDailyDate(asOf);
    // Calendars differ between symbols (holidays, FRED gaps), so read a generous window and widen it
    // until enough common dates exist or history runs out.
    for (let days = Math.ceil(lookback * 1.6) + 60; ; days *= 2) {
      const from = addDays(cutoff, -days);
      const rows = await this.db
        .select({ symbol: priceBars.symbol, date: priceBars.date, adjClose: priceBars.adjClose })
        .from(priceBars)
        .where(and(inArray(priceBars.symbol, [...symbols]), gte(priceBars.date, from), lte(priceBars.date, cutoff)));
      const closes = new Map<string, Map<string, number>>();
      for (const r of rows) {
        if (!closes.has(r.symbol)) closes.set(r.symbol, new Map());
        closes.get(r.symbol)!.set(r.date, r.adjClose);
      }
      const matrix = alignReturns(symbols, closes, lookback);
      if (matrix.returns.length >= lookback || from <= BARS_FROM) return matrix;
    }
  }

  /** 20-day average dollar volume at `asOf`; null when the symbol has no volume (FRED factors). */
  async adv(symbol: string, asOf: Date): Promise<number | null> {
    const rows = await this.db
      .select({ close: priceBars.close, volume: priceBars.volume })
      .from(priceBars)
      .where(and(eq(priceBars.symbol, symbol), lte(priceBars.date, lastDailyDate(asOf))))
      .orderBy(desc(priceBars.date))
      .limit(ADV_DAYS);
    if (rows.length === 0 || rows.some((r) => r.volume === null)) return null;
    return rows.reduce((s, r) => s + r.close * (r.volume ?? 0), 0) / rows.length;
  }

  /**
   * Replay only (P2, "what happened next", outside the run): log return from the last close at `asOf`
   * to the close `horizonDays` trading days later. This is the one read that looks past `asOf`.
   */
  async realized(symbols: readonly string[], asOf: Date, horizonDays: number): Promise<RealizedMove[]> {
    const start = await this.closesAt(symbols, asOf);
    return Promise.all(
      symbols.map(async (symbol) => {
        const s = start.find((c) => c.symbol === symbol);
        if (!s) return { symbol, logReturn: null };
        const later = await this.db
          .select({ adjClose: priceBars.adjClose })
          .from(priceBars)
          .where(and(eq(priceBars.symbol, symbol), gt(priceBars.date, s.date)))
          .orderBy(asc(priceBars.date))
          .offset(horizonDays - 1)
          .limit(1);
        const end = later[0];
        return { symbol, logReturn: end ? Math.log(end.adjClose / s.adjClose) : null };
      }),
    );
  }
}

