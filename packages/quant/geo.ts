import {
  GULF_BOX,
  GULF_COAST_BOX,
  HUBS,
  IMPACT_RADIUS_KM,
  IMPACT_WIND_KT,
  LANDFALL_REGIONS,
  RECENT_OBSERVED_HOURS,
  SAFFIR_SIMPSON_KT,
} from "@repo/contracts";
import type { AtRiskRefinery, Box, LandfallRegion, Refinery, StormPoint } from "@repo/contracts";

/** A storm position at a time. `validAt` is an ISO datetime (UTC). */
export interface TrackPoint {
  validAt: string;
  lat: number;
  lon: number;
  windKt: number;
}

export const EARTH_RADIUS_KM = 6371.0088;

const HOUR_MS = 3_600_000;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in km. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Linear interpolation of position and wind to `stepHours` steps (default 1) between consecutive points. */
export function interpolateTrack(points: readonly TrackPoint[], stepHours = 1): TrackPoint[] {
  if (!(stepHours > 0)) throw new RangeError(`stepHours must be positive, got ${stepHours}`);
  const sorted = [...points].sort((a, b) => Date.parse(a.validAt) - Date.parse(b.validAt));
  const out: TrackPoint[] = [];
  const step = stepHours * HOUR_MS;
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i] as TrackPoint;
    const next = sorted[i + 1];
    const t0 = Date.parse(p.validAt);
    if (!next) {
      out.push(p);
      break;
    }
    const t1 = Date.parse(next.validAt);
    if (t1 === t0) continue; // duplicate time: the later point wins at its own turn
    for (let t = t0; t < t1; t += step) {
      const f = (t - t0) / (t1 - t0);
      out.push({
        validAt: new Date(t).toISOString(),
        lat: p.lat + f * (next.lat - p.lat),
        lon: p.lon + f * (next.lon - p.lon),
        windKt: p.windKt + f * (next.windKt - p.windKt),
      });
    }
  }
  return out;
}

/**
 * Track points that can affect assets at `asOf` (SPEC 5.8): observed points in the `recentHours` (default 12)
 * up to `asOf`, plus every forecast point after `asOf`. Sorted by time.
 */
export function impactSourcePoints(
  points: readonly StormPoint[],
  asOf: string,
  recentHours = RECENT_OBSERVED_HOURS,
): TrackPoint[] {
  const now = Date.parse(asOf);
  const from = now - recentHours * HOUR_MS;
  return points
    .filter((p) => {
      const t = Date.parse(p.validAt);
      return p.kind === "observed" ? t >= from && t <= now : t > now;
    })
    .sort((a, b) => Date.parse(a.validAt) - Date.parse(b.validAt))
    .map((p) => ({ validAt: p.validAt, lat: p.lat, lon: p.lon, windKt: p.windKt }));
}

/** Interpolates to hourly steps and keeps points with wind of at least `minWindKt` (default 64). */
export function impactPoints(points: readonly TrackPoint[], minWindKt = IMPACT_WIND_KT): TrackPoint[] {
  return interpolateTrack(points, 1).filter((p) => p.windKt >= minWindKt);
}

/** Refineries within `radiusKm` (default 100) of any impact point, each once, with the nearest distance. */
export function refineriesAtRisk(
  refineries: readonly Refinery[],
  impact: readonly TrackPoint[],
  radiusKm = IMPACT_RADIUS_KM,
): AtRiskRefinery[] {
  const out: AtRiskRefinery[] = [];
  for (const r of refineries) {
    let nearest = Infinity;
    for (const p of impact) nearest = Math.min(nearest, haversineKm(r.lat, r.lon, p.lat, p.lon));
    if (nearest <= radiusKm) out.push({ ...r, distanceKm: nearest });
  }
  return out;
}

export interface CapacityAtRisk {
  refineryCount: number;
  /** At-risk PADD 3 capacity. */
  atRiskBpd: number;
  /** Total PADD 3 capacity. */
  padd3Bpd: number;
  /** At-risk PADD 3 capacity over the PADD 3 total. */
  gulfShare: number;
  /** Per ticker: at-risk capacity over the company's total capacity in `refineries`. Companies at risk only. */
  company: Record<string, number>;
}

