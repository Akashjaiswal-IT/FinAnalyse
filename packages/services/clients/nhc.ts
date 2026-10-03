import type { Storm, StormPoint } from "@repo/contracts";
import { z } from "zod";
import type { HttpClient } from "./http";

// NHC active storms and NOAA tropical MapServer forecast points (SPEC 5.8). Fields may be null or missing
// (ROADMAP gotcha 5), so everything beyond id, bin and name is optional.

const Product = z.object({ advNum: z.string().optional(), issuance: z.string().optional() }).nullable().optional();

export const NhcStorm = z.object({
  id: z.string(),
  binNumber: z.string(),
  name: z.string(),
  classification: z.string().nullable().optional(),
  intensity: z.string().nullable().optional(),
  pressure: z.string().nullable().optional(),
  latitudeNumeric: z.number().nullable().optional(),
  longitudeNumeric: z.number().nullable().optional(),
  movementDir: z.number().nullable().optional(),
  movementSpeed: z.number().nullable().optional(),
  lastUpdate: z.string().nullable().optional(),
  publicAdvisory: Product,
  forecastAdvisory: Product,
});
export type NhcStorm = z.infer<typeof NhcStorm>;

export const NhcCurrentStorms = z.object({ activeStorms: z.array(NhcStorm) });

export const MapServerLayers = z.object({ layers: z.array(z.object({ id: z.number(), name: z.string() })) });

export const ForecastPointsQuery = z.object({
  features: z.array(
    z.object({
      attributes: z.object({
        stormname: z.string().nullable().optional(),
        stormtype: z.string().nullable().optional(),
        advisnum: z.string().nullable().optional(),
        tau: z.number(),
        maxwind: z.number(),
        mslp: z.number().nullable().optional(),
        validtime: z.string(),
        binnumber: z.string().nullable().optional(),
      }),
      geometry: z.object({ x: z.number(), y: z.number() }),
    }),
  ),
});
export type ForecastPointsQuery = z.infer<typeof ForecastPointsQuery>;

const MAPSERVER = "https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer";
const MISSING = 9999;

const NoaaEnv = z.object({ NOAA_USER_AGENT: z.string().min(1, "NOAA_USER_AGENT is required") });

export function stormFromNhc(s: NhcStorm, season: number): Storm {
  return { id: s.id.toUpperCase(), name: s.name, season, source: "nhc" };
}

/** Atlantic storms only (bins AT1 to AT5). */
export function isAtlantic(s: NhcStorm): boolean {
  return s.binNumber.startsWith("AT");
}

/** The current position as an observed point, valid at `lastUpdate`. */
export function currentPoint(s: NhcStorm): StormPoint | null {
  const wind = Number(s.intensity);
  if (s.latitudeNumeric == null || s.longitudeNumeric == null || !s.lastUpdate || !Number.isFinite(wind)) return null;
  const pressure = Number(s.pressure);
  return {
    stormId: s.id.toUpperCase(),
    kind: "observed",
    issuedAt: new Date(s.lastUpdate).toISOString(),
    validAt: new Date(s.lastUpdate).toISOString(),
    lat: s.latitudeNumeric,
    lon: s.longitudeNumeric,
    windKt: wind,
    pressureMb: Number.isFinite(pressure) ? pressure : null,
    status: s.classification ?? null,
    recordId: null,
  };
}

/**
 * `validtime` is `DD/HHMM` UTC without month or year; it is resolved against the advisory time.
 * A day far below the advisory day rolls into the next month.
 */
export function resolveValidTime(validtime: string, issuedAt: Date): Date {
  const m = /^(\d{2})\/(\d{2})(\d{2})$/.exec(validtime);
  if (!m) throw new Error(`unexpected validtime ${validtime}`);
  const day = Number(m[1]);
  let year = issuedAt.getUTCFullYear();
  let month = issuedAt.getUTCMonth();
  if (day < issuedAt.getUTCDate() - 15) {
    month += 1;
    if (month === 12) {
      month = 0;
      year += 1;
    }
  }
  return new Date(Date.UTC(year, month, day, Number(m[2]), Number(m[3])));
}

/** Forecast points from the `<bin> Forecast Points` layer. The geometry carries 0.1-degree positions;
 * the `lat`/`lon` attributes are rounded to whole degrees, so they are not used. */
export function parseForecastPoints(stormId: string, body: ForecastPointsQuery, issuedAt: Date): StormPoint[] {
  return body.features
    .map((f) => ({
      stormId: stormId.toUpperCase(),
      kind: "forecast" as const,
      issuedAt: issuedAt.toISOString(),
      validAt: resolveValidTime(f.attributes.validtime, issuedAt).toISOString(),
      lat: Math.round(f.geometry.y * 10) / 10,
      lon: Math.round(f.geometry.x * 10) / 10,
      windKt: f.attributes.maxwind,
      pressureMb: f.attributes.mslp != null && f.attributes.mslp !== MISSING ? f.attributes.mslp : null,
      status: f.attributes.stormtype ?? null,
      recordId: null,
    }))
    .sort((a, b) => a.validAt.localeCompare(b.validAt));
}

export class NhcClient {
  private layerIds: Map<string, number> | null = null;

  constructor(private readonly http: HttpClient) {}

  private headers(): Record<string, string> {
    return { "User-Agent": NoaaEnv.parse(process.env).NOAA_USER_AGENT };
  }

  async currentStorms(): Promise<NhcStorm[]> {
    const body = await this.http.request({
      source: "nhc",
      url: "https://www.nhc.noaa.gov/CurrentStorms.json",
      headers: this.headers(),
      schema: NhcCurrentStorms,
    });
    return body.activeStorms;
  }

  /** Layer ids differ between services, so they are looked up by name (ROADMAP gotcha 5). */
  async forecastPointsLayerId(binNumber: string): Promise<number | null> {
    if (!this.layerIds) {
      const body = await this.http.request({
        source: "nhc",
        url: `${MAPSERVER}?f=json`,
        headers: this.headers(),
        schema: MapServerLayers,
        timeoutMs: 30_000,
      });
      this.layerIds = new Map(body.layers.map((l) => [l.name, l.id]));
    }
    return this.layerIds.get(`${binNumber} Forecast Points`) ?? null;
  }

  async forecastPoints(storm: NhcStorm): Promise<StormPoint[]> {
    const layer = await this.forecastPointsLayerId(storm.binNumber);
    const issuance = storm.forecastAdvisory?.issuance ?? storm.publicAdvisory?.issuance ?? storm.lastUpdate;
    if (layer === null || !issuance) return [];
    const params = new URLSearchParams({ where: "1=1", outFields: "*", returnGeometry: "true", f: "json" });
    const body = await this.http.request({
      source: "nhc",
      url: `${MAPSERVER}/${layer}/query?${params}`,
      headers: this.headers(),
      schema: ForecastPointsQuery,
      timeoutMs: 30_000,
    });
    return parseForecastPoints(storm.id, body, new Date(issuance));
  }
}
