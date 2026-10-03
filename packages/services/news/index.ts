import { createHash, randomUUID } from "node:crypto";
import {
  DETECT_MIN_RELEVANCE,
  ENRICH_BATCH,
  ENRICH_DAILY_MAX,
  MAX_TOKENS,
  NEWS_BASELINE_DAYS,
  NEWS_SUMMARY_MAX_CHARS,
  NEWS_WINDOW_HOURS,
  Scores,
  type EventType,
  type FactorName,
  type FactorDirection,
  type NewsEventType,
  type NewsItem,
} from "@repo/contracts";
import defaultDb, { and, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, or, sql, type SQL } from "@repo/database";
import { newsItems, type NewsItemRow, type NewNewsItemRow } from "@repo/database/schema";
import { windowZ } from "@repo/quant";
import type { Redis } from "ioredis";
import { defaultHttp } from "../clients/default-http";
import { GdeltClient } from "../clients/gdelt";
import type { HttpClient } from "../clients/http";
import { getPinecone, type FlatMetadata, type PineconeClient, type TextRecord } from "../clients/pinecone";
import { getRedis, returnQuota, takeQuota } from "../clients/redis";
import { llm, type Llm } from "../llm";
import { SCORING_SYSTEM, scoreUpdate, scoringUser } from "./score";
import type {
  NewsFeatures,
  NewsFilters,
  NewsItemInput,
  NewsSearchHit,
  NewsSearchOptions,
  TypeCount,
  UpsertBatchResult,
} from "./model";
import { prefilter } from "./prefilter";

export * from "./model";
export { prefilter } from "./prefilter";

/** Stale cache copy or an explicit gap; nodes never substitute invented values (SPEC 5.3). */
export type Maybe<T> = { data: T; stale: boolean } | { unavailable: string };

type Db = typeof defaultDb;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const DEFAULT_TOP_K = 20;

export interface NewsDeps {
  http: () => HttpClient;
  gdelt: () => GdeltClient;
  llm: () => Llm;
  redis: () => Redis;
}

let sharedGdelt: GdeltClient | null = null;
// One GDELT client per process, so its one-request-per-5-s queue covers every caller.
const defaultDeps: NewsDeps = {
  http: defaultHttp,
  gdelt: () => (sharedGdelt ??= new GdeltClient(defaultHttp())),
  llm,
  redis: getRedis,
};

/** Pinecone id of a news item (SPEC 5.4). */
export function newsRecordId(url: string): string {
  return `n_${createHash("sha1").update(url).digest("hex")}`;
}

/** Title + ". " + summary, at most 1,500 characters (SPEC 5.4). */
export function newsText(title: string, summary: string | null): string {
  return (summary ? `${title}. ${summary}` : title).slice(0, NEWS_SUMMARY_MAX_CHARS);
}

export function toNewsItem(r: NewsItemRow): NewsItem {
  return {
    id: r.id,
    source: r.source as NewsItem["source"],
    url: r.url,
    title: r.title,
    summary: r.summary,
    domain: r.domain,
    queryKey: r.queryKey,
    publishedAt: r.publishedAt.toISOString(),
    fetchedAt: r.fetchedAt.toISOString(),
    indexedAt: r.indexedAt?.toISOString() ?? null,
    prefilterMatch: r.prefilterMatch,
    tickers: r.tickers,
    peerTickers: r.peerTickers,
    topics: r.topics,
    sourceSentiment: r.sourceSentiment,
    tickerSentiment: r.tickerSentiment,
    sentiment: r.sentiment,
    relevance: r.relevance,
    eventType: r.eventType as NewsEventType | null,
    entitySentiment: r.entitySentiment ? Object.entries(r.entitySentiment).map(([symbol, score]) => ({ symbol, score })) : null,
    factorDirections: r.factorDirections
      ? Object.entries(r.factorDirections).map(([factor, direction]) => ({
          factor: factor as FactorName,
          direction: direction as FactorDirection,
        }))
      : null,
    marketEventId: r.marketEventId,
    scoredAt: r.scoredAt?.toISOString() ?? null,
    scoreModel: r.scoreModel,
  };
}

export class NewsService {
  constructor(
    private readonly db: Db = defaultDb,
    private readonly pinecone: () => PineconeClient = getPinecone,
    private readonly now: () => Date = () => new Date(),
    private readonly deps: NewsDeps = defaultDeps,
  ) {}

