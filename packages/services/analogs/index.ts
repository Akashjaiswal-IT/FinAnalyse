import { barAvailableAt, BAR_AVAILABLE_HOUR_UTC, type AnalogEvent, type EventType, type Sector } from "@repo/contracts";
import defaultDb, { asc, eq, inArray } from "@repo/database";
import { analogEvents, type AnalogEventRow } from "@repo/database/schema";
import { getPinecone, type PineconeClient } from "../clients/pinecone";

type Db = typeof defaultDb;

export interface AnalogSearchOptions {
  asOf: Date;
  types?: readonly EventType[];
  topK?: number;
}

export interface AnalogSearchHit {
  event: AnalogEvent;
  similarity: number;
}

export type PresetEvent = Pick<
  AnalogEvent,
  "id" | "name" | "type" | "subtype" | "firstReportAt" | "entities" | "affectedSectors" | "gdeltQuery" | "sources"
>;

const DEFAULT_TOP_K = 10;

export function toAnalogEvent(r: AnalogEventRow): AnalogEvent {
  return {
    id: r.id,
    type: r.type as EventType,
    subtype: r.subtype,
    name: r.name,
    stormId: r.stormId,
    firstReportAt: r.firstReportAt.toISOString(),
    featureAt: r.featureAt.toISOString(),
    t0: r.t0,
    landfallAt: r.landfallAt?.toISOString() ?? null,
    region: r.region,
    entities: r.entities,
    affectedSectors: r.affectedSectors as Sector[],
    gdeltQuery: r.gdeltQuery,
    features: r.features,
    companyCapAtRisk: r.companyCapAtRisk,
    reactions: r.reactions,
    realizedUntil: r.realizedUntil,
    outageDays: r.outageDays,
    description: r.description,
    sources: r.sources,
  };
}

/** SPEC 5.1: an event is eligible only when its realized window is readable at `asOf`. */
export function isRealizedAt(realizedUntil: string, asOf: Date): boolean {
  return barAvailableAt(realizedUntil).getTime() <= asOf.getTime();
}

/** Pinecone filter for `search`: `realizedUntil` (unix seconds of the date) readable at `asOf`, optional types. */
export function searchFilter(asOf: Date, types?: readonly EventType[]): object {
  const latestDate = Math.floor((asOf.getTime() - BAR_AVAILABLE_HOUR_UTC * 3_600_000) / 1000);
  const filter: Record<string, unknown> = { realizedUntil: { $lte: latestDate } };
  if (types?.length) filter.type = { $in: [...types] };
  return filter;
}

/** Historical events (Pinecone `events` namespace plus `analog_events`). */
export class AnalogsService {
  constructor(
    private readonly db: Db = defaultDb,
    private readonly pinecone: () => PineconeClient = getPinecone,
  ) {}

  /**
   * Only events with their realized window before `asOf` (SPEC 5.1): never the replayed event or any later
   * one. Pinecone filters by metadata; the Postgres rows are checked again before they are returned.
   */
  async search(text: string, options: AnalogSearchOptions): Promise<AnalogSearchHit[]> {
    const hits = await this.pinecone().search("events", text, options.topK ?? DEFAULT_TOP_K, searchFilter(options.asOf, options.types));
    const ids = hits.map((h) => h.id.replace(/^e_/, ""));
    const byId = new Map((await this.get(ids)).map((e) => [e.id, e]));
    return hits.flatMap((h) => {
      const event = byId.get(h.id.replace(/^e_/, ""));
      if (!event || !isRealizedAt(event.realizedUntil, options.asOf)) return [];
      if (options.types?.length && !options.types.includes(event.type)) return [];
      return [{ event, similarity: h.score }];
    });
  }

  async get(ids: readonly string[]): Promise<AnalogEvent[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.select().from(analogEvents).where(inArray(analogEvents.id, [...ids]));
    return rows.map(toAnalogEvent);
  }

  /** Every event, or one type; eligible-at-`asOf` filtering is the caller's (the backtest needs all). */
  async list(type?: EventType): Promise<AnalogEvent[]> {
    const rows = await this.db
      .select()
      .from(analogEvents)
      .where(type ? eq(analogEvents.type, type) : undefined)
      .orderBy(asc(analogEvents.firstReportAt));
    return rows.map(toAnalogEvent);
  }

  /** Pre-outcome fields of a replay preset's own row (SPEC 5.1): never `reactions` or `features`. */
  async presetEvent(id: string): Promise<PresetEvent | null> {
    const [row] = await this.db
      .select({
        id: analogEvents.id,
        name: analogEvents.name,
        type: analogEvents.type,
        subtype: analogEvents.subtype,
        firstReportAt: analogEvents.firstReportAt,
        entities: analogEvents.entities,
        affectedSectors: analogEvents.affectedSectors,
        gdeltQuery: analogEvents.gdeltQuery,
        sources: analogEvents.sources,
      })
      .from(analogEvents)
      .where(eq(analogEvents.id, id));
    if (!row) return null;
    return {
      ...row,
      type: row.type as EventType,
      affectedSectors: row.affectedSectors as Sector[],
      firstReportAt: row.firstReportAt.toISOString(),
    };
  }
}
