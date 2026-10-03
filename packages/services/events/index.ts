import {
  DEMO_PORTFOLIO,
  EVENT_FEATURE_WINDOW_HOURS,
  EVENT_KEYWORDS,
  PEERS,
  TICKER_ALIASES,
  TYPE_BASELINE_DAYS,
  type EventProfile,
  type EventsListInput,
  type EventType,
  type ExposureChannel,
  type FactorDirectionEntry,
  type FactorName,
  type FactorDirection,
  type MarketEvent,
  type MarketEventView,
  type NewsItem,
  type Unavailable,
} from "@repo/contracts";
import defaultDb, { and, desc, eq, gte, inArray, isNotNull, lte, ne, type SQL } from "@repo/database";
import { marketEvents, newsItems, type MarketEventRow } from "@repo/database/schema";
import { clusterNews, clusterZ, eventStatus, isEvent, matchActiveEvent, type DetectItem } from "@repo/quant";
import { NewsService, toNewsItem } from "../news";

export type MarketEventDetail = MarketEvent & { topNews: NewsItem[] };

export interface DetectResult {
  detected: string[];
  updated: string[];
  faded: string[];
}

/** Fields `buildEventQuery` reads (SPEC 5.9). */
export type EventQueryInput = Pick<EventProfile, "type" | "entities" | "externalNames">;

type Db = typeof defaultDb;
const HOUR = 3_600_000;
const KEYWORDS_IN_QUERY = 4;

const quote = (t: string) => (t.includes(" ") ? `"${t}"` : t);
// GDELT allows parentheses only around OR'd terms and rejects very short keywords.
function orGroup(terms: readonly string[]): string | null {
  const kept = [...new Set(terms.filter((t) => t.length > 2))].map(quote);
  if (kept.length === 0) return null;
  return kept.length === 1 ? (kept[0] as string) : `(${kept.join(" OR ")})`;
}

function toMarketEvent(r: MarketEventRow): MarketEvent {
  return {
    id: r.id,
    type: r.type as EventType,
    subtype: r.subtype,
    title: r.title,
    firstSeenAt: r.firstSeenAt.toISOString(),
    lastSeenAt: r.lastSeenAt.toISOString(),
    articleCount: r.articleCount,
    domainCount: r.domainCount,
    clusterZ: r.clusterZ,
    gdeltQuery: r.gdeltQuery,
    volZ: r.volZ,
    toneZ: r.toneZ,
    entities: r.entities,
    factorDirections: Object.entries(r.factorDirections).map(([factor, direction]) => ({
      factor: factor as FactorName,
      direction: direction as FactorDirection,
    })),
    status: r.status as MarketEvent["status"],
    topNewsIds: r.topNewsIds,
  };
}

const HELD = DEMO_PORTFOLIO.positions.map((p) => p.symbol);

/** Held symbols an event touches by name or peer group; factor channels need betas and come from the risk node. */
function touchedHoldings(entities: readonly string[]): MarketEventView["touchedHoldings"] {
  return HELD.flatMap((symbol) => {
    const channels: ExposureChannel[] = [];
    if (entities.includes(symbol)) channels.push("direct");
    else if (entities.some((e) => PEERS[e]?.includes(symbol))) channels.push("peer");
    return channels.length ? [{ symbol, channels }] : [];
  });
}

const toView = (r: MarketEventRow): MarketEventView => ({ ...toMarketEvent(r), touchedHoldings: touchedHoldings(r.entities) });

