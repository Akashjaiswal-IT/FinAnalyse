import { z } from "zod";
import { IsoDateTime } from "./common";
import { FactorDirectionEntry, NewsEventType } from "./event";

export const NewsSource = z.enum(["gdelt", "alphavantage", "googlenews"]);
export type NewsSource = z.infer<typeof NewsSource>;

export const EntitySentiment = z.object({ symbol: z.string(), score: z.number().min(-1).max(1) });
export type EntitySentiment = z.infer<typeof EntitySentiment>;

export const NewsItem = z.object({
  id: z.string(),
  source: NewsSource,
  url: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  domain: z.string().nullable(),
  queryKey: z.string().nullable().describe("NEWS_QUERIES key or AV_ROTATION entry that fetched it"),
  publishedAt: IsoDateTime,
  fetchedAt: IsoDateTime,
  indexedAt: IsoDateTime.nullable(),
  prefilterMatch: z.boolean(),
  tickers: z.array(z.string()).describe("universe symbols named directly"),
  peerTickers: z.array(z.string()).describe("universe symbols whose competitor is named"),
  topics: z.array(z.string()),
  sourceSentiment: z.number().nullable(),
  tickerSentiment: z.record(z.string(), z.number()).nullable().describe("Alpha Vantage per-ticker scores"),
  sentiment: z.number().min(-1).max(1).nullable(),
  relevance: z.number().min(0).max(1).nullable(),
  eventType: NewsEventType.nullable(),
  entitySentiment: z.array(EntitySentiment).nullable(),
  factorDirections: z.array(FactorDirectionEntry).nullable(),
  marketEventId: z.string().nullable(),
  scoredAt: IsoDateTime.nullable(),
  scoreModel: z.string().nullable(),
});
export type NewsItem = z.infer<typeof NewsItem>;

export const NewsListInput = z.object({
  asOf: IsoDateTime.optional(),
  ticker: z.string().optional(),
  eventType: NewsEventType.optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
  before: IsoDateTime.optional(),
});
export type NewsListInput = z.infer<typeof NewsListInput>;

/** Output of the Haiku news-scoring call (batches of up to 20). */
export const Scores = z.object({
  scores: z.array(
    z.object({
      id: z.string(),
      sentiment: z.number().min(-1).max(1),
      relevance: z.number().min(0).max(1),
      eventType: NewsEventType,
      tickers: z.array(z.string()),
      entitySentiment: z.array(EntitySentiment),
      factorDirections: z.array(FactorDirectionEntry),
    }),
  ),
});
export type Scores = z.infer<typeof Scores>;
