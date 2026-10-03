import {
  HUB_FORECAST_HOURS,
  HYPOTHETICAL_START,
  HYPOTHETICAL_WIND_KT,
  IMPACT_RADIUS_KM,
  IMPACT_WIND_KT,
  LANDFALL_REGIONS,
  LIVE_PERSISTENCE_HOURS,
  RECENT_OBSERVED_HOURS,
  REPLAY_FORECAST_HOURS,
  type AtRiskRefinery,
  type HubForecast,
  type HypotheticalStormParams,
  type LandfallRegion,
  type Refinery,
  type Storm,
  type StormPoint,
  type StormTrack,
  type TrackLabel,
} from "@repo/contracts";
import defaultDb, { and, asc, desc, eq, gt, lte } from "@repo/database";
import { refineries as refineryTable, stormPoints, storms, type StormPointRow } from "@repo/database/schema";
import { OpenMeteoClient } from "../clients/openmeteo";
import type { Maybe } from "../news";
import { haversineKm, interpolateHourly, toTrackPoint } from "./geo";

type Db = typeof defaultDb;

const HOUR = 3_600_000;
export const HYPOTHETICAL_STORM_ID = "HYPOTHETICAL";
const STEP_HOURS = 6;
const INLAND_HOURS = 12;
const HUB_CACHE_SECONDS = 3_600;

function toPoint(r: StormPointRow): StormPoint {
  return {
    stormId: r.stormId,
    kind: r.kind as StormPoint["kind"],
    issuedAt: r.issuedAt.toISOString(),
    validAt: r.validAt.toISOString(),
    lat: r.lat,
    lon: r.lon,
    windKt: r.windKt,
    pressureMb: r.pressureMb,
    status: r.status,
    recordId: r.recordId,
  };
}

/**
 * Refineries within `IMPACT_RADIUS_KM` of any impact point: forecast points, plus observed points from the
 * last 12 hours before `asOf`, with wind of at least 64 kt, interpolated to 1-hour steps (SPEC 5.8).
 * Each refinery is counted once, with its distance to the nearest impact point.
 */
