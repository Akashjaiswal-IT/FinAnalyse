import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { db, notInArray, sql } from "../../packages/database/index";
import { refineries } from "../../packages/database/schema";
import { log, SEED } from "./lib";

interface RefineryFeature {
  geometry: { coordinates: [number, number] };
  properties: { site_id: number; company: string; corp: string; site: string; state: string; padd: number; ad_mbpd: number };
}

/**
 * Step 4: `data/seed/refineries.geojson` (EIA, public use) joined with `data/seed/refinery-tickers.json`
 * (EIA corporate owner to universe ticker). Capacity: `AD_Mbpd` x 1000 barrels per calendar day.
 */
export async function seedRefineries(): Promise<void> {
  const geo = JSON.parse(readFileSync(resolve(SEED, "refineries.geojson"), "utf8")) as { features: RefineryFeature[] };
  const tickers = JSON.parse(readFileSync(resolve(SEED, "refinery-tickers.json"), "utf8")) as Record<string, string>;
  const rows = geo.features
    .filter((f) => f.properties.ad_mbpd > 0)
    .map((f) => ({
      id: `eia-${f.properties.site_id}`,
      name: f.properties.site,
      company: f.properties.company,
      ticker: tickers[f.properties.corp] ?? null,
      state: f.properties.state,
      padd: f.properties.padd,
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
      capacityBpd: Math.round(f.properties.ad_mbpd * 1000),
    }));
  await db.delete(refineries).where(notInArray(refineries.id, rows.map((r) => r.id)));
  await db
    .insert(refineries)
    .values(rows)
    .onConflictDoUpdate({
      target: refineries.id,
      set: {
        name: sql`excluded.name`,
        company: sql`excluded.company`,
        ticker: sql`excluded.ticker`,
        state: sql`excluded.state`,
        padd: sql`excluded.padd`,
        lat: sql`excluded.lat`,
        lon: sql`excluded.lon`,
        capacityBpd: sql`excluded.capacity_bpd`,
      },
    });
  const padd3 = rows.filter((r) => r.padd === 3).reduce((s, r) => s + r.capacityBpd, 0);
  const byTicker = Object.entries(
    rows.reduce<Record<string, number>>((acc, r) => (r.ticker ? { ...acc, [r.ticker]: (acc[r.ticker] ?? 0) + r.capacityBpd } : acc), {}),
  )
    .map(([t, c]) => `${t} ${c}`)
    .join(", ");
  log("refineries", `${rows.length} refineries with capacity; PADD 3 total ${padd3} bpd; listed: ${byTicker}`);
}
