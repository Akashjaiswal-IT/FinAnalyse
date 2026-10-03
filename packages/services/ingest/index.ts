import type { SourceStatus } from "@repo/contracts";
import { notImplemented } from "../not-implemented";

export const INGEST_SOURCES = ["gdelt", "alphavantage", "nhc", "openmeteo", "fred", "tiingo"] as const;
export type IngestSource = (typeof INGEST_SOURCES)[number];

export interface IngestResult {
  source: IngestSource;
  fetched: number;
  inserted: number;
  /** null when the source was skipped (circuit open, quota used up). */
  latencyMs: number | null;
  skipped: string | null;
}

/** One pass of a source: fetch, validate, normalise, de-duplicate, prefilter, persist and index, publish (SPEC 5.2). */
export class IngestService {
  async runSource(name: IngestSource): Promise<IngestResult> {
    return notImplemented(name);
  }

  async status(): Promise<SourceStatus[]> {
    return notImplemented();
  }
}
