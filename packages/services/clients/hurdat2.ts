import type { Storm, StormPoint } from "@repo/contracts";
import type { HttpClient } from "./http";
import { z } from "zod";

// HURDAT2 (ROADMAP gotcha 6): header lines and data lines alternate; "90.2W" is -90.2; times are HHMM UTC;
// `L` in the record-identifier column marks landfall; -999 marks a missing value.

export const HURDAT2_URL = "https://www.nhc.noaa.gov/data/hurdat/hurdat2-1851-2025-092326.txt";

export interface Hurdat2Storm {
  storm: Storm;
  points: StormPoint[];
}

function coordinate(value: string): number {
  const m = /^(\d+(?:\.\d+)?)([NSEW])$/.exec(value.trim());
  if (!m) throw new Error(`bad HURDAT2 coordinate ${value}`);
  const n = Number(m[1]);
  return m[2] === "S" || m[2] === "W" ? -n : n;
}

/** Parses the whole file; `fromSeason` drops older storms. */
export function parseHurdat2(text: string, fromSeason = 0): Hurdat2Storm[] {
  const lines = text.split(/\r?\n/);
  const out: Hurdat2Storm[] = [];
  let i = 0;
  while (i < lines.length) {
    const header = lines[i]!.trim();
    i++;
    if (!header) continue;
    const [rawId, rawName, rawCount] = header.split(",").map((s) => s.trim());
    const count = Number(rawCount);
    if (!rawId || !/^[A-Z]{2}\d{6}$/.test(rawId) || !Number.isInteger(count)) {
      throw new Error(`bad HURDAT2 header at line ${i}: ${header}`);
    }
    const season = Number(rawId.slice(4));
    const points: StormPoint[] = [];
    for (let k = 0; k < count; k++, i++) {
      const f = lines[i]!.split(",").map((s) => s.trim());
      const [ymd, hhmm, recordId, status, lat, lon, wind, pressure] = f as [string, string, string, string, string, string, string, string];
      const at = new Date(
        Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)), Number(hhmm.slice(0, 2)), Number(hhmm.slice(2, 4))),
      ).toISOString();
      const windKt = Number(wind);
      const pressureMb = Number(pressure);
      // A point without wind is skipped rather than stored with an invented value.
      if (windKt === -999) continue;
      points.push({
        stormId: rawId,
        kind: "observed",
        issuedAt: at,
        validAt: at,
        lat: coordinate(lat),
        lon: coordinate(lon),
        windKt,
        pressureMb: pressureMb === -999 ? null : pressureMb,
        status: status || null,
        recordId: recordId || null,
      });
    }
    if (season >= fromSeason) {
      out.push({ storm: { id: rawId, name: rawName ?? "UNNAMED", season, source: "hurdat2" }, points });
    }
  }
  return out;
}

export async function fetchHurdat2(http: HttpClient, userAgent: string): Promise<string> {
  return http.request({
    source: "nhc",
    url: HURDAT2_URL,
    headers: { "User-Agent": userAgent },
    schema: z.string(),
    body: "text",
    timeoutMs: 60_000,
  });
}
