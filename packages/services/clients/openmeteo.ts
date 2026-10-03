import { HUB_FORECAST_HOURS, HUBS, type HubForecast } from "@repo/contracts";
import { z } from "zod";
import type { HttpClient } from "./http";

/** One entry per location, in request order, for a multi-location call. */
export const OpenMeteoForecast = z.array(
  z.object({
    latitude: z.number(),
    longitude: z.number(),
    hourly_units: z.object({ wind_gusts_10m: z.literal("km/h"), precipitation: z.literal("mm") }),
    hourly: z.object({
      time: z.array(z.string()),
      wind_gusts_10m: z.array(z.number().nullable()),
      precipitation: z.array(z.number().nullable()),
    }),
  }),
);
export type OpenMeteoForecast = z.infer<typeof OpenMeteoForecast>;

/** Maximum hourly gust and precipitation per hub over the hours from `now` to `now + hoursAhead`. */
export function parseHubForecasts(body: OpenMeteoForecast, now: Date, hoursAhead = HUB_FORECAST_HOURS): HubForecast[] {
  const end = now.getTime() + hoursAhead * 3_600_000;
  return HUBS.map((hub, i) => {
    const loc = body[i];
    if (!loc) throw new Error(`Open-Meteo returned no entry for ${hub.name}`);
    let gust = 0;
    let precip = 0;
    loc.hourly.time.forEach((t, j) => {
      const at = Date.parse(`${t}Z`);
      if (at < now.getTime() - 3_600_000 || at > end) return;
      gust = Math.max(gust, loc.hourly.wind_gusts_10m[j] ?? 0);
      precip = Math.max(precip, loc.hourly.precipitation[j] ?? 0);
    });
    return { hub: hub.name, lat: hub.lat, lon: hub.lon, maxGustKmh: gust, maxPrecipMm: precip, hoursAhead };
  });
}

/** Wind gust and precipitation at the refining hubs, all in one call (SPEC 4). Non-commercial use. */
export class OpenMeteoClient {
  constructor(private readonly http: HttpClient) {}

  async hubForecasts(now: Date): Promise<HubForecast[]> {
    const params = new URLSearchParams({
      latitude: HUBS.map((h) => h.lat).join(","),
      longitude: HUBS.map((h) => h.lon).join(","),
      hourly: "wind_gusts_10m,precipitation",
      forecast_days: "6",
      timezone: "UTC",
      wind_speed_unit: "kmh",
    });
    const body = await this.http.request({
      source: "openmeteo",
      url: `https://api.open-meteo.com/v1/forecast?${params}`,
      schema: OpenMeteoForecast,
    });
    return parseHubForecasts(body, now);
  }
}
