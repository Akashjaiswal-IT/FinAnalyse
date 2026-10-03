import { z } from "zod";
import type { NewsItemInput } from "../news/model";
import type { HttpClient } from "./http";

// GDELT DOC 2.0 asks for at most one request every 5 s. Responses take 10 to 30 s, so requests run one at
// a time and the 5 s count from the end of the previous response; timeout 45 s (docs/DECISIONS.md, Track A).

export const GDELT_MIN_INTERVAL_MS = 5_000;
export const GDELT_TIMEOUT_MS = 45_000;
/** `artlist` keeps only the newest 250 records of a window. */
export const GDELT_MAX_RECORDS = 250;

export const GdeltArticle = z.object({
  url: z.string(),
  title: z.string(),
  seendate: z.string(),
  domain: z.string().optional(),
  language: z.string().optional(),
  sourcecountry: z.string().optional(),
});
export type GdeltArticle = z.infer<typeof GdeltArticle>;

/** An empty result is `{}`. */
export const GdeltArtlist = z.object({ articles: z.array(GdeltArticle).optional() });

export const GdeltTimeline = z.object({
  timeline: z
    .array(
      z.object({
        series: z.string(),
        data: z.array(z.object({ date: z.string(), value: z.number() })),
      }),
    )
    .optional(),
});
export type GdeltTimeline = z.infer<typeof GdeltTimeline>;

export interface TimelinePoint {
  at: string;
  value: number;
}

export type GdeltWindow = { start: Date; end: Date } | { timespan: string };

/** `20210826T171500Z` to ISO. */
export function parseGdeltDate(value: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (!m) throw new Error(`unexpected GDELT date ${value}`);
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`;
}

/** Date to GDELT's `YYYYMMDDHHMMSS` (UTC). */
export function formatGdeltDate(date: Date): string {
  return date.toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

export function normaliseArticles(
  articles: readonly GdeltArticle[],
  queryKey: string | null,
  fetchedAt: Date,
): NewsItemInput[] {
  return articles
    .filter((a) => !a.language || a.language === "English")
    .map((a) => ({
      source: "gdelt" as const,
      url: a.url,
      title: a.title.trim(),
      summary: null,
      domain: a.domain ?? null,
      queryKey,
      publishedAt: parseGdeltDate(a.seendate),
      fetchedAt: fetchedAt.toISOString(),
      topics: [],
      sourceSentiment: null,
      tickerSentiment: null,
    }));
}

export function parseTimeline(body: GdeltTimeline): TimelinePoint[] {
  return (body.timeline?.[0]?.data ?? []).map((d) => ({ at: parseGdeltDate(d.date), value: d.value }));
}

export class GdeltClient {
  private lastDone = Number.NEGATIVE_INFINITY;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly http: HttpClient,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  async artlist(query: string, window: GdeltWindow): Promise<GdeltArticle[]> {
    const body = await this.call(query, "artlist", window, GdeltArtlist);
    return body.articles ?? [];
  }

  /** `timelinevol` or `timelinetone`; the points of the first series. */
  async timeline(query: string, mode: "timelinevol" | "timelinetone", start: Date, end: Date): Promise<TimelinePoint[]> {
    return parseTimeline(await this.call(query, mode, { start, end }, GdeltTimeline));
  }

  /** One request at a time per client, starting at least 5 s after the previous one finished. */
  private call<T>(query: string, mode: string, window: GdeltWindow, schema: z.ZodType<T>): Promise<T> {
    const run = async () => {
      const wait = this.lastDone + GDELT_MIN_INTERVAL_MS - this.now();
      if (wait > 0) await this.sleep(wait);
      try {
        return await this.request(query, mode, window, schema);
      } finally {
        this.lastDone = this.now();
      }
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private request<T>(query: string, mode: string, window: GdeltWindow, schema: z.ZodType<T>): Promise<T> {
    const params = new URLSearchParams({ query, mode, format: "json" });
    if (mode === "artlist") params.set("maxrecords", String(GDELT_MAX_RECORDS));
    if ("timespan" in window) params.set("timespan", window.timespan);
    else {
      params.set("STARTDATETIME", formatGdeltDate(window.start));
      params.set("ENDDATETIME", formatGdeltDate(window.end));
    }
    return this.http.request({
      source: "gdelt",
      url: `https://api.gdeltproject.org/api/v2/doc/doc?${params}`,
      schema,
      timeoutMs: GDELT_TIMEOUT_MS,
      // Retries must respect the 5 s rule too (the jitter is +-25%, so 1.5x keeps every gap above 5 s).
      retryDelaysMs: [GDELT_MIN_INTERVAL_MS * 1.5, GDELT_MIN_INTERVAL_MS * 3],
    });
  }
}
