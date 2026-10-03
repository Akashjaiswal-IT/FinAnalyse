import type { AtRiskRefinery, Box, LandfallRegion, Refinery, StormPoint } from "@repo/contracts";
import { notImplemented } from "./not-implemented";

/** A storm position at a time. `validAt` is an ISO datetime (UTC). */
export interface TrackPoint {
  validAt: string;
  lat: number;
  lon: number;
  windKt: number;
}

export const EARTH_RADIUS_KM = 6371.0088;

/** Great-circle distance in km. */
export const haversineKm: (lat1: number, lon1: number, lat2: number, lon2: number) => number =
  notImplemented("haversineKm");

/** Linear interpolation of position and wind to `stepHours` steps (default 1) between consecutive points. */
export const interpolateTrack: (points: readonly TrackPoint[], stepHours?: number) => TrackPoint[] =
  notImplemented("interpolateTrack");

/**
 * Track points that can affect assets at `asOf` (SPEC 5.8): observed points in the `recentHours` (default 12)
 * up to `asOf`, plus every forecast point. Sorted by time.
 */
export const impactSourcePoints: (points: readonly StormPoint[], asOf: string, recentHours?: number) => TrackPoint[] =
  notImplemented("impactSourcePoints");

/** Interpolates to hourly steps and keeps points with wind of at least `minWindKt` (default 64). */
export const impactPoints: (points: readonly TrackPoint[], minWindKt?: number) => TrackPoint[] =
  notImplemented("impactPoints");

/** Refineries within `radiusKm` (default 100) of any impact point, each once, with the nearest distance. */
export const refineriesAtRisk: (
  refineries: readonly Refinery[],
  impact: readonly TrackPoint[],
  radiusKm?: number,
) => AtRiskRefinery[] = notImplemented("refineriesAtRisk");

export interface CapacityAtRisk {
  refineryCount: number;
  /** At-risk PADD 3 capacity. */
  atRiskBpd: number;
  /** Total PADD 3 capacity. */
  padd3Bpd: number;
  /** At-risk PADD 3 capacity over the PADD 3 total. */
  gulfShare: number;
  /** Per ticker: at-risk capacity over the company's total capacity in `refineries`. Listed companies only. */
  company: Record<string, number>;
}

/** Gulf Coast and per-company capacity at risk (SPEC 5.8). */
export const capacityAtRisk: (refineries: readonly Refinery[], atRisk: readonly AtRiskRefinery[]) => CapacityAtRisk =
  notImplemented("capacityAtRisk");

/** Saffir-Simpson category 1 to 5 from knots; 0 below hurricane strength (SPEC 5.8). */
export const saffirSimpsonCategory: (windKt: number) => number = notImplemented("saffirSimpsonCategory");

export const peakCategory: (points: readonly { windKt: number }[]) => number = notImplemented("peakCategory");

export const nearestLandfallRegion: (lat: number, lon: number) => { region: LandfallRegion; distanceKm: number } =
  notImplemented("nearestLandfallRegion");

export const inBox: (lat: number, lon: number, box: Box) => boolean = notImplemented("inBox");

/** Mean latitude and longitude of `HUBS`. */
export const hubCentroid: () => { lat: number; lon: number } = notImplemented("hubCentroid");

export interface Landfall {
  point: StormPoint;
  method: "hurdat2_record" | "closest_approach";
}

/**
 * HURDAT2 landfall (SPEC 10.5): the first `L` record inside `GULF_COAST_BOX`, else the point closest to the hub
 * centroid. Null for an empty track.
 */
export const findLandfall: (points: readonly StormPoint[]) => Landfall | null = notImplemented("findLandfall");

/** At least one observed point of 64 kt or more inside `GULF_BOX` (SPEC 10.5). */
export const isGulfHurricane: (points: readonly StormPoint[]) => boolean = notImplemented("isGulfHurricane");

/** Maximum wind among points with `from <= validAt <= to`; null when none. */
export const maxWindBetween: (points: readonly { validAt: string; windKt: number }[], from: string, to: string) => number | null =
  notImplemented("maxWindBetween");

/** Share of hurricane-force points (at least `IMPACT_WIND_KT`) that lie inside `box`; null when there are none. */
export const hurricaneShareInBox: (points: readonly TrackPoint[], box: Box) => number | null =
  notImplemented("hurricaneShareInBox");
