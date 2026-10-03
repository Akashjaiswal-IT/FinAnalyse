import { afterAll, describe, expect, it } from "vitest";
import { createRedisConnection, quotaKey, quotaUsed, redisKvStore, returnQuota, takeQuota } from "./redis";

// Runs against the Redis from docker compose (CI starts one too).
const redis = createRedisConnection({ maxRetriesPerRequest: 1 });
const name = `test-${process.pid}-${Date.now()}`;
const now = new Date("2026-10-03T12:00:00Z");

afterAll(async () => {
  await redis.del(quotaKey(name, now), `cache:${name}`, `source:${name}`);
  await redis.quit();
});

describe("redis client", () => {
  it("names quota keys by UTC date", () => {
    expect(quotaKey("alphavantage", new Date("2026-10-03T23:59:59Z"))).toBe("quota:alphavantage:2026-10-03");
  });

  it("takes a daily quota up to the limit and never past it", async () => {
    const taken = [];
    for (let i = 0; i < 4; i++) taken.push(await takeQuota(redis, name, 3, now));
    expect(taken).toEqual([true, true, true, false]);
    expect(await quotaUsed(redis, name, now)).toBe(3);
    expect(await redis.ttl(quotaKey(name, now))).toBeGreaterThan(86_400);

    await returnQuota(redis, name, 2, now);
    expect(await quotaUsed(redis, name, now)).toBe(1);
    expect(await takeQuota(redis, name, 3, now)).toBe(true);
  });

  it("implements the KvStore used by the HTTP wrapper", async () => {
    const store = redisKvStore(redis);
    await store.setEx(`cache:${name}`, 60, "v");
    expect(await store.get(`cache:${name}`)).toBe("v");
    await store.hset(`source:${name}`, { status: "ok", lastLatencyMs: "12" });
    expect(await store.hgetall(`source:${name}`)).toEqual({ status: "ok", lastLatencyMs: "12" });
  });
});
