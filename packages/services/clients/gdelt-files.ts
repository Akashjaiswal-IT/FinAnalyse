import { inflateRawSync } from "node:zlib";
import { z } from "zod";
import type { NewsItemInput } from "../news/model";
import { prefilter } from "../news/prefilter";
import { HttpStatusError, type HttpClient } from "./http";

// GDELT publishes every 15 minutes a file of the articles it saw (GKG: headline, domain, topic themes and its own
// tone score). The files sit on a static host and are not covered by the "one request per 5 s" limit of the DOC API
// search that blocks this team's network. They are the live source for the worker's `gdelt` job.

export const GDELT_FILES_BASE = "https://data.gdeltproject.org/gdeltv2";
export const STEP_MS = 15 * 60_000;
/** Files fetched in one pass at most: the first pass reaches 3 hours back, later passes catch up from the last one. */
export const MAX_FILES_PER_PASS = 12;
/** Download timeout: a file is about 3 MB. */
const FILE_TIMEOUT_MS = 60_000;
/** GDELT tone is roughly -10 to +10 for an article; the sentiment scale of a news item is -1 to 1. */
const TONE_SCALE = 10;

/**
 * Themes precise enough to mark market news. The broad EPU_ and WB_ themes tag over half of all articles, and ENV_OIL
 * tags anything that mentions fuel (a car review, a bridge strike), so they do not count.
 */
export const MARKET_THEMES: ReadonlySet<string> = new Set([
  "ECON_STOCKMARKET",
  "ECON_OILPRICE",
  "ECON_INTEREST_RATES",
  "ECON_INFLATION",
  "ECON_CENTRALBANK",
  "ECON_BANKRUPTCY",
  "ECON_TRADE_DISPUTE",
  "ECON_EARNINGSREPORT",
]);

