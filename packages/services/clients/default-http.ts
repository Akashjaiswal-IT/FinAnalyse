import { logger } from "@repo/logger";
import { env } from "../env";
import { HttpClient } from "./http";
import { getRedis, redisKvStore } from "./redis";

let shared: HttpClient | null = null;

/** The process-wide wrapper: real fetch, Redis cache and status, `DISABLE_SOURCES` from the environment. */
export function defaultHttp(): HttpClient {
  shared ??= new HttpClient({
    fetch: globalThis.fetch,
    store: redisKvStore(getRedis()),
    now: Date.now,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    random: Math.random,
    disabledSources: env.DISABLE_SOURCES,
    log: (level, message, meta) => logger.log(level, message, meta),
  });
  return shared;
}
