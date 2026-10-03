import { db, sql } from "../../packages/database/index";
import { stormPoints, storms } from "../../packages/database/schema";
import { defaultHttp } from "../../packages/services/clients/default-http";
import { fetchHurdat2, HURDAT2_URL, parseHurdat2 } from "../../packages/services/clients/hurdat2";
import { cachedText, chunked, log, type SeedOptions } from "./lib";

export const STORM_FROM_SEASON = 2015;

/** Step 3: HURDAT2 Atlantic seasons 2015 onward into `storms` and observed `storm_points` (SPEC 10). */
export async function seedStorms(options: SeedOptions): Promise<void> {
  const userAgent = process.env.NOAA_USER_AGENT ?? "tempest-codeutsav";
  const file = HURDAT2_URL.split("/").at(-1)!;
  const text = await cachedText(`hurdat2/${file}`, options, () => fetchHurdat2(defaultHttp(), userAgent));
  const parsed = parseHurdat2(text, STORM_FROM_SEASON);

  for (const batch of chunked(parsed, 200)) {
    await db
      .insert(storms)
      .values(batch.map((s) => s.storm))
      .onConflictDoUpdate({ target: storms.id, set: { name: sql`excluded.name`, season: sql`excluded.season` } });
  }
  const points = parsed.flatMap((s) =>
    s.points.map((p) => ({ ...p, issuedAt: new Date(p.issuedAt), validAt: new Date(p.validAt) })),
  );
  for (const batch of chunked(points, 2_000)) {
    await db
      .insert(stormPoints)
      .values(batch)
      .onConflictDoUpdate({
        target: [stormPoints.stormId, stormPoints.kind, stormPoints.issuedAt, stormPoints.validAt],
        set: {
          lat: sql`excluded.lat`,
          lon: sql`excluded.lon`,
          windKt: sql`excluded.wind_kt`,
          pressureMb: sql`excluded.pressure_mb`,
          status: sql`excluded.status`,
          recordId: sql`excluded.record_id`,
        },
      });
  }
  const seasons = parsed.map((s) => s.storm.season);
  log("storms", `${parsed.length} storms (${Math.min(...seasons)} to ${Math.max(...seasons)}), ${points.length} points from ${file}`);
}
