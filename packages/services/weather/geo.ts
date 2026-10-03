import type { StormPoint } from "@repo/contracts";

// Stand-in for quant/geo.ts (Track C) until `@repo/quant` is a dependency of `services` (Track B request).
// Same rules as SPEC 5.8: haversine distance, 1-hour linear interpolation.

const EARTH_RADIUS_KM = 6371.0088;
const rad = (deg: number) => (deg * Math.PI) / 180;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface TrackPoint {
  at: number;
  lat: number;
  lon: number;
  windKt: number;
}

/** Linear interpolation of position and wind to whole-hour steps between consecutive points. */
export function interpolateHourly(points: readonly TrackPoint[]): TrackPoint[] {
  const sorted = [...points].sort((a, b) => a.at - b.at);
  const out: TrackPoint[] = [];
  const hour = 3_600_000;
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]!;
    const next = sorted[i + 1];
    out.push(p);
    if (!next) break;
    for (let t = Math.floor(p.at / hour) * hour + hour; t < next.at; t += hour) {
      const f = (t - p.at) / (next.at - p.at);
      out.push({
        at: t,
        lat: p.lat + f * (next.lat - p.lat),
        lon: p.lon + f * (next.lon - p.lon),
        windKt: p.windKt + f * (next.windKt - p.windKt),
      });
    }
  }
  return out;
}

export function toTrackPoint(p: StormPoint): TrackPoint {
  return { at: Date.parse(p.validAt), lat: p.lat, lon: p.lon, windKt: p.windKt };
}
