import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CuratedEventSeed, NEWS_BASELINE_DAYS, type Refinery, type StormPoint } from "../../packages/contracts/index";
import { and, asc, db, eq, gte, notInArray } from "../../packages/database/index";
import { analogEvents, macroObservations, priceBars, refineries, stormPoints, storms, type NewAnalogEventRow } from "../../packages/database/schema";
import {
  buildCuratedEvent,
  buildHurricaneEvent,
  describeEvent,
  type BuiltEvent,
  type DatedValue,
  type EventBuildBase,
  type TimelinePoint,
} from "../../packages/quant/index";
import { patientHttp } from "../../packages/services/clients/default-http";
import { GdeltClient } from "../../packages/services/clients/gdelt";
import { HURDAT2_URL } from "../../packages/services/clients/hurdat2";
import { BadPayloadError, HttpStatusError, RateLimitedError, UpstreamError } from "../../packages/services/clients/http";
import { getPinecone, type FlatMetadata, type TextRecord } from "../../packages/services/clients/pinecone";
import { cachedJson, log, readCache, SEED, type SeedOptions } from "./lib";

// Step 5 (SPEC 10.5): hurricanes 2017 to 2025 from HURDAT2 and the curated events, built by Track C's pure
// builders (packages/quant/event-builder.ts), into `analog_events` and the Pinecone `events` namespace.

const DAY = 86_400_000;
const HURRICANE_FROM = 2017;
const HURRICANE_NEWS_HOURS = 48;
/** Sectors a Gulf hurricane reaches through refining and fuel prices (not curated per storm). */
const HURRICANE_SECTORS = ["energy", "refiner", "commodity_proxy"];
/** GDELT throttles with 429 and drops connections; the seed keeps trying each timeline this many times. */
const GDELT_ATTEMPTS = 10;
const GDELT_RETRY_BASE_MS = 15_000;
const GDELT_RETRY_MAX_MS = 60_000;

/** A failure that another try may fix: throttling, a dropped connection, a 5xx, or a throttle sent as plain text. */
function isTransient(error: unknown): boolean {
  if (error instanceof RateLimitedError || error instanceof UpstreamError) return true;
  if (error instanceof HttpStatusError) return error.status >= 500;
  return error instanceof BadPayloadError && /limit requests|try again/i.test(error.sample);
}

let gdelt: GdeltClient | null = null;
let fetched = 0;

/** One GDELT timeline, cached per query and window. Null (logged) when GDELT keeps refusing. */
async function timeline(
  mode: "timelinevol" | "timelinetone",
  query: string,
  start: Date,
  end: Date,
  options: SeedOptions,
): Promise<TimelinePoint[] | null> {
  // `patientHttp`: no circuit breaker, so a few dropped connections do not fail every remaining timeline for 5 minutes.
  gdelt ??= new GdeltClient(patientHttp());
  const key = createHash("sha1").update(`${mode}|${query}|${start.toISOString()}|${end.toISOString()}`).digest("hex");
  const path = `gdelt/timeline/${mode}-${key}.json`;
  if (options.gdelt === "cache-only") return readCache<TimelinePoint[]>(path);
  try {
    return await cachedJson(path, options, async () => {
      const began = Date.now();
      for (let attempt = 1; ; attempt++) {
        try {
          const points = await gdelt!.timeline(query, mode, start, end);
          fetched++;
          log("analogs", `GDELT ${mode} #${fetched} fetched in ${Math.round((Date.now() - began) / 1000)} s (${attempt} ${attempt === 1 ? "try" : "tries"}): ${query.slice(0, 60)}`);
          return points;
        } catch (error) {
          if (!isTransient(error) || attempt >= GDELT_ATTEMPTS) throw error;
          await new Promise((r) => setTimeout(r, Math.min(GDELT_RETRY_BASE_MS * attempt, GDELT_RETRY_MAX_MS)));
        }
      }
    });
  } catch (error) {
    log("analogs", `GDELT ${mode} unavailable for ${query}: ${error instanceof Error ? error.message.slice(0, 100) : String(error)}`);
    return null;
  }
}

async function timelines(query: string, start: Date, end: Date, options: SeedOptions) {
  const vol = await timeline("timelinevol", query, start, end, options);
  const tone = await timeline("timelinetone", query, start, end, options);
  return { volTimeline: vol ?? [], toneTimeline: tone ?? [], complete: vol !== null && tone !== null };
}

async function loadBase(): Promise<Omit<EventBuildBase, "volTimeline" | "toneTimeline">> {
  const rows = await db
    .select({ symbol: priceBars.symbol, date: priceBars.date, value: priceBars.adjClose })
    .from(priceBars)
    .orderBy(asc(priceBars.symbol), asc(priceBars.date));
  const closes: Record<string, DatedValue[]> = {};
  for (const r of rows) (closes[r.symbol] ??= []).push({ date: r.date, value: r.value });
  const vix = await db
    .select({ date: macroObservations.date, value: macroObservations.value })
    .from(macroObservations)
    .where(eq(macroObservations.seriesId, "VIXCLS"))
    .orderBy(asc(macroObservations.date));
  return { closes, vix };
}

function eventRow(
  base: { id: string; type: string; subtype: string | null; name: string; firstReportAt: string; region: string | null },
  built: BuiltEvent,
  extra: Pick<NewAnalogEventRow, "entities" | "affectedSectors" | "gdeltQuery" | "sources" | "stormId" | "landfallAt" | "companyCapAtRisk" | "description">,
): NewAnalogEventRow | null {
  if (!built.realizedUntil) return null;
  return {
    id: base.id,
    type: base.type,
    subtype: base.subtype,
    name: base.name,
    firstReportAt: new Date(base.firstReportAt),
    featureAt: new Date(built.featureAt),
    t0: built.t0,
    region: base.region,
    features: built.features,
    reactions: built.reactions,
    realizedUntil: built.realizedUntil,
    outageDays: null,
    ...extra,
  };
}

