import { z } from "zod";
import { AssetClass, IsoDate, IsoDateTime, Sector } from "./common";

export const Instrument = z.object({
  symbol: z.string(),
  name: z.string(),
  assetClass: AssetClass,
  sector: Sector.nullable(),
  tradable: z.boolean(),
  source: z.enum(["tiingo", "fred"]),
  sourceRef: z.string().nullable(),
  proxyFor: z.string().nullable(),
});
export type Instrument = z.infer<typeof Instrument>;

export const PriceBar = z.object({
  symbol: z.string(),
  date: IsoDate,
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  adjClose: z.number(),
  volume: z.number().nullable(),
});
export type PriceBar = z.infer<typeof PriceBar>;

export const MarketBarsInput = z.object({
  symbol: z.string(),
  from: IsoDate.optional(),
  asOf: IsoDateTime.optional(),
});
export type MarketBarsInput = z.infer<typeof MarketBarsInput>;

export const MarketRealizedInput = z.object({
  asOf: IsoDateTime,
  horizonDays: z.coerce.number().int().positive(),
  symbols: z.string().describe("comma-separated symbols"),
});
export type MarketRealizedInput = z.infer<typeof MarketRealizedInput>;

export const RealizedMove = z.object({
  symbol: z.string(),
  logReturn: z.number().nullable(),
});
export type RealizedMove = z.infer<typeof RealizedMove>;

/** A read that may fall back to a stale cache copy or fail, as services return it (SPEC 5.3). */
export function maybeStale<T extends z.ZodType>(data: T) {
  return z.union([
    z.object({ data, stale: z.boolean() }),
    z.object({ unavailable: z.string() }),
  ]);
}
