import type { NewsItem } from "@repo/contracts";
import { notImplemented } from "../not-implemented";
import type {
  NewsFeatures,
  NewsFilters,
  NewsItemInput,
  NewsSearchHit,
  NewsSearchOptions,
  TypeCount,
  UpsertBatchResult,
} from "./model";

export * from "./model";

/** Stale cache copy or an explicit gap; nodes never substitute invented values (SPEC 5.3). */
export type Maybe<T> = { data: T; stale: boolean } | { unavailable: string };

export class NewsService {
  /** De-duplicate by URL, prefilter and tag, write Postgres and Pinecone in parallel, set `indexed_at` (SPEC 5.2). */
  async upsertBatch(items: readonly NewsItemInput[]): Promise<UpsertBatchResult> {
    return notImplemented(items);
  }

  /** Pinecone search, then Postgres hydration, inside `[asOf - windowHours, asOf]` (default 72 h). */
  async search(text: string, options: NewsSearchOptions): Promise<NewsSearchHit[]> {
    return notImplemented(text, options);
  }

  /** Newest first, `published_at <= asOf`. */
  async list(filters: NewsFilters): Promise<NewsItem[]> {
    return notImplemented(filters);
  }

  /** Score up to `limit` prefiltered, unscored items through `services/llm`; returns the scored ids. */
  async scoreUnscored(limit: number): Promise<string[]> {
    return notImplemented(limit);
  }

  async typeCounts(asOf: Date, days: number): Promise<TypeCount[]> {
    return notImplemented(asOf, days);
  }

  /** One function for every event's news features (SPEC 5.9): GDELT tone and volume timelines. */
  async newsFeatures(query: string, windowStart: Date, windowEnd: Date): Promise<Maybe<NewsFeatures>> {
    return notImplemented(query, windowStart, windowEnd);
  }
}