export function atRiskRefineries(points: readonly StormPoint[], refineries: readonly Refinery[], asOf: Date): AtRiskRefinery[] {
  const recent = asOf.getTime() - RECENT_OBSERVED_HOURS * HOUR;
  const relevant = points.filter((p) => p.kind === "forecast" || Date.parse(p.validAt) >= recent).map(toTrackPoint);
  const impact = interpolateHourly(relevant).filter((p) => p.windKt >= IMPACT_WIND_KT);
  if (impact.length === 0) return [];
  return refineries
    .map((r) => ({ ...r, distanceKm: Math.min(...impact.map((p) => haversineKm(r.lat, r.lon, p.lat, p.lon))) }))
    .filter((r) => r.distanceKm <= IMPACT_RADIUS_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/**
 * Live fallback when no NHC forecast points exist: a 48-hour track continuing the bearing and speed of the
 * last two observed points, wind held constant, 6-hourly (SPEC 5.8). Null with fewer than two points.
 */
export function persistenceTrack(observed: readonly StormPoint[], asOf: Date): StormPoint[] | null {
  const [a, b] = observed.slice(-2);
  if (!a || !b) return null;
  const dt = Date.parse(b.validAt) - Date.parse(a.validAt);
  if (dt <= 0) return null;
  const out: StormPoint[] = [];
  for (let h = STEP_HOURS; h <= LIVE_PERSISTENCE_HOURS; h += STEP_HOURS) {
    const f = (h * HOUR) / dt;
    out.push({
      ...b,
      kind: "forecast",
      issuedAt: asOf.toISOString(),
      validAt: new Date(Date.parse(b.validAt) + h * HOUR).toISOString(),
      lat: b.lat + f * (b.lat - a.lat),
      lon: b.lon + f * (b.lon - a.lon),
      pressureMb: null,
      recordId: null,
    });
  }
  return out;
}

/**
 * SPEC 5.12: 6-hourly straight line from 24.5N 89.0W to the region anchor, reached `hoursToLandfall` after
 * `asOf`; wind 75, 90, 105, 125 or 145 kt by category until landfall; then one inland point 12 hours later
 * at half wind, continuing the same bearing at the same speed.
 */
export function buildHypotheticalTrack(params: HypotheticalStormParams, asOf: Date): StormPoint[] {
  const anchor = LANDFALL_REGIONS[params.region as LandfallRegion];
  if (!anchor) throw new Error(`unknown landfall region ${params.region}`);
  const wind = HYPOTHETICAL_WIND_KT[params.category - 1]!;
  const hours = params.hoursToLandfall;
  const point = (h: number, lat: number, lon: number, windKt: number, recordId: string | null): StormPoint => ({
    stormId: HYPOTHETICAL_STORM_ID,
    kind: "forecast",
    issuedAt: asOf.toISOString(),
    validAt: new Date(asOf.getTime() + h * HOUR).toISOString(),
    lat,
    lon,
    windKt,
    pressureMb: null,
    status: "HU",
    recordId,
  });
  const at = (h: number) => {
    const f = h / hours;
    return [HYPOTHETICAL_START.lat + f * (anchor.lat - HYPOTHETICAL_START.lat), HYPOTHETICAL_START.lon + f * (anchor.lon - HYPOTHETICAL_START.lon)] as const;
  };
  const out: StormPoint[] = [];
  for (let h = 0; h < hours; h += STEP_HOURS) out.push(point(h, ...at(h), wind, null));
  out.push(point(hours, anchor.lat, anchor.lon, wind, "L"));
  const [inLat, inLon] = at(hours + INLAND_HOURS);
  out.push(point(hours + INLAND_HOURS, inLat, inLon, Math.round(wind / 2), null));
  return out;
}

/** Storms, tracks and refineries (SPEC 5.8, 5.12). */
export class WeatherService {
  constructor(private readonly db: Db = defaultDb) {}

  /** Storms with an observed point in the 12 hours up to `asOf` (HURDAT2 in replay; NHC rows from the worker live). */
  async stormsAt(asOf: Date): Promise<Storm[]> {
    const since = new Date(asOf.getTime() - RECENT_OBSERVED_HOURS * HOUR);
    const rows = await this.db
      .selectDistinct({ id: storms.id, name: storms.name, season: storms.season, source: storms.source })
      .from(storms)
      .innerJoin(stormPoints, eq(stormPoints.stormId, storms.id))
      .where(and(eq(stormPoints.kind, "observed"), gt(stormPoints.validAt, since), lte(stormPoints.validAt, asOf)))
      .orderBy(asc(storms.id));
    return rows.map((r) => ({ ...r, source: r.source as Storm["source"] }));
  }

  /**
   * Observed points up to `asOf` plus forecast points: the latest NHC advisory issued by `asOf` (live), or the
   * next 72 hours of best track labelled `perfect_forecast_replay` (HURDAT2 replay), or the persistence
   * fallback. With at-risk refineries.
   */
  async track(stormId: string, asOf: Date): Promise<StormTrack | null> {
    const [storm] = await this.db.select().from(storms).where(eq(storms.id, stormId.toUpperCase()));
    if (!storm) return null;
    const observed = (
      await this.db
        .select()
        .from(stormPoints)
        .where(and(eq(stormPoints.stormId, storm.id), eq(stormPoints.kind, "observed"), lte(stormPoints.validAt, asOf)))
        .orderBy(asc(stormPoints.validAt))
    ).map(toPoint);

    let forecast: StormPoint[] = [];
    let label: TrackLabel | null = null;
    if (storm.source === "hurdat2") {
      const end = new Date(asOf.getTime() + REPLAY_FORECAST_HOURS * HOUR);
      forecast = (
        await this.db
          .select()
          .from(stormPoints)
          .where(and(eq(stormPoints.stormId, storm.id), eq(stormPoints.kind, "observed"), gt(stormPoints.validAt, asOf), lte(stormPoints.validAt, end)))
          .orderBy(asc(stormPoints.validAt))
      ).map((r) => ({ ...toPoint(r), kind: "forecast" as const, issuedAt: asOf.toISOString() }));
      label = forecast.length ? "perfect_forecast_replay" : null;
    } else {
      const [latest] = await this.db
        .select({ issuedAt: stormPoints.issuedAt })
        .from(stormPoints)
        .where(and(eq(stormPoints.stormId, storm.id), eq(stormPoints.kind, "forecast"), lte(stormPoints.issuedAt, asOf)))
        .orderBy(desc(stormPoints.issuedAt))
        .limit(1);
      if (latest) {
        forecast = (
          await this.db
            .select()
            .from(stormPoints)
            .where(and(eq(stormPoints.stormId, storm.id), eq(stormPoints.kind, "forecast"), eq(stormPoints.issuedAt, latest.issuedAt)))
            .orderBy(asc(stormPoints.validAt))
        ).map(toPoint);
        label = "nhc_forecast";
      } else {
        forecast = persistenceTrack(observed, asOf) ?? [];
        label = forecast.length ? "persistence_forecast" : null;
      }
    }

    const points = [...observed, ...forecast];
    return {
      storm: { id: storm.id, name: storm.name, season: storm.season, source: storm.source as Storm["source"] },
      asOf: asOf.toISOString(),
      points,
      forecastLabel: label,
      atRiskRefineries: atRiskRefineries(points, await this.refineries(), asOf),
    };
  }

  async hypotheticalTrack(params: HypotheticalStormParams, asOf: Date): Promise<StormTrack> {
    const points = buildHypotheticalTrack(params, asOf);
    return {
      storm: { id: HYPOTHETICAL_STORM_ID, name: `Hypothetical Category ${params.category}`, season: asOf.getUTCFullYear(), source: "nhc" },
      asOf: asOf.toISOString(),
      points,
      forecastLabel: "hypothetical",
      atRiskRefineries: atRiskRefineries(points, await this.refineries(), asOf),
    };
  }

  async refineries(): Promise<Refinery[]> {
    return this.db.select().from(refineryTable).orderBy(asc(refineryTable.id));
  }


  /** Live only: maximum gust and precipitation in the next 120 hours at each hub (Open-Meteo, cached 1 hour). */
  async hubForecasts(now = new Date()): Promise<Maybe<HubForecast[]>> {
    // Loaded lazily: `@repo/logger` (through default-http) rejects NODE_ENV=test at import.
    const { defaultHttp } = await import("../clients/default-http");
    const http = defaultHttp();
    try {
      const hour = now.toISOString().slice(0, 13);
      return await http.cached("openmeteo", `hubs:${hour}:${HUB_FORECAST_HOURS}`, HUB_CACHE_SECONDS, () =>
        new OpenMeteoClient(http).hubForecasts(now),
      );
    } catch (error) {
      return { unavailable: error instanceof Error ? error.message : String(error) };
    }
  }
}

