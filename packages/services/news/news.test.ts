import db, { inArray, like } from "@repo/database";
import { newsItems } from "@repo/database/schema";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PineconeClient, type PineconeIndexLike } from "../clients/pinecone";
import { NewsService, newsRecordId, newsText } from "./index";
import type { NewsItemInput } from "./model";

const URL_PREFIX = "https://zz-test.example/";
const UKRAINE_AS_OF = new Date("2022-02-25T02:40:00.000Z");

/** In-memory Pinecone: stores records and applies the publishedAt range and tickers filters. */
function fakePinecone(fail = false) {
  const store = new Map<string, Record<string, unknown>>();
  const index: PineconeIndexLike = {
    upsertRecords: async ({ records }) => {
      if (fail) throw new Error("pinecone down");
      for (const r of records) store.set(String(r._id), r);
    },
    searchRecords: async ({ query }) => {
      const f = (query.filter ?? {}) as { publishedAt?: { $gte: number; $lte: number } };
      const hits = [...store.values()]
        .filter((r) => !f.publishedAt || ((r.publishedAt as number) >= f.publishedAt.$gte && (r.publishedAt as number) <= f.publishedAt.$lte))
        .map((r, i) => ({ _id: String(r._id), _score: 1 - i / 100, fields: { newsId: r.newsId } }));
      return { result: { hits: hits.slice(0, query.topK) } };
    },
    describeIndexStats: async () => ({}),
  };
  return { store, client: new PineconeClient(index) };
}

const item = (slug: string, title: string, publishedAt: string, summary: string | null = null): NewsItemInput => ({
  source: "gdelt",
  url: `${URL_PREFIX}${slug}`,
  title,
  summary,
  domain: "zz-test.example",
  queryKey: "geopolitical",
  publishedAt,
  fetchedAt: "2022-02-25T02:00:00.000Z",
  topics: [],
  sourceSentiment: null,
  tickerSentiment: null,
});

const cleanup = () => db.delete(newsItems).where(like(newsItems.url, `${URL_PREFIX}%`));
beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$client.end();
});

describe("news.upsertBatch", () => {
  it("de-duplicates by URL, tags prefiltered items, indexes only those and sets indexed_at", async () => {
    const pc = fakePinecone();
    const service = new NewsService(db, () => pc.client, () => new Date("2022-02-25T02:00:00.400Z"));
    const batch = [
      item("a", "Russia launches invasion of Ukraine; Exxon and Shell weigh exits", "2022-02-24T04:00:00.000Z"),
      item("a", "duplicate in the same batch", "2022-02-24T04:00:00.000Z"),
      item("b", "Local team wins the weekend football derby", "2022-02-24T05:00:00.000Z"),
    ];
    const first = await service.upsertBatch(batch);
    expect(first.inserted).toHaveLength(2);
    expect(first.prefiltered).toHaveLength(1);
    expect(first.indexed).toEqual(first.prefiltered);
    expect(first.latencyMs).toBe(400);
    expect(first.indexError).toBeNull();
    expect([...pc.store.keys()]).toEqual([newsRecordId(`${URL_PREFIX}a`)]);
    expect(pc.store.get(newsRecordId(`${URL_PREFIX}a`))).toMatchObject({
      text: "Russia launches invasion of Ukraine; Exxon and Shell weigh exits",
      tickers: ["XOM"],
      peerTickers: ["CVX"],
      publishedAt: Date.parse("2022-02-24T04:00:00Z") / 1000,
    });

    const rows = await db.select().from(newsItems).where(inArray(newsItems.id, first.inserted));
    const a = rows.find((r) => r.url.endsWith("/a"))!;
    const b = rows.find((r) => r.url.endsWith("/b"))!;
    expect(a).toMatchObject({ prefilterMatch: true, tickers: ["XOM"], peerTickers: ["CVX"] });
    expect(a.indexedAt?.toISOString()).toBe("2022-02-25T02:00:00.400Z");
    expect(b).toMatchObject({ prefilterMatch: false, indexedAt: null });

    const again = await service.upsertBatch(batch);
    expect(again.inserted).toEqual([]);
    expect(again.duplicates).toBe(3);
  });

  it("keeps the rows and leaves indexed_at null when Pinecone fails", async () => {
    const service = new NewsService(db, () => fakePinecone(true).client);
    const r = await service.upsertBatch([item("c", "OPEC announces production cut", "2022-02-24T06:00:00.000Z")]);
    expect(r.inserted).toHaveLength(1);
    expect(r.indexed).toEqual([]);
    expect(r.indexError).toBe("pinecone down");
  });

  it("caps the embedded text at 1,500 characters", () => {
    expect(newsText("t", "x".repeat(2000))).toHaveLength(1500);
  });
});

describe("news.search and news.list (GATE A2)", () => {
  it("returns only items inside the 72-hour window before the Ukraine as-of", async () => {
    const pc = fakePinecone();
    const service = new NewsService(db, () => pc.client);
    await service.upsertBatch([
      item("old", "Russia Ukraine tensions: troops at the border", "2022-02-21T00:00:00.000Z"),
      item("in1", "Russia invasion of Ukraine begins with missile strikes", "2022-02-24T03:10:00.000Z"),
      item("in2", "Sanctions on Russia expected after invasion", "2022-02-22T12:00:00.000Z"),
      item("future", "Russia Ukraine war: ceasefire talks", "2022-02-26T10:00:00.000Z"),
    ]);
    const hits = await service.search("Russia Ukraine invasion", { asOf: UKRAINE_AS_OF });
    const start = UKRAINE_AS_OF.getTime() - 72 * 3_600_000;
    expect(hits.map((h) => h.item.url.replace(URL_PREFIX, "")).sort()).toEqual(["in1", "in2"]);
    expect(hits.every((h) => Date.parse(h.item.publishedAt) >= start && Date.parse(h.item.publishedAt) <= UKRAINE_AS_OF.getTime())).toBe(true);

    const listed = await service.list({ asOf: UKRAINE_AS_OF, limit: 50, ticker: undefined });
    const ours = listed.filter((n) => n.url.startsWith(URL_PREFIX)).map((n) => n.url.replace(URL_PREFIX, ""));
    expect(ours).toEqual(["in1", "in2", "old"]);
  });
});

describe("news.typeCounts", () => {
  it("counts relevant scored news per type and UTC day", async () => {
    const service = new NewsService(db, () => fakePinecone().client);
    const r = await service.upsertBatch([
      item("t1", "Missile strike near Kyiv", "2022-02-24T03:00:00.000Z"),
      item("t2", "Airstrike reported in Kharkiv", "2022-02-24T09:00:00.000Z"),
      item("t3", "Blockade of ports", "2022-02-23T09:00:00.000Z"),
    ]);
    await db.update(newsItems).set({ eventType: "geopolitical", relevance: 0.9 }).where(inArray(newsItems.id, r.inserted));
    const counts = (await service.typeCounts(UKRAINE_AS_OF, 7)).filter((c) => c.eventType === "geopolitical");
    expect(counts).toEqual(
      expect.arrayContaining([
        { eventType: "geopolitical", date: "2022-02-23", count: expect.any(Number) },
        { eventType: "geopolitical", date: "2022-02-24", count: expect.any(Number) },
      ]),
    );
    expect(counts.find((c) => c.date === "2022-02-24")!.count).toBeGreaterThanOrEqual(2);
  });
});
