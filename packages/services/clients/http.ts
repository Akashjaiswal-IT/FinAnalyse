import { createHash } from "node:crypto";
import type { SourceHealth } from "@repo/contracts";
import type { z } from "zod";
import type { KvStore } from "./kv";

// Every external call goes through this wrapper (SPEC 5.3).

export class RateLimitedError extends Error {
  constructor(
    readonly source: string,
    readonly retryAfterMs: number,
    detail: string,
  ) {
    super(`${source} rate limited: ${detail}`);
    this.name = "RateLimitedError";
  }
}

export class BadPayloadError extends Error {
  constructor(
    readonly source: string,
    readonly sample: string,
    detail: string,
  ) {
    super(`${source} bad payload: ${detail}`);
    this.name = "BadPayloadError";
  }
}

export class SourceDownError extends Error {
  constructor(
    readonly source: string,
    reason: string,
  ) {
    super(`${source} down: ${reason}`);
    this.name = "SourceDownError";
  }
}

/** Network errors, timeouts and 5xx: retried twice, then thrown. */
export class UpstreamError extends Error {
  constructor(
    readonly source: string,
    detail: string,
  ) {
    super(`${source} upstream error: ${detail}`);
    this.name = "UpstreamError";
  }
}

export class HttpStatusError extends Error {
  constructor(
    readonly source: string,
    readonly status: number,
    readonly sample: string,
  ) {
    super(`${source} HTTP ${status}`);
    this.name = "HttpStatusError";
  }
}

export const TIMEOUT_MS = 10_000;
export const RETRY_DELAYS_MS = [500, 1_500] as const;
export const BREAKER_THRESHOLD = 3;
export const BREAKER_OPEN_MS = 5 * 60_000;
export const STALE_TTL_SECONDS = 24 * 3_600;
export const DEFAULT_RETRY_AFTER_MS = 60_000;
const SAMPLE_CHARS = 200;

export type LogFn = (level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>) => void;

export interface HttpDeps {
  fetch: typeof globalThis.fetch;
  /** Response cache, stale copies and `source:{name}` status hashes; null disables all three. */
  store: KvStore | null;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
  disabledSources: readonly string[];
  log: LogFn;
  /**
   * Circuit breaker (SPEC 5.3): default is `BREAKER_THRESHOLD` failures open it for `BREAKER_OPEN_MS`. `false` keeps
   * it closed, for a one-off job such as the seed that retries a flaky source on its own schedule.
   */
  breaker?: false;
}

export interface RequestOptions<T> {
  source: string;
  url: string;
  schema: z.ZodType<T>;
  /** `text` validates the raw body as a string (GDELT errors arrive as text with status 200). */
  body?: "json" | "text";
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Delays before each retry of a network error or 5xx; default 0.5 s then 1.5 s, jittered. */
  retryDelaysMs?: readonly number[];
  /** Provider throttle bodies with status 200 (Alpha Vantage `Information`/`Note`): return a message or null. */
  throttled?: (body: unknown) => string | null;
}

export interface Cached<T> {
  data: T;
  stale: boolean;
}

interface Breaker {
  failures: number;
  openUntil: number;
}

function sample(text: string): string {
  return text.slice(0, SAMPLE_CHARS);
}

function retryAfterMs(header: string | null, now: number): number {
  if (!header) return DEFAULT_RETRY_AFTER_MS;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(header);
  return Number.isNaN(at) ? DEFAULT_RETRY_AFTER_MS : Math.max(0, at - now);
}

function hashKey(key: string): string {
  return createHash("sha1").update(key).digest("hex");
}

export class HttpClient {
  private readonly breakers = new Map<string, Breaker>();

  constructor(private readonly deps: HttpDeps) {}

  async request<T>(options: RequestOptions<T>): Promise<T> {
    const { source } = options;
    if (this.deps.disabledSources.includes(source)) {
      await this.writeStatus(source, "down", { lastError: "disabled by DISABLE_SOURCES" });
      throw new SourceDownError(source, "disabled by DISABLE_SOURCES");
    }
    const breaker = this.breakers.get(source);
    if (breaker && breaker.openUntil > this.deps.now()) {
      throw new SourceDownError(source, "circuit open");
    }

    const started = this.deps.now();
    try {
      const data = await this.attempts(options);
      this.breakers.delete(source);
      await this.writeStatus(source, "ok", {
        lastOkAt: new Date(this.deps.now()).toISOString(),
        lastLatencyMs: String(this.deps.now() - started),
      });
      return data;
    } catch (error) {
      if (error instanceof RateLimitedError) {
        await this.writeStatus(source, "rate_limited", { lastError: error.message });
        throw error;
      }
      if (this.deps.breaker === false) {
        await this.writeStatus(source, "degraded", { lastError: error instanceof Error ? error.message : String(error) });
        throw error;
      }
      const failures = (this.breakers.get(source)?.failures ?? 0) + 1;
      const open = failures >= BREAKER_THRESHOLD;
      this.breakers.set(source, { failures, openUntil: open ? this.deps.now() + BREAKER_OPEN_MS : 0 });
      const message = error instanceof Error ? error.message : String(error);
      await this.writeStatus(source, open ? "down" : "degraded", { lastError: message });
      if (open) this.deps.log("warn", "circuit opened", { source, failures });
      throw error;
    }
  }

