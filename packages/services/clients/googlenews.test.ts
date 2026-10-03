import { NEWS_QUERIES } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { fixtureText } from "../test-fixtures";
import {
  GOOGLE_NEWS_QUERIES,
  GoogleNewsClient,
  MAX_URL_CHARS,
  MAX_WINDOW_HOURS,
  MIN_WINDOW_HOURS,
  SEARCH_SPACING_MS,
  parseGoogleNewsRss,
  searchUrl,
  windowHours,
  type GoogleNewsQuery,
} from "./googlenews";
import { HttpClient } from "./http";
import { MemoryKvStore } from "./kv";

// Parse tests on a recorded response (data/fixtures/googlenews-search.xml, see its README). No live HTTP.
const RSS = fixtureText("googlenews-search.xml");
const HOUR = 3_600_000;

describe("parseGoogleNewsRss", () => {
  const items = parseGoogleNewsRss(RSS);

  it("reads every item of the recorded feed", () => {
    expect(items).toHaveLength(5);
    expect(items.every((i) => i.url.startsWith("https://news.google.com/rss/articles/"))).toBe(true);
  });
  it("takes the headline without the publisher Google appends, the publisher and its host", () => {
    expect(items[0]).toMatchObject({
      title: "Modi’s India takes on Trump more openly, from ‘terrorism’ to tariffs",
      publisher: "Al Jazeera",
      domain: "aljazeera.com",
      publishedAt: "2026-10-01T11:08:50.000Z",
    });
    expect(items[2]?.domain).toBe("reuters.com");
    expect(items[1]?.domain).toBe("timesofindia.indiatimes.com");
  });
  it("decodes entities in the headline", () => {
    expect(items[1]?.title).toBe("‘Trump Tariff War & Canada Oil Exit?’: Mark Carney ‘Robs’ U.S. Of 100 Billion With Energy Gambit");
  });
  it("skips an item without a title, a link or a valid date, and keeps a title that does not end with the publisher", () => {
    const xml = `<rss><channel>
      <item><title>No link - A</title><pubDate>Sat, 03 Oct 2026 10:00:00 GMT</pubDate></item>
      <item><title>Bad date - A</title><link>https://x/1</link><pubDate>yesterday</pubDate></item>
      <item><title></title><link>https://x/2</link><pubDate>Sat, 03 Oct 2026 10:00:00 GMT</pubDate></item>
      <item><title>Plain title</title><link>https://x/3?a=1&amp;b=2</link><pubDate>Sat, 03 Oct 2026 10:00:00 GMT</pubDate><source url="https://www.example.com/news">Example Daily</source></item>
      <item><title><![CDATA[Cdata title - Other]]></title><link>https://x/4</link><pubDate>Sat, 03 Oct 2026 10:05:00 GMT</pubDate></item>
    </channel></rss>`;
    expect(parseGoogleNewsRss(xml)).toEqual([
      { title: "Plain title", url: "https://x/3?a=1&b=2", publishedAt: "2026-10-03T10:00:00.000Z", publisher: "Example Daily", domain: "example.com" },
      { title: "Cdata title - Other", url: "https://x/4", publishedAt: "2026-10-03T10:05:00.000Z", publisher: null, domain: null },
    ]);
  });
  it("skips a link too long for the unique index on news_items.url", () => {
    const item = (url: string) =>
      `<item><title>Headline - X</title><link>${url}</link><pubDate>Sat, 03 Oct 2026 10:00:00 GMT</pubDate></item>`;
    const xml = `<rss><channel>${item(`https://news.google.com/rss/articles/${"A".repeat(MAX_URL_CHARS)}`)}${item("https://news.google.com/rss/articles/ok")}</channel></rss>`;
    expect(parseGoogleNewsRss(xml).map((i) => i.url)).toEqual(["https://news.google.com/rss/articles/ok"]);
  });
  it("returns nothing for an empty or unexpected document", () => {
    expect(parseGoogleNewsRss("")).toEqual([]);
    expect(parseGoogleNewsRss("<html>Sorry, we are blocking you</html>")).toEqual([]);
  });
});

