import type {
  EventProfile,
  EventsListInput,
  EventType,
  MarketEvent,
  MarketEventView,
  NewsItem,
  Unavailable,
} from "@repo/contracts";
import { notImplemented } from "../not-implemented";

export type MarketEventDetail = MarketEvent & { topNews: NewsItem[] };

export interface DetectResult {
  detected: string[];
  updated: string[];
  faded: string[];
}

/** Fields `buildEventQuery` reads (SPEC 5.9). */
export type EventQueryInput = Pick<EventProfile, "type" | "entities" | "externalNames">;

/** Live market events (SPEC 5.14). */
export class EventsService {
  /** Events with `first_seen_at <= asOf`, counts recomputed from news visible at `asOf`. */
  async active(asOf: Date): Promise<MarketEventView[]> {
    return notImplemented(asOf);
  }

  async list(input: EventsListInput, asOf: Date): Promise<MarketEventView[]> {
    return notImplemented(input, asOf);
  }

  async get(id: string): Promise<MarketEventDetail | null> {
    return notImplemented(id);
  }

  /** P1 `detect` job: cluster scored news (quant/detect.ts), upsert `market_events`. */
  async detect(asOf: Date): Promise<DetectResult> {
    return notImplemented(asOf);
  }

  /** Pinecone news search plus the Haiku classification of the top hits, until detection lands. */
  async profileFromNews(query: string, asOf: Date, typeHint?: EventType): Promise<EventProfile | Unavailable> {
    return notImplemented(query, asOf, typeHint);
  }

  /** ORs the two most frequent entity names with the type's `EVENT_KEYWORDS`, plus `sourcelang:english`. */
  buildEventQuery(profile: EventQueryInput): string {
    return notImplemented(profile);
  }
}
