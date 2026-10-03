import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { inflateRawSync } from "node:zlib";
import { CACHE, SEED } from "./lib";

// One-time converter: EIA "Petroleum Refineries" shapefile zip (public use) to the committed
// data/seed/refineries.geojson. Run: pnpm exec tsx scripts/seed/eia-refineries.ts <path-to-zip>
// Source: https://www.eia.gov/maps/map_data/Petroleum_Refineries_US_EIA.zip ("As of Jan. 1 2021").

export const EIA_REFINERIES_URL = "https://www.eia.gov/maps/map_data/Petroleum_Refineries_US_EIA.zip";

/** Reads one file from a zip (stored or deflated) through the central directory. */
export function unzipEntry(zip: Buffer, suffix: string): Buffer {
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("not a zip file");
  const entries = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  for (let i = 0; i < entries; i++) {
    const method = zip.readUInt16LE(p + 10);
    const size = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.toString("utf8", p + 46, p + 46 + nameLen);
    if (name.endsWith(suffix)) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + size);
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data);
      throw new Error(`unsupported zip method ${method}`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${suffix} not found in zip`);
}

/** dBASE III table to records of trimmed strings. */
export function readDbf(dbf: Buffer): Record<string, string>[] {
  const count = dbf.readUInt32LE(4);
  const headerLen = dbf.readUInt16LE(8);
  const recordLen = dbf.readUInt16LE(10);
  const fields: { name: string; len: number }[] = [];
  for (let o = 32; dbf[o] !== 0x0d; o += 32) {
    fields.push({ name: dbf.toString("latin1", o, o + 11).replace(/\0.*$/, ""), len: dbf[o + 16]! });
  }
  const rows: Record<string, string>[] = [];
  for (let i = 0; i < count; i++) {
    let o = headerLen + i * recordLen;
    if (dbf[o] === 0x2a) continue; // deleted record
    o += 1;
    const row: Record<string, string> = {};
    for (const f of fields) {
      row[f.name] = dbf.toString("latin1", o, o + f.len).trim();
      o += f.len;
    }
    rows.push(row);
  }
  return rows;
}

export function toGeoJson(rows: readonly Record<string, string>[]) {
  return {
    type: "FeatureCollection",
    source: EIA_REFINERIES_URL,
    period: rows[0]?.Period_ ?? null,
    capacityField: "AD_Mbpd: atmospheric crude distillation capacity, thousand barrels per calendar day",
    features: rows.map((r) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [Number(r.Longitude), Number(r.Latitude)] },
      properties: {
        site_id: Number(r.site_id),
        company: r.Company,
        corp: r.Corp,
        site: r.Site,
        state: r.State,
        padd: Number(r.PADD),
        ad_mbpd: Number(r.AD_Mbpd),
      },
    })),
  };
}

if (require.main === module) {
  const zipPath = process.argv[2] ?? resolve(CACHE, "eia/Petroleum_Refineries_US_EIA.zip");
  const rows = readDbf(unzipEntry(readFileSync(zipPath), ".dbf"));
  const out = resolve(SEED, "refineries.geojson");
  writeFileSync(out, `${JSON.stringify(toGeoJson(rows), null, 1)}\n`);
  console.log(`wrote ${rows.length} refineries to ${out}`);
}
