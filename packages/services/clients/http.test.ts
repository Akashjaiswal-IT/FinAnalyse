import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  BREAKER_OPEN_MS,
  BadPayloadError,
  HttpClient,
  HttpStatusError,
  RateLimitedError,
  SourceDownError,
  UpstreamError,
  type HttpDeps,
} from "./http";
import { MemoryKvStore } from "./kv";

type Reply = { status: number; body: string; headers?: Record<string, string> } | Error | "hang";

/** A fetch that plays back `replies` in order and records every call. */
function harness(replies: Reply[], overrides: Partial<HttpDeps> = {}) {
  let clock = Date.parse("2026-10-03T12:00:00Z");
  const calls: string[] = [];
  const sleeps: number[] = [];
  const logs: { level: string; message: string; meta?: Record<string, unknown> }[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push(String(input));
    const reply = replies.shift();
    if (reply === undefined) throw new Error("no reply queued");
    if (reply === "hang") {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    }
    if (reply instanceof Error) throw reply;
    return new Response(reply.body, { status: reply.status, headers: reply.headers });
  }) as typeof globalThis.fetch;
  const store = new MemoryKvStore(() => clock);
  const http = new HttpClient({
    fetch,
    store,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0.5,
    disabledSources: [],
    log: (level, message, meta) => logs.push({ level, message, meta }),
    ...overrides,
  });
  return {
    http,
    store,
    calls,
    sleeps,
    logs,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

const Body = z.object({ value: z.number() });
const ok = (value: number): Reply => ({ status: 200, body: JSON.stringify({ value }) });
const req = { source: "fred", url: "https://example.test/x", schema: Body };

describe("HttpClient.request", () => {
  it("returns the validated body and records an ok status", async () => {
    const h = harness([ok(1)]);
    await expect(h.http.request(req)).resolves.toEqual({ value: 1 });
    const status = await h.store.hgetall("source:fred");
    expect(status.status).toBe("ok");
    expect(status.lastOkAt).toBe("2026-10-03T12:00:00.000Z");
    expect(status.lastLatencyMs).toBe("0");
  });

  it("times out a hanging request and retries it", async () => {
    const h = harness(["hang", ok(2)]);
    await expect(h.http.request({ ...req, timeoutMs: 20 })).resolves.toEqual({ value: 2 });
    expect(h.calls).toHaveLength(2);
  });

  it("retries network errors and 5xx twice with jittered backoff, then succeeds", async () => {
    const h = harness([new TypeError("fetch failed"), { status: 503, body: "busy" }, ok(3)]);
    await expect(h.http.request(req)).resolves.toEqual({ value: 3 });
    expect(h.calls).toHaveLength(3);
    // random() = 0.5 gives the centre of the +-25% jitter.
    expect(h.sleeps).toEqual([500, 1500]);
  });

  it("gives up after two retries", async () => {
    const h = harness([{ status: 500, body: "" }, { status: 502, body: "" }, { status: 504, body: "" }]);
    await expect(h.http.request(req)).rejects.toBeInstanceOf(UpstreamError);
    expect(h.calls).toHaveLength(3);
    expect((await h.store.hgetall("source:fred")).status).toBe("degraded");
  });

  it("does not retry other 4xx", async () => {
    const h = harness([{ status: 404, body: "missing" }]);
    await expect(h.http.request(req)).rejects.toBeInstanceOf(HttpStatusError);
    expect(h.calls).toHaveLength(1);
  });

  it("turns HTTP 429 into RateLimitedError with Retry-After, without retrying", async () => {
    const h = harness([{ status: 429, body: "slow down", headers: { "retry-after": "30" } }]);
    const error = await h.http.request(req).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitedError);
    expect((error as RateLimitedError).retryAfterMs).toBe(30_000);
    expect(h.calls).toHaveLength(1);
    expect((await h.store.hgetall("source:fred")).status).toBe("rate_limited");
  });

  it("turns a provider throttle body with status 200 into RateLimitedError", async () => {
    const h = harness([{ status: 200, body: JSON.stringify({ Information: "25 requests per day" }) }]);
    const throttled = (body: unknown) =>
      typeof body === "object" && body !== null && "Information" in body ? String(body.Information) : null;
    await expect(
      h.http.request({ ...req, source: "alphavantage", schema: z.unknown(), throttled }),
    ).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("raises BadPayloadError on a schema mismatch and logs a 200-character sample", async () => {
    const long = JSON.stringify({ value: "x".repeat(500) });
    const h = harness([{ status: 200, body: long }]);
    await expect(h.http.request(req)).rejects.toBeInstanceOf(BadPayloadError);
    const logged = h.logs.find((l) => l.message === "payload failed validation");
    expect(logged?.meta?.sample).toBe(long.slice(0, 200));
  });

  it("raises BadPayloadError on a plain-text body with status 200", async () => {
    const h = harness([{ status: 200, body: "Please limit requests to one every 5 seconds" }]);
    await expect(h.http.request({ ...req, source: "gdelt" })).rejects.toBeInstanceOf(BadPayloadError);
  });

  it("opens the circuit after 3 consecutive failures for 5 minutes, then tries again", async () => {
    const bad = { status: 400, body: "bad" };
    const h = harness([bad, bad, bad, ok(4)]);
    for (let i = 0; i < 3; i++) await expect(h.http.request(req)).rejects.toBeInstanceOf(HttpStatusError);
    expect((await h.store.hgetall("source:fred")).status).toBe("down");

    await expect(h.http.request(req)).rejects.toBeInstanceOf(SourceDownError);
    expect(h.calls).toHaveLength(3);

    h.advance(BREAKER_OPEN_MS + 1);
    await expect(h.http.request(req)).resolves.toEqual({ value: 4 });
    expect((await h.store.hgetall("source:fred")).status).toBe("ok");
  });

  it("with the breaker switched off, failures never open the circuit (the seed retries on its own schedule)", async () => {
    const bad = { status: 400, body: "bad" };
    const h = harness([bad, bad, bad, bad, ok(7)], { breaker: false });
    for (let i = 0; i < 4; i++) await expect(h.http.request(req)).rejects.toBeInstanceOf(HttpStatusError);
    expect((await h.store.hgetall("source:fred")).status).toBe("degraded");
    await expect(h.http.request(req)).resolves.toEqual({ value: 7 });
    expect(h.calls).toHaveLength(5); // every call reached the network; none failed fast
    expect((await h.store.hgetall("source:fred")).status).toBe("ok");
  });

  it("does not count rate limits as breaker failures", async () => {
    const limited = { status: 429, body: "" };
    const h = harness([limited, limited, limited, ok(5)]);
    for (let i = 0; i < 3; i++) await expect(h.http.request(req)).rejects.toBeInstanceOf(RateLimitedError);
    await expect(h.http.request(req)).resolves.toEqual({ value: 5 });
  });

  it("fails fast for a source in DISABLE_SOURCES and marks it down", async () => {
    const h = harness([ok(6)], { disabledSources: ["fred"] });
    await expect(h.http.request(req)).rejects.toBeInstanceOf(SourceDownError);
    expect(h.calls).toHaveLength(0);
    const status = await h.store.hgetall("source:fred");
    expect(status.status).toBe("down");
    expect(status.lastError).toBe("disabled by DISABLE_SOURCES");
  });
});

describe("HttpClient.cached", () => {
  it("serves a fresh copy within the TTL without calling again", async () => {
    const h = harness([ok(1)]);
    const fn = () => h.http.request(req);
    expect(await h.http.cached("fred", "k", 60, fn)).toEqual({ data: { value: 1 }, stale: false });
    expect(await h.http.cached("fred", "k", 60, fn)).toEqual({ data: { value: 1 }, stale: false });
    expect(h.calls).toHaveLength(1);
  });

  it("returns the stale copy when the call fails after the TTL", async () => {
    const h = harness([ok(1), { status: 400, body: "" }]);
    const fn = () => h.http.request(req);
    await h.http.cached("fred", "k", 60, fn);
    h.advance(61_000);
    expect(await h.http.cached("fred", "k", 60, fn)).toEqual({ data: { value: 1 }, stale: true });
  });

  it("rethrows when the call fails and no stale copy exists", async () => {
    const h = harness([{ status: 400, body: "" }]);
    await expect(h.http.cached("fred", "k", 60, () => h.http.request(req))).rejects.toBeInstanceOf(HttpStatusError);
  });

  it("drops the stale copy after 24 hours", async () => {
    const h = harness([ok(1), { status: 400, body: "" }]);
    const fn = () => h.http.request(req);
    await h.http.cached("fred", "k", 60, fn);
    h.advance(24 * 3_600_000 + 1);
    await expect(h.http.cached("fred", "k", 60, fn)).rejects.toBeInstanceOf(HttpStatusError);
  });
});