/** Live market events (SPEC 5.14). */
export class EventsService {
  constructor(
    private readonly db: Db = defaultDb,
    private readonly news: NewsService = new NewsService(db),
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Active events first seen at or before `asOf`, most articles first. */
  async active(asOf: Date): Promise<MarketEventView[]> {
    return this.list({ status: "active" }, asOf);
  }

  async list(input: EventsListInput, asOf: Date): Promise<MarketEventView[]> {
    const conditions: SQL[] = [lte(marketEvents.firstSeenAt, asOf)];
    if (input.type) conditions.push(eq(marketEvents.type, input.type));
    if (input.status) conditions.push(eq(marketEvents.status, input.status));
    const rows = await this.db
      .select()
      .from(marketEvents)
      .where(and(...conditions))
      .orderBy(desc(marketEvents.lastSeenAt))
      .limit(50);
    return rows.map(toView);
  }

  async get(id: string): Promise<MarketEventDetail | null> {
    const [row] = await this.db.select().from(marketEvents).where(eq(marketEvents.id, id));
    if (!row) return null;
    const top = row.topNewsIds.length ? await this.db.select().from(newsItems).where(inArray(newsItems.id, row.topNewsIds)) : [];
    return { ...toMarketEvent(row), topNews: top.map(toNewsItem) };
  }

  /** P1 `detect` job: cluster scored news by rule (quant/detect.ts), upsert `market_events`, fade quiet events. */
  async detect(asOf: Date): Promise<DetectResult> {
    const now = asOf.toISOString();
    const rows = await this.db
      .select()
      .from(newsItems)
      .where(
        and(
          gte(newsItems.publishedAt, new Date(asOf.getTime() - 24 * HOUR)),
          lte(newsItems.publishedAt, asOf),
          isNotNull(newsItems.eventType),
          ne(newsItems.eventType, "none"),
        ),
      );
    const items: DetectItem[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      domain: r.domain,
      eventType: r.eventType as EventType,
      tickers: r.tickers,
      peerTickers: r.peerTickers,
      relevance: r.relevance ?? 0,
      publishedAt: r.publishedAt.toISOString(),
      factorDirections: Object.entries(r.factorDirections ?? {}).map(([factor, direction]) => ({
        factor: factor as FactorName,
        direction: direction as FactorDirection,
      })) as FactorDirectionEntry[],
    }));
    const clusters = clusterNews(items, now).filter(isEvent);
    const activeRows = await this.db.select().from(marketEvents).where(eq(marketEvents.status, "active"));
    const counts = await this.news.typeCounts(asOf, TYPE_BASELINE_DAYS);
    const result: DetectResult = { detected: [], updated: [], faded: [] };

    for (const c of clusters) {
      const baseline = counts.filter((t) => t.eventType === c.type && t.date < now.slice(0, 10)).map((t) => t.count);
      const gdeltQuery = this.buildEventQuery({ type: c.type, entities: c.entities, externalNames: [] });
      const windowEnd = new Date(Math.min(Date.parse(c.firstSeenAt) + EVENT_FEATURE_WINDOW_HOURS * HOUR, asOf.getTime()));
      const features = await this.news.newsFeatures(gdeltQuery, new Date(c.firstSeenAt), windowEnd);
      const fields = {
        type: c.type,
        title: c.title,
        lastSeenAt: new Date(c.lastSeenAt),
        articleCount: c.articleCount,
        domainCount: c.domainCount,
        clusterZ: clusterZ(c.articleCount, baseline),
        gdeltQuery,
        volZ: "data" in features ? features.data.volZ : null,
        toneZ: "data" in features ? features.data.toneZ : null,
        entities: c.entities,
        factorDirections: Object.fromEntries(c.factorDirections.map((f) => [f.factor, f.direction])),
        status: eventStatus(c.lastSeenAt, now),
        topNewsIds: c.topNewsIds,
      };
      const match = matchActiveEvent(
        c,
        activeRows.map((a) => ({ id: a.id, type: a.type as EventType, title: a.title, entities: a.entities })),
      );
      let id: string;
      if (match) {
        await this.db.update(marketEvents).set(fields).where(eq(marketEvents.id, match));
        id = match;
        result.updated.push(id);
      } else {
        const [inserted] = await this.db
          .insert(marketEvents)
          .values({ ...fields, firstSeenAt: new Date(c.firstSeenAt) })
          .returning({ id: marketEvents.id });
        id = inserted!.id;
        result.detected.push(id);
      }
      await this.db.update(newsItems).set({ marketEventId: id }).where(inArray(newsItems.id, c.itemIds));
    }

    const touched = new Set([...result.detected, ...result.updated]);
    for (const a of activeRows) {
      if (touched.has(a.id) || eventStatus(a.lastSeenAt.toISOString(), now) === "active") continue;
      await this.db.update(marketEvents).set({ status: "faded" }).where(eq(marketEvents.id, a.id));
      result.faded.push(a.id);
    }
    return result;
  }

  /** Not on the run path: the event node runs its own news search and classification (SPEC 5.5). */
  async profileFromNews(query: string, asOf: Date, typeHint?: EventType): Promise<EventProfile | Unavailable> {
    void query;
    void asOf;
    void typeHint;
    return { status: "unavailable", reason: "use the event node's news-search path" };
  }

  /** ORs the two first entity names (company aliases, then external names) with the type's `EVENT_KEYWORDS`. */
  buildEventQuery(profile: EventQueryInput): string {
    const names = [
      ...profile.entities.map((s) => TICKER_ALIASES[s]?.[0]).filter((n): n is string => Boolean(n)),
      ...profile.externalNames,
    ].slice(0, 2);
    const groups = [orGroup(names), orGroup(EVENT_KEYWORDS[profile.type].slice(0, KEYWORDS_IN_QUERY))].filter(
      (g): g is string => g !== null,
    );
    return `${groups.join(" ")} sourcelang:english`;
  }
}

