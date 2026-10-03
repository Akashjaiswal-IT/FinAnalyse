import type { LiveEvent, SourceName, SourceStatus, SystemStatus } from "@repo/contracts";
import { notImplemented } from "../not-implemented";

export interface IngestLatency {
  p50Ms: number | null;
  p95Ms: number | null;
  count: number;
  windowHours: number;
}

/** Source health, ingest latency and the live relay (SPEC 5.2, 5.13, TEAM rule 10). */
export class SystemService {
  async status(): Promise<SystemStatus> {
    return notImplemented();
  }

  async sourceStatus(): Promise<SourceStatus[]> {
    return notImplemented();
  }

  /** p50 and p95 of `indexed_at - fetched_at` over indexed news in the window. */
  async ingestLatency(windowHours: number): Promise<IngestLatency> {
    return notImplemented(windowHours);
  }

  /** Queues immediate GDELT and NHC jobs (and Alpha Vantage if quota remains); returns the queued sources. */
  async ingestNow(sources?: readonly SourceName[]): Promise<SourceName[]> {
    return notImplemented(sources);
  }
}

/** Publish one `LiveEvent` on the Redis channel `live` (worker side). */
export async function publishLive(event: LiveEvent): Promise<void> {
  return notImplemented(event);
}

/**
 * Subscribe once to the Redis channel `live` (api side); invalid messages are dropped and logged.
 * Resolves to an unsubscribe function.
 */
export async function subscribeLive(onEvent: (event: LiveEvent) => void): Promise<() => Promise<void>> {
  return notImplemented(onEvent);
}