  /**
   * SPEC 5.2: de-duplicate by URL, prefilter and tag, then the Postgres write and the Pinecone upsert (prefiltered
   * items only) in parallel, then `indexed_at`. A Pinecone failure leaves `indexed_at` null and is reported in
   * `indexError`; the rows stay.
   */
  async upsertBatch(items: readonly NewsItemInput[]): Promise<UpsertBatchResult & { indexError: string | null }> {
    // The first item for a URL wins.
    const unique = items.filter((item, i) => items.findIndex((other) => other.url === item.url) === i);
    const existing = unique.length
      ? new Set(
          (await this.db.select({ url: newsItems.url }).from(newsItems).where(inArray(newsItems.url, unique.map((i) => i.url)))).map(
            (r) => r.url,
          ),
        )
      : new Set<string>();
    const fresh = unique.filter((i) => !existing.has(i.url));

    const rows: NewNewsItemRow[] = fresh.map((i) => {
      const p = prefilter(i);
      return {
        id: randomUUID(),
        source: i.source,
        url: i.url,
        title: i.title,
        summary: i.summary,
        domain: i.domain,
        queryKey: i.queryKey,
        publishedAt: new Date(i.publishedAt),
        fetchedAt: new Date(i.fetchedAt),
        prefilterMatch: p.match,
        tickers: p.tickers,
        peerTickers: p.peerTickers,
        topics: i.topics,
        sourceSentiment: i.sourceSentiment,
        tickerSentiment: i.tickerSentiment,
      };
    });
    const matched = rows.filter((r) => r.prefilterMatch);
    const records: TextRecord[] = matched.map((r) => {
      const metadata: FlatMetadata = {
        newsId: r.id!,
        source: r.source,
        publishedAt: Math.floor(r.publishedAt.getTime() / 1000),
        tickers: r.tickers ?? [],
        peerTickers: r.peerTickers ?? [],
        topics: r.topics ?? [],
      };
      return { id: newsRecordId(r.url), text: newsText(r.title, r.summary ?? null), metadata };
    });

    const write = rows.length
      ? this.db.insert(newsItems).values(rows).onConflictDoNothing({ target: newsItems.url }).returning({ id: newsItems.id })
      : Promise.resolve([]);
    const index = records.length ? this.pinecone().upsert("news", records) : Promise.resolve(0);
    const [written, indexed] = await Promise.allSettled([write, index]);
    if (written.status === "rejected") throw written.reason;
    const inserted = written.value.map((r) => r.id);
    const insertedSet = new Set(inserted);

    let indexedIds: string[] = [];
    let indexError: string | null = null;
    let latencyMs = 0;
    if (indexed.status === "fulfilled") {
      const indexedAt = this.now();
      indexedIds = matched.map((r) => r.id!).filter((id) => insertedSet.has(id));
      if (indexedIds.length) {
        await this.db.update(newsItems).set({ indexedAt }).where(inArray(newsItems.id, indexedIds));
        latencyMs = Math.max(...matched.filter((r) => insertedSet.has(r.id!)).map((r) => indexedAt.getTime() - r.fetchedAt.getTime()));
      }
    } else {
      indexError = indexed.reason instanceof Error ? indexed.reason.message : String(indexed.reason);
    }
    return {
      inserted,
      duplicates: items.length - inserted.length,
      prefiltered: matched.map((r) => r.id!).filter((id) => insertedSet.has(id)),
      indexed: indexedIds,
      latencyMs,
      indexError,
    };
  }

  /** Pinecone search, then Postgres hydration, inside `[asOf - windowHours, asOf]` (default 72 h). */
  async search(text: string, options: NewsSearchOptions): Promise<NewsSearchHit[]> {
    const end = options.asOf.getTime();
    const start = end - (options.windowHours ?? NEWS_WINDOW_HOURS) * HOUR;
    const filter: Record<string, unknown> = {
      publishedAt: { $gte: Math.floor(start / 1000), $lte: Math.floor(end / 1000) },
    };
    if (options.tickers?.length) {
      filter.$or = [{ tickers: { $in: options.tickers } }, { peerTickers: { $in: options.tickers } }];
    }
    const hits = await this.pinecone().search("news", text, options.topK ?? DEFAULT_TOP_K, filter, ["newsId"]);
    const ids = hits.flatMap((h) => (typeof h.fields.newsId === "string" ? [h.fields.newsId] : []));
    if (ids.length === 0) return [];
    // The window and type filters are applied again on the rows: Pinecone metadata is a cache, Postgres the truth.
    const conditions: SQL[] = [inArray(newsItems.id, ids), gte(newsItems.publishedAt, new Date(start)), lte(newsItems.publishedAt, options.asOf)];
    if (options.eventTypes?.length) conditions.push(inArray(newsItems.eventType, [...options.eventTypes]));
    const rows = new Map((await this.db.select().from(newsItems).where(and(...conditions))).map((r) => [r.id, r]));
    return hits.flatMap((h) => {
      const row = typeof h.fields.newsId === "string" ? rows.get(h.fields.newsId) : undefined;
      return row ? [{ item: toNewsItem(row), score: h.score }] : [];
    });
  }

