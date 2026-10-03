import {
  AV_DAILY_MAX,
  ENRICH_DAILY_MAX,
  LiveEvent,
  SourceName,
  type SourceHealth,
  type SourceStatus,
  type SystemStatus,
} from "@repo/contracts";
import defaultDb, { and, gte, isNotNull, sql } from "@repo/database";
import { newsItems } from "@repo/database/schema";
import type { Redis } from "ioredis";
import { createRedisConnection, getRedis, quotaUsed } from "../clients/redis";
import { enqueue } from "../queues";

export interface IngestLatency {
  p50Ms: number | null;
  p95Ms: number | null;
  count: number;
  windowHours: number;
}

type Db = typeof defaultDb;
const LIVE_CHANNEL = "live";
const HOUR = 3_600_000;
const INGEST_NOW_SOURCES = ["gdelt", "googlenews", "nhc", "alphavantage"] as const;

/** Source health, ingest latency and the live relay (SPEC 5.2, 5.13, TEAM rule 10). */
export class SystemService {
  constructor(
    private readonly db: Db = defaultDb,
    private readonly redis: () => Redis = getRedis,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async status(): Promise<SystemStatus> {
    const [sources, ingestLatency, used] = await Promise.all([
      this.sourceStatus(),
      this.ingestLatency(24),
      quotaUsed(this.redis(), "enrich", this.now()),
    ]);
    return { sources, ingestLatency, enrichQuota: { used, max: ENRICH_DAILY_MAX } };
  }

  /** From the `source:{name}` hashes the HTTP wrapper writes; a source never called yet reads as degraded. */
  async sourceStatus(): Promise<SourceStatus[]> {
    const redis = this.redis();
    return Promise.all(
      SourceName.options.map(async (source) => {
        const h = await redis.hgetall(`source:${source}`);
        const num = (v: string | undefined) => (v === undefined || v === "" ? null : Number(v));
        return {
          source,
          status: (h.status as SourceHealth | undefined) ?? "degraded",
          lastOkAt: h.lastOkAt ?? null,
          lastErrorAt: h.lastErrorAt ?? null,
          lastError: h.status ? (h.lastError ?? null) : "not called yet",
          lastLatencyMs: num(h.lastLatencyMs),
        };
      }),
    );
  }

  /** p50 and p95 of `indexed_at - fetched_at` over indexed news in the window. */
  async ingestLatency(windowHours: number): Promise<IngestLatency> {
    const ms = sql`extract(epoch from (${newsItems.indexedAt} - ${newsItems.fetchedAt})) * 1000`;
    const [row] = await this.db
      .select({
        p50: sql<number | null>`percentile_cont(0.5) within group (order by ${ms})`,
        p95: sql<number | null>`percentile_cont(0.95) within group (order by ${ms})`,
        count: sql<number>`count(*)::int`,
      })
      .from(newsItems)
      // Both ends in the window: replay seeding stamps fetched_at with the preset's as-of, years before indexing.
      .where(and(isNotNull(newsItems.indexedAt), gte(newsItems.fetchedAt, new Date(this.now().getTime() - windowHours * HOUR))));
    const round = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(Number(v)));
    return { p50Ms: round(row?.p50), p95Ms: round(row?.p95), count: row?.count ?? 0, windowHours };
  }

  /** Queues immediate GDELT, Google News and NHC jobs (and Alpha Vantage if quota remains); returns the queued sources. */
  async ingestNow(sources?: readonly SourceName[]): Promise<SourceName[]> {
    const wanted = (sources ?? INGEST_NOW_SOURCES).filter((s): s is (typeof INGEST_NOW_SOURCES)[number] =>
      (INGEST_NOW_SOURCES as readonly string[]).includes(s),
    );
    const queued: SourceName[] = [];
    for (const source of wanted) {
      if (source === "alphavantage" && (await quotaUsed(this.redis(), "alphavantage", this.now())) >= AV_DAILY_MAX) continue;
      await enqueue(source, { trigger: "manual" });
      queued.push(source);
    }
    return queued;
  }
}

/** Publish one `LiveEvent` on the Redis channel `live` (worker side). */
export async function publishLive(event: LiveEvent): Promise<void> {
  await getRedis().publish(LIVE_CHANNEL, JSON.stringify(event));
}

/**
 * Subscribe once to the Redis channel `live` (api side) on its own connection; invalid messages are dropped.
 * Resolves to an unsubscribe function.
 */
export async function subscribeLive(onEvent: (event: LiveEvent) => void): Promise<() => Promise<void>> {
  const sub = createRedisConnection();
  sub.on("message", (_channel: string, message: string) => {
    try {
      const parsed = LiveEvent.safeParse(JSON.parse(message));
      if (parsed.success) onEvent(parsed.data);
    } catch {
      // Not JSON: ignored, like any other invalid message.
    }
  });
  await sub.subscribe(LIVE_CHANNEL);
  return async () => {
    await sub.unsubscribe(LIVE_CHANNEL);
    sub.disconnect();
  };
}