describe("queries", () => {
  it("has one query per DOC API collection query, without GDELT's language filter, plus Trump and India", () => {
    expect(GOOGLE_NEWS_QUERIES.map((q) => q.key)).toEqual([...Object.keys(NEWS_QUERIES), "trump", "india"]);
    expect(GOOGLE_NEWS_QUERIES.some((q) => q.q.includes("sourcelang"))).toBe(false);
    expect(GOOGLE_NEWS_QUERIES.find((q) => q.key === "policy")?.q).toBe(
      '(tariff OR tariffs OR "tax increase" OR "new law" OR regulation OR "executive order")',
    );
  });
  it("asks the Indian edition for the India query", () => {
    expect(GOOGLE_NEWS_QUERIES.find((q) => q.key === "india")).toMatchObject({ hl: "en-IN", gl: "IN", ceid: "IN:en" });
    expect(GOOGLE_NEWS_QUERIES.find((q) => q.key === "macro")).toMatchObject({ hl: "en-US", gl: "US", ceid: "US:en" });
  });
  it("builds the search URL with the look-back window in `when:`", () => {
    const q: GoogleNewsQuery = { key: "k", q: "tariff OR tariffs", hl: "en-US", gl: "US", ceid: "US:en" };
    const url = new URL(searchUrl(q, 3));
    expect(url.origin + url.pathname).toBe("https://news.google.com/rss/search");
    expect(url.searchParams.get("q")).toBe("tariff OR tariffs when:3h");
    expect(url.searchParams.get("ceid")).toBe("US:en");
    expect(new URL(searchUrl(q, 24)).searchParams.get("q")).toBe("tariff OR tariffs when:1d");
    expect(new URL(searchUrl(q, 2.2)).searchParams.get("q")).toBe("tariff OR tariffs when:3h");
  });
});

describe("windowHours", () => {
  const now = Date.parse("2026-10-03T12:00:00Z");
  it("looks back a day on the first pass", () => {
    expect(windowHours(null, now)).toBe(MAX_WINDOW_HOURS);
    expect(windowHours(Number.NaN, now)).toBe(MAX_WINDOW_HOURS);
  });
  it("looks back to the last pass plus one hour, within the limits", () => {
    expect(windowHours(now - 10 * 60_000, now)).toBe(MIN_WINDOW_HOURS);
    expect(windowHours(now - 3.2 * HOUR, now)).toBe(5);
    expect(windowHours(now - 100 * HOUR, now)).toBe(MAX_WINDOW_HOURS);
  });
});

describe("GoogleNewsClient.collect", () => {
  type Reply = { status: number; body: string };
  function setup(replies: Reply[]) {
    const calls: string[] = [];
    const sleeps: number[] = [];
    const sleep = async (ms: number) => void sleeps.push(ms);
    const http = new HttpClient({
      fetch: (async (input: string | URL | Request) => {
        calls.push(String(input));
        const reply = replies.shift();
        if (!reply) throw new Error("no reply queued");
        return new Response(reply.body, { status: reply.status });
      }) as typeof globalThis.fetch,
      store: new MemoryKvStore(() => 0),
      now: () => 0,
      sleep,
      random: () => 0.5,
      disabledSources: [],
      log: () => undefined,
    });
    return { client: new GoogleNewsClient(http, sleep), calls, sleeps };
  }
  const q = (key: string): GoogleNewsQuery => ({ key, q: key, hl: "en-US", gl: "US", ceid: "US:en" });
  const at = "2026-10-03T12:00:00.000Z";

  it("turns the items into news items, keeps an article once under the first query that found it, and pauses between searches", async () => {
    const { client, calls, sleeps } = setup([
      { status: 200, body: RSS },
      { status: 200, body: RSS },
    ]);
    const out = await client.collect(3, at, [q("policy"), q("india")]);
    expect(out.queried).toBe(2);
    expect(out.failed).toEqual([]);
    expect(out.items).toHaveLength(5); // the second search found the same five articles
    expect(out.items.every((i) => i.queryKey === "policy")).toBe(true);
    expect(out.items[0]).toEqual({
      source: "googlenews",
      url: expect.stringContaining("https://news.google.com/rss/articles/"),
      title: "Modi’s India takes on Trump more openly, from ‘terrorism’ to tariffs",
      summary: null,
      domain: "aljazeera.com",
      queryKey: "policy",
      publishedAt: "2026-10-01T11:08:50.000Z",
      fetchedAt: at,
      topics: [],
      sourceSentiment: null,
      tickerSentiment: null,
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("when%3A3h");
    expect(sleeps).toEqual([SEARCH_SPACING_MS]); // between the two searches, not before the first
  });
  it("reports a failing query and still returns what the others found", async () => {
    const { client } = setup([
      { status: 400, body: "bad request" },
      { status: 200, body: RSS },
    ]);
    const out = await client.collect(3, at, [q("accident"), q("india")]);
    expect(out.failed).toHaveLength(1);
    expect(out.failed[0]?.key).toBe("accident");
    expect(out.items).toHaveLength(5);
    expect(out.items[0]?.queryKey).toBe("india");
  });
  it("reports every query as failed when the service refuses all of them", async () => {
    const { client } = setup([
      { status: 400, body: "no" },
      { status: 400, body: "no" },
    ]);
    const out = await client.collect(3, at, [q("a"), q("b")]);
    expect(out.items).toEqual([]);
    expect(out.failed.map((f) => f.key)).toEqual(["a", "b"]);
  });
});
