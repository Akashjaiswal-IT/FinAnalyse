import { NEWS_QUERIES } from "@repo/contracts";
import { z } from "zod";
import type { NewsItemInput } from "../news/model";
import { decodeEntities } from "./gdelt-files";
import type { HttpClient } from "./http";

// Google News search as RSS: free, no key, reachable where GDELT's DOC API is throttled, and headlines appear within
// minutes of publication. GDELT's article files (clients/gdelt-files.ts) are published about an hour late and carry
// only a sample of the web. This source is the fresh one; GDELT stays for tone and volume.

export const GOOGLE_NEWS_BASE = "https://news.google.com/rss/search";
/** Pause between two searches, so a pass of a dozen requests does not look like a burst. */
export const SEARCH_SPACING_MS = 1_000;
const SEARCH_TIMEOUT_MS = 20_000;
/** A pass looks back to the last complete pass, never less than this many hours (Google rounds `when:` coarsely). */
export const MIN_WINDOW_HOURS = 2;
/** First pass, and the longest catch-up after a pause. */
export const MAX_WINDOW_HOURS = 24;
/**
 * `news_items.url` has a unique index and a btree entry cannot exceed 2,704 bytes. A few Google links (well under
 * 1% in a day of results) are longer; one of them fails the whole batch insert, so they are left out.
 */
export const MAX_URL_CHARS = 2_000;
const HOUR_MS = 3_600_000;

export interface GoogleNewsQuery {
  /** Stored as the item's `queryKey`. */
  key: string;
  q: string;
  hl: string;
  gl: string;
  ceid: string;
}

const US = { hl: "en-US", gl: "US", ceid: "US:en" };
const IN = { hl: "en-IN", gl: "IN", ceid: "IN:en" };

/**
 * The collection queries of the DOC API (`NEWS_QUERIES`: one per event type plus company names), without GDELT's
 * language filter. Google reads the same `OR`, quotes and implicit AND. Two more cover what the event-type queries
 * rank out of their top 100: Trump's statements on trade and sanctions, and India (Indian edition, so Indian outlets
 * are included). A bare "Modi" is left out: it returns domestic politics.
 */
export const GOOGLE_NEWS_QUERIES: readonly GoogleNewsQuery[] = [
  ...Object.entries(NEWS_QUERIES).map(([key, q]) => ({ key, q: q.replace(/\s*sourcelang:\w+/g, "").trim(), ...US })),
  { key: "trump", q: 'Trump (tariff OR tariffs OR sanctions OR "executive order" OR "trade deal" OR "export ban")', ...US },
  { key: "india", q: 'India (tariff OR tariffs OR "trade deal" OR sanctions OR "Russian oil" OR rupee OR RBI)', ...IN },
];

/** Hours to look back: since the last complete pass (plus one), within `MIN_WINDOW_HOURS` to `MAX_WINDOW_HOURS`. */
export function windowHours(lastPassMs: number | null, nowMs: number): number {
  if (lastPassMs === null || Number.isNaN(lastPassMs)) return MAX_WINDOW_HOURS;
  const hours = Math.ceil((nowMs - lastPassMs) / HOUR_MS) + 1;
  return Math.min(MAX_WINDOW_HOURS, Math.max(MIN_WINDOW_HOURS, hours));
}

export function searchUrl(query: GoogleNewsQuery, hours: number): string {
  const when = hours >= 24 ? "when:1d" : `when:${Math.max(1, Math.ceil(hours))}h`;
  const params = new URLSearchParams({ q: `${query.q} ${when}`, hl: query.hl, gl: query.gl, ceid: query.ceid });
  return `${GOOGLE_NEWS_BASE}?${params.toString()}`;
}

export interface RssItem {
  /** The headline without the " - Publisher" Google appends. */
  title: string;
  /** Google's own article link (it redirects to the publisher); stable for an article. */
  url: string;
  publishedAt: string;
  publisher: string | null;
  /** Host of the publisher's site, without `www.`. */
  domain: string | null;
}

function field(block: string, name: string): string | null {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(block);
  if (!m) return null;
  const text = decodeEntities((m[1] as string).replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1")).trim();
  return text === "" ? null : text;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** The items of a Google News RSS document; an item without a title, a link or a valid date, or with a link over `MAX_URL_CHARS`, is skipped. */
export function parseGoogleNewsRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1] as string;
    const title = field(block, "title");
    const url = field(block, "link");
    const published = field(block, "pubDate");
    const ms = published ? Date.parse(published) : Number.NaN;
    if (!title || !url || url.length > MAX_URL_CHARS || Number.isNaN(ms)) continue;
    const source = /<source\s+url="([^"]*)"[^>]*>([\s\S]*?)<\/source>/.exec(block);
    const publisher = source ? decodeEntities((source[2] as string).trim()) || null : null;
    items.push({
      title: publisher && title.endsWith(` - ${publisher}`) ? title.slice(0, -(publisher.length + 3)) : title,
      url,
      publishedAt: new Date(ms).toISOString(),
      publisher,
      domain: source ? hostOf(decodeEntities(source[1] as string)) : null,
    });
  }
  return items;
}

export interface CollectResult {
  items: NewsItemInput[];
  queried: number;
  failed: { key: string; message: string }[];
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class GoogleNewsClient {
  constructor(
    private readonly http: HttpClient,
    private readonly sleep: (ms: number) => Promise<void> = wait,
  ) {}

  async search(query: GoogleNewsQuery, hours: number): Promise<RssItem[]> {
    const xml = await this.http.request({
      source: "googlenews",
      url: searchUrl(query, hours),
      schema: z.string(),
      body: "text",
      timeoutMs: SEARCH_TIMEOUT_MS,
    });
    return parseGoogleNewsRss(xml);
  }

  /**
   * Runs every query one after another. A query that fails is reported and the others still run; an article found by
   * several queries is kept once, under the first query that found it.
   */
  async collect(hours: number, fetchedAt: string, queries: readonly GoogleNewsQuery[] = GOOGLE_NEWS_QUERIES): Promise<CollectResult> {
    const byUrl = new Map<string, NewsItemInput>();
    const failed: CollectResult["failed"] = [];
    for (const [i, query] of queries.entries()) {
      if (i > 0) await this.sleep(SEARCH_SPACING_MS);
      try {
        for (const item of await this.search(query, hours)) {
          if (byUrl.has(item.url)) continue;
          byUrl.set(item.url, {
            source: "googlenews",
            url: item.url,
            title: item.title,
            summary: null,
            domain: item.domain,
            queryKey: query.key,
            publishedAt: item.publishedAt,
            fetchedAt,
            topics: [],
            sourceSentiment: null,
            tickerSentiment: null,
          });
        }
      } catch (error) {
        failed.push({ key: query.key, message: error instanceof Error ? error.message : String(error) });
      }
    }
    return { items: [...byUrl.values()], queried: queries.length, failed };
  }
}
