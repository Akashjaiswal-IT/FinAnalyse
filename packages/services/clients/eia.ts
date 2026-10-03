import type { MacroObservation } from "@repo/contracts";
import { z } from "zod";
import type { HttpClient } from "./http";

// FRED does not carry the weekly inventory series, so they come from the EIA API v2 (docs/DECISIONS.md).

export const EiaSeriesResponse = z.object({
  response: z.object({
    total: z.union([z.number(), z.string()]),
    data: z.array(
      z.object({
        period: z.string(),
        series: z.string(),
        value: z.union([z.number(), z.string()]).nullable(),
        units: z.string(),
      }),
    ),
  }),
});
export type EiaSeriesResponse = z.infer<typeof EiaSeriesResponse>;

const EiaEnv = z.object({ EIA_API_KEY: z.string().min(1, "EIA_API_KEY is required") });

/** Weekly petroleum series such as `WGTSTUS1` (thousand barrels). EIA ignores `start`, so dates are filtered here. */
export function parseEiaSeries(body: EiaSeriesResponse, start?: string): MacroObservation[] {
  return body.response.data
    .flatMap((d) => {
      const value = d.value === null ? NaN : Number(d.value);
      if (!Number.isFinite(value) || (start && d.period < start)) return [];
      return [{ seriesId: d.series, date: d.period, value }];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export class EiaClient {
  constructor(private readonly http: HttpClient) {}

  async weekly(seriesId: string, start?: string): Promise<MacroObservation[]> {
    const { EIA_API_KEY } = EiaEnv.parse(process.env);
    const body = await this.http.request({
      source: "eia",
      url: `https://api.eia.gov/v2/seriesid/PET.${encodeURIComponent(seriesId)}.W?api_key=${EIA_API_KEY}`,
      schema: EiaSeriesResponse,
      timeoutMs: 30_000,
    });
    return parseEiaSeries(body, start);
  }
}
