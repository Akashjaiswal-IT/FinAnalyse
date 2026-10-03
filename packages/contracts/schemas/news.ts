import { z } from "zod";
import { IsoDateTime } from "./common";

export const NewsSource = z.enum(["gdelt", "alphavantage"]);
export type NewsSource = z.infer<typeof NewsSource>;

export const NewsItem = z.object({
  id: z.string(),
  source: NewsSource,
  url: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  domain: z.string().nullable(),
  publishedAt: IsoDateTime,
  fetchedAt: IsoDateTime,
  indexedAt: IsoDateTime.nullable(),
  tickers: z.array(z.string()),
  topics: z.array(z.string()),
  sourceSentiment: z.number().nullable(),
  sentiment: z.number().min(-1).max(1).nullable(),
  relevance: z.number().min(0).max(1).nullable(),
  scoredAt: IsoDateTime.nullable(),
  scoreModel: z.string().nullable(),
});
export type NewsItem = z.infer<typeof NewsItem>;

export const NewsListInput = z.object({
  asOf: IsoDateTime.optional(),
  ticker: z.string().optional(),
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
      tickers: z.array(z.string()),
    }),
  ),
});
export type Scores = z.infer<typeof Scores>;