/** Gulf Coast and per-company capacity at risk (SPEC 5.8). */
export function capacityAtRisk(refineries: readonly Refinery[], atRisk: readonly AtRiskRefinery[]): CapacityAtRisk {
  const unique = new Map(atRisk.map((r) => [r.id, r] as const));
  const padd3Bpd = refineries.filter((r) => r.padd === 3).reduce((s, r) => s + r.capacityBpd, 0);
  const atRiskBpd = [...unique.values()].filter((r) => r.padd === 3).reduce((s, r) => s + r.capacityBpd, 0);

  const totals = new Map<string, number>();
  for (const r of refineries) if (r.ticker) totals.set(r.ticker, (totals.get(r.ticker) ?? 0) + r.capacityBpd);
  const risk = new Map<string, number>();
  for (const r of unique.values()) if (r.ticker) risk.set(r.ticker, (risk.get(r.ticker) ?? 0) + r.capacityBpd);
  const company: Record<string, number> = {};
  for (const [ticker, bpd] of risk) {
    const total = totals.get(ticker) ?? 0;
    if (bpd > 0 && total > 0) company[ticker] = bpd / total;
  }
  return {
    refineryCount: unique.size,
    atRiskBpd,
    padd3Bpd,
    gulfShare: padd3Bpd > 0 ? atRiskBpd / padd3Bpd : 0,
    company,
  };
}

/** Saffir-Simpson category 1 to 5 from knots; 0 below hurricane strength (SPEC 5.8). */
export function saffirSimpsonCategory(windKt: number): number {
  return SAFFIR_SIMPSON_KT.filter((bound) => windKt >= bound).length;
}

export function peakCategory(points: readonly { windKt: number }[]): number {
  if (points.length === 0) return 0;
  return saffirSimpsonCategory(Math.max(...points.map((p) => p.windKt)));
}

export function nearestLandfallRegion(lat: number, lon: number): { region: LandfallRegion; distanceKm: number } {
  let best: { region: LandfallRegion; distanceKm: number } | null = null;
  for (const [region, anchor] of Object.entries(LANDFALL_REGIONS) as [LandfallRegion, { lat: number; lon: number }][]) {
    const distanceKm = haversineKm(lat, lon, anchor.lat, anchor.lon);
    if (!best || distanceKm < best.distanceKm) best = { region, distanceKm };
  }
  return best as { region: LandfallRegion; distanceKm: number };
}

export function inBox(lat: number, lon: number, box: Box): boolean {
  return lat >= box.latMin && lat <= box.latMax && lon >= box.lonMin && lon <= box.lonMax;
}

/** Mean latitude and longitude of `HUBS`. */
export function hubCentroid(): { lat: number; lon: number } {
  return {
    lat: HUBS.reduce((s, h) => s + h.lat, 0) / HUBS.length,
    lon: HUBS.reduce((s, h) => s + h.lon, 0) / HUBS.length,
  };
}

export interface Landfall {
  point: StormPoint;
  method: "hurdat2_record" | "closest_approach";
}

/**
 * HURDAT2 landfall (SPEC 10.5): the first observed `L` record inside `GULF_COAST_BOX`, else the observed point
 * closest to the hub centroid. Null when there are no observed points.
 */
export function findLandfall(points: readonly StormPoint[]): Landfall | null {
  const observed = points
    .filter((p) => p.kind === "observed")
    .sort((a, b) => Date.parse(a.validAt) - Date.parse(b.validAt));
  const record = observed.find((p) => p.recordId === "L" && inBox(p.lat, p.lon, GULF_COAST_BOX));
  if (record) return { point: record, method: "hurdat2_record" };
  const centre = hubCentroid();
  let best: StormPoint | null = null;
  let bestKm = Infinity;
  for (const p of observed) {
    const km = haversineKm(p.lat, p.lon, centre.lat, centre.lon);
    if (km < bestKm) {
      best = p;
      bestKm = km;
    }
  }
  return best ? { point: best, method: "closest_approach" } : null;
}

/** At least one observed point of 64 kt or more inside `GULF_BOX` (SPEC 10.5). */
export function isGulfHurricane(points: readonly StormPoint[]): boolean {
  return points.some((p) => p.kind === "observed" && p.windKt >= IMPACT_WIND_KT && inBox(p.lat, p.lon, GULF_BOX));
}

/** Maximum wind among points with `from <= validAt <= to`; null when none. */
export function maxWindBetween(
  points: readonly { validAt: string; windKt: number }[],
  from: string,
  to: string,
): number | null {
  const lo = Date.parse(from);
  const hi = Date.parse(to);
  let max: number | null = null;
  for (const p of points) {
    const t = Date.parse(p.validAt);
    if (t >= lo && t <= hi && (max === null || p.windKt > max)) max = p.windKt;
  }
  return max;
}

/** Share of hurricane-force points (at least `IMPACT_WIND_KT`) that lie inside `box`; null when there are none. */
export function hurricaneShareInBox(points: readonly TrackPoint[], box: Box): number | null {
  const strong = points.filter((p) => p.windKt >= IMPACT_WIND_KT);
  if (strong.length === 0) return null;
  return strong.filter((p) => inBox(p.lat, p.lon, box)).length / strong.length;
}
