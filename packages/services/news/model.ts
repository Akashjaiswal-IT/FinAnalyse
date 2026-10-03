import { z } from "zod";
import { EventType, IsoDateTime, NewsEventType, NewsItem, NewsSource } from "@repo/contracts";

/** A normalised item before it is stored: ids, scores and timestamps are set by `upsertBatch`. */
export const NewsItemInput = z.object({
  source: NewsSource,
  url: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  domain: z.string().nullable(),
  queryKey: z.string().nullable(),
  publishedAt: IsoDateTime,
  fetchedAt: IsoDateTime,
  topics: z.array(z.string()),
  sourceSentiment: z.number().nullable(),
  tickerSentiment: z.record(z.string(), z.number()).nullable(),
});
export type NewsItemInput = z.infer<typeof NewsItemInput>;

export const UpsertBatchResult = z.object({
  inserted: z.array(z.string()).describe("ids of new rows"),
  duplicates: z.number().int(),
  prefiltered: z.array(z.string()).describe("ids of new rows that passed the prefilter"),
  indexed: z.array(z.string()).describe("ids embedded in Pinecone; `indexed_at` is set"),
  latencyMs: z.number().describe("`fetched_at` to both writes acknowledged, slowest item"),
});
export type UpsertBatchResult = z.infer<typeof UpsertBatchResult>;

export const NewsSearchOptions = z.object({
  asOf: z.date(),
  windowHours: z.number().positive().optional(),
  tickers: z.array(z.string()).optional(),
  eventTypes: z.array(EventType).optional(),
  topK: z.number().int().positive().optional(),
});
export type NewsSearchOptions = z.infer<typeof NewsSearchOptions>;

export const NewsSearchHit = z.object({ item: NewsItem, score: z.number().describe("Pinecone score") });
export type NewsSearchHit = z.infer<typeof NewsSearchHit>;

export const NewsFilters = z.object({
  asOf: z.date(),
  ticker: z.string().optional(),
  eventType: NewsEventType.optional(),
  limit: z.number().int().positive(),
  before: z.date().optional(),
});
export type NewsFilters = z.infer<typeof NewsFilters>;

/** Scored news per event type per day, for `cluster_z` (SPEC 5.14 step 4). */
export const TypeCount = z.object({ eventType: EventType, date: z.iso.date(), count: z.number().int() });
export type TypeCount = z.infer<typeof TypeCount>;

/** GDELT timeline features over a window against the 28 days before it (SPEC 5.9). */
export const NewsFeatures = z.object({
  query: z.string(),
  windowStart: IsoDateTime,
  windowEnd: IsoDateTime,
  volZ: z.number().nullable(),
  toneZ: z.number().nullable(),
});
export type NewsFeatures = z.infer<typeof NewsFeatures>;