/** `20261003163000` (UTC) to epoch milliseconds. */
export function stampToMs(stamp: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(stamp);
  if (!m) throw new Error(`unexpected GDELT stamp ${stamp}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
}

export function msToStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

export function stampToIso(stamp: string): string {
  return new Date(stampToMs(stamp)).toISOString();
}

/** The newest GKG file named in `lastupdate.txt`, as a stamp, or null. */
export function latestGkgStamp(lastUpdate: string): string | null {
  const m = /\/(\d{14})\.gkg\.csv\.zip/.exec(lastUpdate);
  return m ? (m[1] as string) : null;
}

/**
 * The stamps to fetch, oldest first: every 15 minutes after `last` up to `newest` (the newest `max` of them), or
 * the `max` stamps ending at `newest` when nothing was fetched before.
 */
export function stampsToFetch(last: string | null, newest: string, max = MAX_FILES_PER_PASS): string[] {
  const end = stampToMs(newest);
  const start = last === null ? end - (max - 1) * STEP_MS : Math.max(stampToMs(last) + STEP_MS, end - (max - 1) * STEP_MS);
  const out: string[] = [];
  for (let t = start; t <= end; t += STEP_MS) out.push(msToStamp(t));
  return out;
}

/** The text of the only entry of a zip archive (stored or deflated). */
export function readZipText(zip: Uint8Array): string {
  const buf = Buffer.from(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip archive");
  const central = buf.readUInt32LE(eocd + 16);
  if (buf.readUInt32LE(central) !== 0x02014b50) throw new Error("zip central directory not found");
  const method = buf.readUInt16LE(central + 10);
  const compressedSize = buf.readUInt32LE(central + 20);
  const local = buf.readUInt32LE(central + 42);
  if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error("zip local header not found");
  const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
  const data = buf.subarray(start, start + compressedSize);
  if (method === 0) return data.toString("utf8");
  if (method === 8) return inflateRawSync(data).toString("utf8");
  throw new Error(`unsupported zip compression method ${method}`);
}

export interface GkgRow {
  id: string;
  /** ISO datetime of the 15-minute slice the article was seen in. */
  publishedAt: string;
  domain: string;
  url: string;
  themes: ReadonlySet<string>;
  /** GDELT's average tone of the article, or null. */
  tone: number | null;
  title: string | null;
  /** Machine-translated from another language. */
  translated: boolean;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) return String.fromCodePoint(parseInt(body.slice(2), 16));
    if (body.startsWith("#")) return String.fromCodePoint(parseInt(body.slice(1), 10));
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** Rows of a GKG 2.1 file: tab-separated, `V2Themes` is column 8, `V2Tone` 15, `TranslationInfo` 25, `Extras` 26. */
export function parseGkg(tsv: string): GkgRow[] {
  const rows: GkgRow[] = [];
  for (const line of tsv.split("\n")) {
    if (!line) continue;
    const c = line.split("\t");
    if (c.length < 16 || !c[4] || !/^\d{14}$/.test(c[1] ?? "")) continue;
    const toneText = (c[15] ?? "").split(",")[0] ?? "";
    const tone = toneText === "" || Number.isNaN(Number(toneText)) ? null : Number(toneText);
    const title = /<PAGE_TITLE>([\s\S]*?)<\/PAGE_TITLE>/.exec(c[26] ?? "")?.[1];
    rows.push({
      id: c[0] ?? "",
      publishedAt: stampToIso(c[1] as string),
      domain: c[3] ?? "",
      url: c[4],
      themes: new Set((c[8] ?? "").split(";").map((t) => t.split(",")[0] ?? "").filter(Boolean)),
      tone,
      title: title ? decodeEntities(title).trim() : null,
      translated: (c[25] ?? "") !== "",
    });
  }
  return rows;
}

/**
 * News items for the market-relevant articles of a file. An article is kept when it names a universe company or its
 * competitor (the project's prefilter), or carries a precise market theme. A bare event keyword is not enough here:
 * "crash" or "fire" alone tags road accidents in a feed of every article GDELT sees. A headline is kept once.
 */
export function toNewsItems(rows: readonly GkgRow[], fetchedAt: string): NewsItemInput[] {
  const items: NewsItemInput[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.translated || !row.title || row.title.length < 15) continue;
    // Wire stories are syndicated to dozens of domains under one headline: keep the first.
    const headline = row.title.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(headline)) continue;
    const marketThemes = [...row.themes].filter((t) => MARKET_THEMES.has(t));
    const hit = prefilter({ title: row.title, summary: null, tickerSentiment: null });
    if (hit.tickers.length === 0 && hit.peerTickers.length === 0 && marketThemes.length === 0) continue;
    seen.add(headline);
    items.push({
      source: "gdelt",
      url: row.url,
      title: row.title,
      summary: null,
      domain: row.domain || null,
      queryKey: "gkg",
      publishedAt: row.publishedAt,
      fetchedAt,
      topics: marketThemes,
      sourceSentiment: row.tone === null ? null : Math.max(-1, Math.min(1, row.tone / TONE_SCALE)),
      tickerSentiment: null,
    });
  }
  return items;
}

export class GdeltFilesClient {
  constructor(private readonly http: HttpClient) {}

  /** The stamp of the newest file `lastupdate.txt` lists. It may not be published yet (see `file`). */
  async newestStamp(): Promise<string | null> {
    const text = await this.http.request({
      source: "gdelt",
      url: `${GDELT_FILES_BASE}/lastupdate.txt`,
      schema: z.string(),
      body: "text",
      timeoutMs: 20_000,
    });
    return latestGkgStamp(text);
  }

  /** The rows of one 15-minute file, or null when it is not published yet (404). */
  async file(stamp: string): Promise<GkgRow[] | null> {
    try {
      const zip = await this.http.request({
        source: "gdelt",
        url: `${GDELT_FILES_BASE}/${stamp}.gkg.csv.zip`,
        schema: z.instanceof(Uint8Array),
        body: "bytes",
        timeoutMs: FILE_TIMEOUT_MS,
        neutralStatuses: [404],
      });
      return parseGkg(readZipText(zip));
    } catch (error) {
      if (error instanceof HttpStatusError && error.status === 404) return null;
      throw error;
    }
  }
}
