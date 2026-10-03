import type { Instrument, PriceBar, RealizedMove } from "@repo/contracts";
import { notImplemented } from "../not-implemented";
import type { CloseAt, ReturnsMatrix } from "./model";

export * from "./model";

/** Prices from Postgres (Tiingo and FRED factors). Every read takes `asOf` (SPEC 5.1). */
export class MarketService {
  async instruments(): Promise<Instrument[]> {
    return notImplemented();
  }

  /** Bars from `from` (inclusive, default 2015-01-01) that are available at `asOf`. */
  async bars(symbol: string, from: string | undefined, asOf: Date): Promise<PriceBar[]> {
    return notImplemented(symbol, from, asOf);
  }

  /** Symbols with no bar available at `asOf` are left out. */
  async closesAt(symbols: readonly string[], asOf: Date): Promise<CloseAt[]> {
    return notImplemented(symbols, asOf);
  }

  /** The last `lookback` aligned daily log returns available at `asOf`. */
  async returns(symbols: readonly string[], lookback: number, asOf: Date): Promise<ReturnsMatrix> {
    return notImplemented(symbols, lookback, asOf);
  }

  /** 20-day average dollar volume at `asOf`; null when the symbol has no volume (FRED factors). */
  async adv(symbol: string, asOf: Date): Promise<number | null> {
    return notImplemented(symbol, asOf);
  }

  /** Replay only (P2): log return from the last close at `asOf` over the next `horizonDays` trading days. */
  async realized(symbols: readonly string[], asOf: Date, horizonDays: number): Promise<RealizedMove[]> {
    return notImplemented(symbols, asOf, horizonDays);
  }
}
