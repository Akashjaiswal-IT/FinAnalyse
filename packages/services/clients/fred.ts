import type { MacroObservation } from "@repo/contracts";
import { z } from "zod";
import type { HttpClient } from "./http";

export const FredObservations = z.object({
  observations: z.array(z.object({ date: z.string(), value: z.string() })),
});
export type FredObservations = z.infer<typeof FredObservations>;

export const FredSeries = z.object({
  seriess: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      frequency_short: z.string(),
      observation_start: z.string(),
      observation_end: z.string(),
      last_updated: z.string(),
      units_short: z.string(),
    }),
  ),
});

const FredEnv = z.object({ FRED_API_KEY: z.string().min(1, "FRED_API_KEY is required") });

/** FRED sends missing values as "."; those rows are skipped (SPEC 6). */
export function parseFredObservations(seriesId: string, body: FredObservations): MacroObservation[] {
  return body.observations.flatMap((o) => {
    if (o.value === ".") return [];
    const value = Number(o.value);
    return Number.isFinite(value) ? [{ seriesId, date: o.date, value }] : [];
  });
}

export class FredClient {
  constructor(private readonly http: HttpClient) {}

  async observations(seriesId: string, start: string, end?: string): Promise<MacroObservation[]> {
    const { FRED_API_KEY } = FredEnv.parse(process.env);
    const params = new URLSearchParams({
      series_id: seriesId,
      api_key: FRED_API_KEY,
      file_type: "json",
      observation_start: start,
    });
    if (end) params.set("observation_end", end);
    const body = await this.http.request({
      source: "fred",
      url: `https://api.stlouisfed.org/fred/series/observations?${params}`,
      schema: FredObservations,
    });
    return parseFredObservations(seriesId, body);
  }
}