function record(row: NewAnalogEventRow): TextRecord {
  const metadata: FlatMetadata = {
    type: row.type,
    t0: Math.floor(Date.parse(`${row.t0}T00:00:00Z`) / 1000),
    realizedUntil: Math.floor(Date.parse(`${row.realizedUntil}T00:00:00Z`) / 1000),
    entities: row.entities ?? [],
  };
  if (row.subtype) metadata.subtype = row.subtype;
  if (row.region) metadata.region = row.region;
  return { id: `e_${row.id}`, text: row.description, metadata };
}

export async function seedAnalogs(options: SeedOptions): Promise<void> {
  const base = await loadBase();
  const refs: Refinery[] = await db.select().from(refineries);
  const rows: NewAnalogEventRow[] = [];
  const missingNews: string[] = [];

  // Hurricanes: Atlantic storms 2017 onward with a 64 kt point in GULF_BOX and a landfall (the builder decides).
  const stormRows = await db.select().from(storms).where(and(eq(storms.source, "hurdat2"), gte(storms.season, HURRICANE_FROM)));
  for (const storm of stormRows) {
    const points: StormPoint[] = (
      await db.select().from(stormPoints).where(eq(stormPoints.stormId, storm.id)).orderBy(asc(stormPoints.validAt))
    ).map((p) => ({ ...p, kind: p.kind as StormPoint["kind"], issuedAt: p.issuedAt.toISOString(), validAt: p.validAt.toISOString() }));
    const input = { ...base, stormId: storm.id, name: storm.name, points, refineries: refs };
    const probe = buildHurricaneEvent({ ...input, volTimeline: [], toneTimeline: [] });
    if (!probe) continue;
    const end = new Date(probe.featureAt);
    const start = new Date(end.getTime() - HURRICANE_NEWS_HOURS * 3_600_000 - (NEWS_BASELINE_DAYS + 1) * DAY);
    const news = await timelines(probe.gdeltQuery, start, end, options);
    const built = buildHurricaneEvent({ ...input, volTimeline: news.volTimeline, toneTimeline: news.toneTimeline })!;
    const title = storm.name.charAt(0) + storm.name.slice(1).toLowerCase();
    const id = `disaster-hurricane-${storm.name.toLowerCase()}-${storm.season}`;
    const row = eventRow(
      { id, type: "disaster", subtype: "hurricane", name: `Hurricane ${title}`, firstReportAt: built.firstReportAt, region: built.region },
      built,
      {
        stormId: storm.id,
        landfallAt: new Date(built.landfallAt),
        entities: built.entities,
        affectedSectors: HURRICANE_SECTORS,
        gdeltQuery: built.gdeltQuery,
        companyCapAtRisk: built.companyCapAtRisk,
        sources: [HURDAT2_URL],
        description: describeEvent({
          name: `Hurricane ${title}`,
          year: storm.season,
          type: "disaster",
          subtype: "hurricane",
          firstReportAt: built.firstReportAt,
          entities: built.entities,
          affectedSectors: HURRICANE_SECTORS,
          reactions: built.reactions,
          hurricane: built,
        }),
      },
    );
    if (!row) log("analogs", `${id}: not yet realized, skipped`);
    else rows.push(row);
    if (!news.complete) missingNews.push(id);
  }

  // Curated events (data/seed/analog-events.json).
  const curated = CuratedEventSeed.array().parse(JSON.parse(readFileSync(resolve(SEED, "analog-events.json"), "utf8")));
  for (const e of curated) {
    const reportAt = Date.parse(e.firstReportAt);
    const news = await timelines(e.gdeltQuery, new Date(reportAt - (NEWS_BASELINE_DAYS + 1) * DAY), new Date(reportAt + DAY), options);
    const built = buildCuratedEvent({ ...base, ...news, firstReportAt: e.firstReportAt });
    const row = eventRow(e, built, {
      stormId: null,
      landfallAt: null,
      entities: e.entities,
      affectedSectors: e.affectedSectors,
      gdeltQuery: e.gdeltQuery,
      companyCapAtRisk: null,
      sources: e.sources,
      description: describeEvent({
        name: e.name,
        year: Number(e.firstReportAt.slice(0, 4)),
        type: e.type,
        subtype: e.subtype,
        firstReportAt: e.firstReportAt,
        entities: e.entities,
        affectedSectors: e.affectedSectors,
        reactions: built.reactions,
      }),
    });
    if (!row) log("analogs", `${e.id}: not yet realized, skipped`);
    else rows.push(row);
    if (!news.complete) missingNews.push(e.id);
  }

  for (const row of rows) {
    const { id, ...rest } = row;
    await db.insert(analogEvents).values(row).onConflictDoUpdate({ target: analogEvents.id, set: rest });
  }
  // Rows no longer produced (a storm dropped by a builder change, a curated event removed) are deleted.
  if (rows.length) await db.delete(analogEvents).where(notInArray(analogEvents.id, rows.map((r) => r.id)));

  await getPinecone().upsert("events", rows.map(record));

  const hurricanes = rows.filter((r) => r.subtype === "hurricane").map((r) => r.id);
  log("analogs", `${rows.length} events (${hurricanes.length} hurricanes: ${hurricanes.join(", ")}); upserted to Pinecone events`);
  if (missingNews.length) log("analogs", `news features missing (GDELT refused) for ${missingNews.length}: ${missingNews.join(", ")}`);
}
