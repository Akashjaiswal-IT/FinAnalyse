import { logger } from "@repo/logger";
import { env } from "../env";
import { HttpClient, type HttpDeps } from "./http";
import { getRedis, redisKvStore } from "./redis";

let shared: HttpClient | null = null;

function deps(extra: Partial<HttpDeps> = {}): HttpDeps {
  return {
    fetch: globalThis.fetch,
    store: redisKvStore(getRedis()),
    now: Date.now,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    random: Math.random,
    disabledSources: env.DISABLE_SOURCES,
    log: (level, message, meta) => logger.log(level, message, meta),
    ...extra,
  };
}

/** The process-wide wrapper: real fetch, Redis cache and status, `DISABLE_SOURCES` from the environment. */
export function defaultHttp(): HttpClient {
  shared ??= new HttpClient(deps());
  return shared;
}

/**
 * A separate client whose circuit breaker never opens. For the seed, which retries a flaky source (GDELT drops
 * connections and throttles) on its own schedule instead of failing every remaining request for five minutes.
 * The worker and the api keep `defaultHttp()` and the breaker.
 */
export function patientHttp(): HttpClient {
  return new HttpClient(deps({ breaker: false }));
}
