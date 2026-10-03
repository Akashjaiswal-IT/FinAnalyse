import type { AnalogEvent, EventType } from "@repo/contracts";
import { notImplemented } from "../not-implemented";

export interface AnalogSearchOptions {
  asOf: Date;
  types?: readonly EventType[];
  topK?: number;
}

export interface AnalogSearchHit {
  event: AnalogEvent;
  similarity: number;
}

/** Historical events (Pinecone `events` namespace plus `analog_events`). */
export class AnalogsService {
  /** Only events with `realized_until < asOf` (SPEC 5.1): never the replayed event or any later one. */
  async search(text: string, options: AnalogSearchOptions): Promise<AnalogSearchHit[]> {
    return notImplemented(text, options);
  }

  async get(ids: readonly string[]): Promise<AnalogEvent[]> {
    return notImplemented(ids);
  }

  /** Every event, or one type; eligible-at-`asOf` filtering is the caller's (backtest needs all). */
  async list(type?: EventType): Promise<AnalogEvent[]> {
    return notImplemented(type);
  }

  /** Pre-outcome fields of a replay preset's own row (SPEC 5.1): never `reactions` or `features`. */
  async presetEvent(
    id: string,
  ): Promise<Pick<AnalogEvent, "id" | "name" | "type" | "subtype" | "firstReportAt" | "entities" | "affectedSectors" | "gdeltQuery" | "sources"> | null> {
    return notImplemented(id);
  }
}
