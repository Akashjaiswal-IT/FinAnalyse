import { Redis, type RedisOptions } from "ioredis";
import { env } from "../env";
import type { KvStore } from "./kv";

let shared: Redis | null = null;

/** One lazily created connection per process for cache, status hashes, quotas and publishing. */
export function getRedis(): Redis {
  shared ??= new Redis(env.REDIS_URL, { lazyConnect: false });
  return shared;
}

/**
 * A new connection, for BullMQ workers (`maxRetriesPerRequest: null`, ROADMAP gotcha 13) and for
 * subscribers, which cannot run other commands on the same connection.
 */
export function createRedisConnection(options: RedisOptions = {}): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, ...options });
}

export async function closeRedis(): Promise<void> {
  if (shared) {
    const client = shared;
    shared = null;
    await client.quit();
  }
}

export function redisKvStore(redis: Redis): KvStore {
  return {
    get: (key) => redis.get(key),
    setEx: async (key, ttlSeconds, value) => {
      await redis.set(key, value, "EX", ttlSeconds);
    },
    hset: async (key, fields) => {
      await redis.hset(key, fields);
    },
    hgetall: (key) => redis.hgetall(key),
  };
}

/** UTC date key for daily quota counters, for example `quota:alphavantage:2026-10-03`. */
export function quotaKey(name: string, now: Date): string {
  return `quota:${name}:${now.toISOString().slice(0, 10)}`;
}

/**
 * Takes one unit of a daily quota. Returns false, without consuming, when `max` is already used.
 * The counter expires after 2 days.
 */
export async function takeQuota(redis: Redis, name: string, max: number, now: Date): Promise<boolean> {
  const key = quotaKey(name, now);
  const used = await redis.incr(key);
  if (used === 1) await redis.expire(key, 2 * 86_400);
  if (used > max) {
    await redis.decr(key);
    return false;
  }
  return true;
}

export async function quotaUsed(redis: Redis, name: string, now: Date): Promise<number> {
  return Number((await redis.get(quotaKey(name, now))) ?? 0);
}

export type SourceRecorder = (error: unknown, latencyMs: number) => void;

/** Health of a source called outside `HttpClient` (Pinecone, Anthropic), in the same `source:<name>` hash. */
export function sourceRecorder(name: string): SourceRecorder {
  return (error, latencyMs) => {
    const now = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    const fields =
      error === null
        ? { status: "ok", lastOkAt: now, lastLatencyMs: String(Math.round(latencyMs)) }
        : { status: /\b429\b|rate.?limit/i.test(message) ? "rate_limited" : "degraded", lastErrorAt: now, lastError: message.slice(0, 300) };
    getRedis().hset(`source:${name}`, fields).catch(() => undefined);
  };
}