  /**
   * `fn` through the Redis cache: a fresh copy for `ttlSeconds`, a stale copy for 24 hours.
   * When `fn` fails and a stale copy exists, returns it with `stale: true`.
   */
  async cached<T>(source: string, key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<Cached<T>> {
    const store = this.deps.store;
    if (!store) return { data: await fn(), stale: false };
    const hash = hashKey(key);
    const fresh = await this.safeGet(store, `cache:${source}:${hash}`);
    if (fresh !== null) return { data: JSON.parse(fresh) as T, stale: false };
    try {
      const data = await fn();
      const json = JSON.stringify(data);
      await Promise.all([
        store.setEx(`cache:${source}:${hash}`, ttlSeconds, json),
        store.setEx(`stale:${source}:${hash}`, STALE_TTL_SECONDS, json),
      ]).catch((e: unknown) => this.deps.log("warn", "cache write failed", { source, error: String(e) }));
      return { data, stale: false };
    } catch (error) {
      const stale = await this.safeGet(store, `stale:${source}:${hash}`);
      if (stale === null) throw error;
      this.deps.log("warn", "serving stale copy", { source, error: String(error) });
      return { data: JSON.parse(stale) as T, stale: true };
    }
  }

  private async attempts<T>(options: RequestOptions<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.once(options);
      } catch (error) {
        const delay = (options.retryDelaysMs ?? RETRY_DELAYS_MS)[attempt];
        if (!(error instanceof UpstreamError) || delay === undefined) throw error;
        // Jitter of +-25% around each delay.
        await this.deps.sleep(Math.round(delay * (0.75 + 0.5 * this.deps.random())));
      }
    }
  }

  private async once<T>(options: RequestOptions<T>): Promise<T> {
    const { source, url, schema } = options;
    let response: Response;
    let text: string;
    try {
      response = await this.deps.fetch(url, {
        headers: options.headers,
        signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
      });
      // The body counts toward the timeout; `fetched_at` is when it is fully received (SPEC 5.2).
      text = await response.text();
    } catch (error) {
      throw new UpstreamError(source, `network: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (response.status === 429) {
      throw new RateLimitedError(source, retryAfterMs(response.headers.get("retry-after"), this.deps.now()), sample(text));
    }
    if (response.status >= 500) throw new UpstreamError(source, `HTTP ${response.status}`);
    if (!response.ok) throw new HttpStatusError(source, response.status, sample(text));

    let body: unknown = text;
    if ((options.body ?? "json") === "json") {
      try {
        body = JSON.parse(text);
      } catch {
        this.deps.log("error", "non-JSON body", { source, sample: sample(text) });
        throw new BadPayloadError(source, sample(text), "body is not JSON");
      }
    }
    const throttle = options.throttled?.(body);
    if (throttle) throw new RateLimitedError(source, DEFAULT_RETRY_AFTER_MS, throttle);

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      this.deps.log("error", "payload failed validation", { source, sample: sample(text) });
      throw new BadPayloadError(source, sample(text), parsed.error.message);
    }
    return parsed.data;
  }

  private async safeGet(store: KvStore, key: string): Promise<string | null> {
    try {
      return await store.get(key);
    } catch (error) {
      this.deps.log("warn", "cache read failed", { key, error: String(error) });
      return null;
    }
  }

  private async writeStatus(source: string, status: SourceHealth, fields: Record<string, string>): Promise<void> {
    const store = this.deps.store;
    if (!store) return;
    const now = new Date(this.deps.now()).toISOString();
    const extra: Record<string, string> = status === "ok" ? {} : { lastErrorAt: now };
    try {
      await store.hset(`source:${source}`, { status, ...extra, ...fields });
    } catch (error) {
      this.deps.log("warn", "status write failed", { source, error: String(error) });
    }
  }
}