  /** Newest first, `published_at <= asOf` (and before `before`). */
  async list(filters: NewsFilters): Promise<NewsItem[]> {
    const conditions: SQL[] = [lte(newsItems.publishedAt, filters.asOf)];
    if (filters.before) conditions.push(sql`${newsItems.publishedAt} < ${filters.before}`);
    if (filters.eventType) conditions.push(eq(newsItems.eventType, filters.eventType));
    if (filters.ticker) {
      conditions.push(or(sql`${filters.ticker} = any(${newsItems.tickers})`, sql`${filters.ticker} = any(${newsItems.peerTickers})`)!);
    }
    const rows = await this.db
      .select()
      .from(newsItems)
      .where(and(...conditions))
      .orderBy(desc(newsItems.publishedAt))
      .limit(filters.limit);
    return rows.map(toNewsItem);
  }

  /** Score up to `limit` prefiltered, unscored items (only `ids` when given) through `services/llm`; returns the scored ids. */
  async scoreUnscored(limit: number, ids?: readonly string[]): Promise<string[]> {
    if (ids?.length === 0) return [];
    const rows = await this.db
      .select()
      .from(newsItems)
      .where(and(eq(newsItems.prefilterMatch, true), isNull(newsItems.scoredAt), ids ? inArray(newsItems.id, [...ids]) : undefined))
      .orderBy(desc(newsItems.publishedAt))
      .limit(Math.min(limit, ENRICH_BATCH));
    const now = this.now();
    const allowed: typeof rows = [];
    for (const row of rows) {
      if (!(await takeQuota(this.deps.redis(), "enrich", ENRICH_DAILY_MAX, now))) break;
      allowed.push(row);
    }
    if (allowed.length === 0) return [];
    const result = await this.deps.llm().parseStructured({
      label: "news-scoring",
      tier: "fast",
      system: SCORING_SYSTEM,
      user: scoringUser(allowed),
      schema: Scores,
      maxTokens: MAX_TOKENS.scoring,
    });
    if (!result.ok) {
      await returnQuota(this.deps.redis(), "enrich", allowed.length, now);
      throw new Error(`news scoring failed: ${result.reason} ${result.detail}`);
    }
    const byId = new Map(allowed.map((r) => [r.id, r]));
    const scored: string[] = [];
    for (const score of result.data.scores) {
      const row = byId.get(score.id);
      if (!row) continue;
      await this.db.update(newsItems).set(scoreUpdate(score, row.tickers, result.usage.model, now)).where(eq(newsItems.id, row.id));
      scored.push(row.id);
    }
    return scored;
  }

  /**
   * Scored news (relevance at least `DETECT_MIN_RELEVANCE`, an event type other than `none`) per type per UTC day,
   * published in `[asOf - days, asOf]` (SPEC 5.14 step 4).
   */
  async typeCounts(asOf: Date, days: number): Promise<TypeCount[]> {
    const day = sql<string>`to_char(${newsItems.publishedAt} at time zone 'UTC', 'YYYY-MM-DD')`;
    const rows = await this.db
      .select({ eventType: newsItems.eventType, date: day, count: sql<number>`count(*)::int` })
      .from(newsItems)
      .where(
        and(
          gte(newsItems.publishedAt, new Date(asOf.getTime() - days * 24 * HOUR)),
          lte(newsItems.publishedAt, asOf),
          isNotNull(newsItems.eventType),
          ne(newsItems.eventType, "none"),
          gte(newsItems.relevance, DETECT_MIN_RELEVANCE),
        ),
      )
      .groupBy(newsItems.eventType, day)
      .orderBy(day);
    return rows.map((r) => ({ eventType: r.eventType as EventType, date: r.date, count: r.count }));
  }

  /** One function for every event's news features (SPEC 5.9): GDELT volume and tone timelines over the window
   * and the `NEWS_BASELINE_DAYS` before it; the z-score math is `quant/stats.ts`. */
  async newsFeatures(query: string, windowStart: Date, windowEnd: Date): Promise<Maybe<NewsFeatures>> {
    const start = new Date(windowStart.getTime() - (NEWS_BASELINE_DAYS + 1) * DAY);
    // Past windows never change; live ones refresh every 15 minutes.
    const ttl = windowEnd.getTime() < this.now().getTime() - DAY ? 7 * 86_400 : 15 * 60;
    const key = `features:${query}|${start.toISOString()}|${windowEnd.toISOString()}`;
    try {
      const { data, stale } = await this.deps.http().cached("gdelt", key, ttl, async () => {
        const gdelt = this.deps.gdelt();
        const vol = await gdelt.timeline(query, "timelinevol", start, windowEnd);
        const tone = await gdelt.timeline(query, "timelinetone", start, windowEnd);
        return { vol, tone };
      });
      const ws = windowStart.toISOString();
      const we = windowEnd.toISOString();
      return {
        data: {
          query,
          windowStart: ws,
          windowEnd: we,
          volZ: windowZ(data.vol, ws, we, NEWS_BASELINE_DAYS),
          toneZ: windowZ(data.tone, ws, we, NEWS_BASELINE_DAYS),
        },
        stale,
      };
    } catch (error) {
      return { unavailable: `gdelt: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
}
