import type { AvRotationEntry } from "@repo/contracts";
import { z } from "zod";
import type { NewsItemInput } from "../news/model";
import type { HttpClient } from "./http";

export const AvFeedItem = z.object({
  title: z.string(),
  url: z.string(),
  /** `YYYYMMDDTHHMMSS`, UTC (an item at 09:18 arrived in a response fetched at about 10:20 UTC). */
  time_published: z.string(),
  summary: z.string().nullable().optional(),
  source: z.string().optional(),
  source_domain: z.string().optional(),
  topics: z.array(z.object({ topic: z.string(), relevance_score: z.string() })).default([]),
  overall_sentiment_score: z.union([z.number(), z.string()]).nullable().optional(),
  ticker_sentiment: z
    .array(z.object({ ticker: z.string(), relevance_score: z.string(), ticker_sentiment_score: z.string() }))
    .default([]),
});
export type AvFeedItem = z.infer<typeof AvFeedItem>;

export const AvNews = z.object({ feed: z.array(AvFeedItem) });

const AvEnv = z.object({ ALPHAVANTAGE_API_KEY: z.string().min(1, "ALPHAVANTAGE_API_KEY is required") });

/** Throttling and premium answers arrive with HTTP 200 and an `Information` or `Note` body (ROADMAP gotcha 1). */
export function avThrottle(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  for (const key of ["Information", "Note"] as const) {
    if (key in body) return String((body as Record<string, unknown>)[key]);
  }
  return null;
}

export function parseAvTime(value: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(value);
  if (!m) throw new Error(`unexpected Alpha Vantage time ${value}`);
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`;
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** `2022-02-24T02:40:00Z` to `20220224T0240` (Alpha Vantage time filter). */
export function avTime(d: Date): string {
  return d.toISOString().slice(0, 16).replace(/[-:]/g, "");
}

export function rotationQueryKey(entry: AvRotationEntry): string {
  return `av_${entry.kind}_${entry.value}`;
}

export function normaliseAvFeed(items: readonly AvFeedItem[], queryKey: string, fetchedAt: Date): NewsItemInput[] {
  return items.map((item) => {
    const tickerSentiment: Record<string, number> = {};
    for (const t of item.ticker_sentiment) {
      const score = toNumber(t.ticker_sentiment_score);
      if (score !== null) tickerSentiment[t.ticker] = score;
    }
    return {
      source: "alphavantage" as const,
      url: item.url,
      title: item.title.trim(),
      summary: item.summary?.trim() || null,
      domain: item.source_domain ?? null,
      queryKey,
      publishedAt: parseAvTime(item.time_published),
      fetchedAt: fetchedAt.toISOString(),
      topics: item.topics.map((t) => t.topic),
      sourceSentiment: toNumber(item.overall_sentiment_score),
      tickerSentiment: Object.keys(tickerSentiment).length ? tickerSentiment : null,
    };
  });
}

/** `NEWS_SENTIMENT` only; price endpoints are premium (SPEC 4). 25 calls a day per key. */
export class AlphaVantageClient {
  constructor(private readonly http: HttpClient) {}

  /** `window` asks for the archive (replay news); without it the newest items come back. */
  async news(entry: AvRotationEntry, limit = 50, window?: { from: Date; to: Date }): Promise<AvFeedItem[]> {
    const { ALPHAVANTAGE_API_KEY } = AvEnv.parse(process.env);
    const params = new URLSearchParams({
      function: "NEWS_SENTIMENT",
      [entry.kind]: entry.value,
      sort: window ? "RELEVANCE" : "LATEST",
      limit: String(limit),
      apikey: ALPHAVANTAGE_API_KEY,
    });
    if (window) {
      params.set("time_from", avTime(window.from));
      params.set("time_to", avTime(window.to));
    }
    const body = await this.http.request({
      source: "alphavantage",
      url: `https://www.alphavantage.co/query?${params}`,
      schema: AvNews,
      throttled: avThrottle,
    });
    return body.feed;
  }
}
