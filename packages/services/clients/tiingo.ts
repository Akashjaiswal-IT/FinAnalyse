import type { PriceBar } from "@repo/contracts";
import { z } from "zod";
import type { HttpClient } from "./http";

export const TiingoDailyRow = z.object({
  date: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
  adjClose: z.number(),
  adjOpen: z.number(),
  adjHigh: z.number(),
  adjLow: z.number(),
  adjVolume: z.number(),
  divCash: z.number(),
  splitFactor: z.number(),
});
export const TiingoDaily = z.array(TiingoDailyRow);
export type TiingoDailyRow = z.infer<typeof TiingoDailyRow>;

const TiingoEnv = z.object({ TIINGO_API_KEY: z.string().min(1, "TIINGO_API_KEY is required") });

/** Raw OHLC plus Tiingo's adjusted close; returns use `adjClose` (SPEC 5.10). */
export function parseTiingoDaily(symbol: string, rows: readonly TiingoDailyRow[]): PriceBar[] {
  return rows.map((r) => ({
    symbol,
    date: r.date.slice(0, 10),
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    adjClose: r.adjClose,
    volume: r.volume,
  }));
}

/** Daily prices. Licence: never commit Tiingo data (ROADMAP gotcha 4). */
export class TiingoClient {
  constructor(private readonly http: HttpClient) {}

  async dailyRaw(symbol: string, startDate: string): Promise<TiingoDailyRow[]> {
    const { TIINGO_API_KEY } = TiingoEnv.parse(process.env);
    const params = new URLSearchParams({ startDate, format: "json" });
    return this.http.request({
      source: "tiingo",
      url: `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(symbol)}/prices?${params}`,
      headers: { Authorization: `Token ${TIINGO_API_KEY}` },
      schema: TiingoDaily,
    });
  }

  async daily(symbol: string, startDate: string): Promise<PriceBar[]> {
    return parseTiingoDaily(symbol, await this.dailyRaw(symbol, startDate));
  }
}
