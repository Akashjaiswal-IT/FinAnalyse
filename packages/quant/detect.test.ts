import type { FactorDirectionEntry } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import {
  clusterNews,
  clusterZ,
  eventStatus,
  isEvent,
  jaccard,
  matchActiveEvent,
  sameStory,
  severityFromVolZ,
  titleTokens,
  type DetectItem,
  type DetectedCluster,
} from "./detect";

const NOW = "2022-02-24T12:00:00.000Z";

let seq = 0;
function item(p: Partial<DetectItem> & { title: string }): DetectItem {
  seq++;
  return {
    id: p.id ?? `n${seq}`,
    title: p.title,
    domain: p.domain === undefined ? `site${seq}.com` : p.domain,
    eventType: p.eventType ?? "geopolitical",
    tickers: p.tickers ?? [],
    peerTickers: p.peerTickers ?? [],
    relevance: p.relevance ?? 0.8,
    publishedAt: p.publishedAt ?? "2022-02-24T06:00:00.000Z",
    factorDirections: p.factorDirections ?? [],
  };
}
const dir = (factor: FactorDirectionEntry["factor"], direction: FactorDirectionEntry["direction"]): FactorDirectionEntry => ({
  factor,
  direction,
});

describe("titleTokens and jaccard", () => {
  it("lower-cases, drops stopwords and one-letter tokens, and keeps numbers", () => {
    expect([...titleTokens("Russia Invades Ukraine: Oil Surges as Markets Tumble in 2022")].sort()).toEqual([
      "2022",
      "invades",
      "markets",
      "oil",
      "russia",
      "surges",
      "tumble",
      "ukraine",
    ]);
    expect(titleTokens("A of the")).toEqual(new Set());
  });
  it("is |A ∩ B| / |A ∪ B|", () => {
    expect(jaccard(new Set(["a", "b", "c"]), new Set(["b", "c", "d"]))).toBe(0.5);
    expect(jaccard(new Set(["a"]), new Set(["a"]))).toBe(1);
    expect(jaccard(new Set(["a"]), new Set(["b"]))).toBe(0);
    expect(jaccard(new Set(), new Set())).toBe(0);
  });
});

describe("sameStory", () => {
  it("needs the same event type", () => {
    const a = item({ title: "Russia attacks Ukraine", tickers: ["XOM"] });
    const b = item({ title: "Russia attacks Ukraine", tickers: ["XOM"], eventType: "policy" });
    expect(sameStory(a, b)).toBe(false);
  });
  it("links items that share a ticker, counting peer tickers", () => {
    expect(sameStory(item({ title: "alpha", tickers: ["XOM"] }), item({ title: "beta", tickers: ["XOM"] }))).toBe(true);
    expect(sameStory(item({ title: "alpha", tickers: ["XOM"] }), item({ title: "beta", peerTickers: ["XOM"] }))).toBe(true);
    expect(sameStory(item({ title: "alpha", peerTickers: ["XOM"] }), item({ title: "beta", peerTickers: ["XOM"] }))).toBe(true);
    expect(sameStory(item({ title: "alpha", tickers: ["XOM"] }), item({ title: "beta", tickers: ["CVX"] }))).toBe(false);
  });
  it("links titles whose word overlap is at least 0.3 (Jaccard), exactly 0.3 included", () => {
    const a = item({ title: "alpha bravo charlie delta echo foxtrot golf" }); // 7 words
    const b = item({ title: "alpha bravo charlie hotel india juliet" }); // 6 words, 3 shared, union 10
    expect(jaccard(titleTokens(a.title), titleTokens(b.title))).toBe(0.3);
    expect(sameStory(a, b)).toBe(true);
    const c = item({ title: "alpha bravo hotel india juliet kilo" }); // shares 2 of 11 with a
    expect(sameStory(a, c)).toBe(false);
  });
});

describe("clusterNews", () => {
  const items = [
    item({ id: "a1", title: "Russia launches missile strikes on Kyiv", domain: "reuters.com", tickers: ["LMT"], publishedAt: "2022-02-24T03:10:00.000Z", relevance: 0.9, factorDirections: [dir("WTI", "up"), dir("MARKET", "down")] }),
    item({ id: "a2", title: "Defence stocks jump as war begins", domain: "bloomberg.com", tickers: ["LMT", "RTX"], publishedAt: "2022-02-24T04:00:00.000Z", relevance: 0.7, factorDirections: [dir("WTI", "up"), dir("MARKET", "down")] }),
    item({ id: "a3", title: "Russia launches missile strikes across Ukraine", domain: "ap.org", publishedAt: "2022-02-24T05:00:00.000Z", relevance: 0.95, factorDirections: [dir("WTI", "up"), dir("MARKET", "unclear")] }),
    item({ id: "a4", title: "Oil spikes on Russian invasion fears", domain: "reuters.com", tickers: ["RTX"], publishedAt: "2022-02-24T07:00:00.000Z", relevance: 0.6, factorDirections: [dir("WTI", "down"), dir("MARKET", "down")] }),
    item({ id: "a5", title: "Russia launches missile strikes on Kyiv overnight", domain: "cnn.com", publishedAt: "2022-02-24T10:00:00.000Z", relevance: 0.5 }),
    // a different story of the same type
    item({ id: "b1", title: "Sanctions announced on Iranian shipping", domain: "ft.com", publishedAt: "2022-02-24T08:00:00.000Z" }),
    item({ id: "b2", title: "Iranian shipping sanctions widen", domain: "wsj.com", publishedAt: "2022-02-24T09:00:00.000Z" }),
    // another type: stays on its own even though it shares a ticker with the Russia story
    item({ id: "p1", title: "Tariff talks resume", tickers: ["LMT"], eventType: "policy" }),
    // dropped: low relevance, older than 24 h, published after now
    item({ id: "x1", title: "Russia launches missile strikes", tickers: ["LMT"], relevance: 0.49 }),
    item({ id: "x2", title: "Russia launches missile strikes", tickers: ["LMT"], publishedAt: "2022-02-23T11:59:59.000Z" }),
    item({ id: "x3", title: "Russia launches missile strikes", tickers: ["LMT"], publishedAt: "2022-02-24T12:00:01.000Z" }),
  ];
  const clusters = clusterNews(items, NOW);

  it("groups connected items by shared tickers and title words, largest first", () => {
    // a1-a2 share LMT, a1-a3 and a1-a5 share title words, a2-a4 share RTX: one cluster of five.
    expect(clusters.map((c) => c.itemIds)).toEqual([["a1", "a2", "a3", "a4", "a5"], ["b1", "b2"], ["p1"]]);
  });
  it("drops low-relevance, stale and future items but keeps relevance exactly 0.5", () => {
    const ids = clusters.flatMap((c) => c.itemIds);
    expect(ids).not.toContain("x1");
    expect(ids).not.toContain("x2");
    expect(ids).not.toContain("x3");
    expect(ids).toContain("a5");
  });
  it("summarises a cluster", () => {
    const c = clusters[0] as DetectedCluster;
    expect(c.type).toBe("geopolitical");
    expect(c.title).toBe("Russia launches missile strikes on Kyiv"); // the earliest item
    expect(c.articleCount).toBe(5);
    expect(c.domainCount).toBe(4); // reuters.com twice
    expect(c.entities).toEqual(["LMT", "RTX"]);
    expect(c.firstSeenAt).toBe("2022-02-24T03:10:00.000Z");
    expect(c.lastSeenAt).toBe("2022-02-24T10:00:00.000Z");
    expect(c.topNewsIds).toEqual(["a3", "a1", "a2", "a4", "a5"]); // by relevance
  });
  it("takes the majority direction per factor, and a tie or an unclear majority is unclear", () => {
    const c = clusters[0] as DetectedCluster;
    // WTI: up, up, up, down -> up. MARKET: down, down, unclear, down -> down.
    expect(c.factorDirections).toEqual([
      { factor: "MARKET", direction: "down" },
      { factor: "WTI", direction: "up" },
    ]);
    const tie = clusterNews(
      [
        item({ id: "t1", title: "zeta eta", tickers: ["XOM"], factorDirections: [dir("GOLD", "up"), dir("RATES", "unclear")] }),
        item({ id: "t2", title: "theta iota", tickers: ["XOM"], factorDirections: [dir("GOLD", "down"), dir("RATES", "unclear")] }),
      ],
      NOW,
    );
    expect(tie[0]?.factorDirections).toEqual([
      { factor: "GOLD", direction: "unclear" },
      { factor: "RATES", direction: "unclear" },
    ]);
  });
  it("lists at most five top news ids and counts only known domains", () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      item({ id: `m${i}`, title: "zeta eta", tickers: ["XOM"], domain: i % 2 === 0 ? null : "same.com", relevance: 0.5 + i / 20 }),
    );
    const [c] = clusterNews(many, NOW);
    expect(c?.topNewsIds).toEqual(["m6", "m5", "m4", "m3", "m2"]);
    expect(c?.domainCount).toBe(1);
  });
  it("is deterministic and independent of input order", () => {
    expect(clusterNews([...items].reverse(), NOW)).toEqual(clusters);
    expect(clusterNews([], NOW)).toEqual([]);
  });
});

describe("isEvent", () => {
  it("needs at least 5 articles from at least 3 domains", () => {
    expect(isEvent({ articleCount: 5, domainCount: 3 })).toBe(true);
    expect(isEvent({ articleCount: 4, domainCount: 3 })).toBe(false);
    expect(isEvent({ articleCount: 9, domainCount: 2 })).toBe(false);
  });
  it("decides which clusters count", () => {
    const c = clusterNews(
      Array.from({ length: 5 }, (_, i) => item({ title: "zeta eta", tickers: ["XOM"], domain: `d${i % 3}.com` })),
      NOW,
    );
    expect(c.map(isEvent)).toEqual([true]);
  });
});

describe("severityFromVolZ", () => {
  it.each([
    [null, "low"],
    [-2, "low"],
    [0.99, "low"],
    [1, "medium"],
    [2.99, "medium"],
    [3, "high"],
    [8, "high"],
  ] as const)("volZ %s is %s", (z, severity) => {
    expect(severityFromVolZ(z)).toBe(severity);
  });
});

describe("clusterZ", () => {
  it("is the z-score of today's count against the previous daily counts", () => {
    expect(clusterZ(10, [2, 3, 2, 4, 3, 2, 3])).toBeCloseTo(9.63809406, 8); // python statistics
  });
  it("is null without a usable baseline", () => {
    expect(clusterZ(10, [3])).toBeNull();
    expect(clusterZ(10, [3, 3, 3])).toBeNull();
  });
});

describe("matchActiveEvent", () => {
  const cluster: DetectedCluster = {
    itemIds: ["a1"],
    type: "geopolitical",
    title: "Russia launches missile strikes on Kyiv",
    articleCount: 5,
    domainCount: 3,
    entities: ["LMT"],
    factorDirections: [],
    firstSeenAt: NOW,
    lastSeenAt: NOW,
    topNewsIds: [],
  };
  it("matches the active event of the same type that shares an entity", () => {
    expect(matchActiveEvent(cluster, [{ id: "e1", type: "geopolitical", title: "Something else", entities: ["LMT"] }])).toBe("e1");
  });
  it("matches by title overlap when no entity is shared", () => {
    expect(
      matchActiveEvent(cluster, [{ id: "e2", type: "geopolitical", title: "Russia launches missile strikes across Ukraine", entities: [] }]),
    ).toBe("e2");
  });
  it("ignores other types and unrelated events", () => {
    expect(matchActiveEvent(cluster, [{ id: "e3", type: "policy", title: cluster.title, entities: ["LMT"] }])).toBeNull();
    expect(matchActiveEvent(cluster, [{ id: "e4", type: "geopolitical", title: "Iranian shipping sanctions", entities: ["XOM"] }])).toBeNull();
    expect(matchActiveEvent(cluster, [])).toBeNull();
  });
  it("prefers the better title overlap, then more shared entities, then the smaller id", () => {
    const two = { ...cluster, entities: ["LMT", "RTX"] };
    expect(
      matchActiveEvent(two, [
        { id: "weak", type: "geopolitical", title: "Missile attack", entities: ["LMT", "RTX"] },
        { id: "strong", type: "geopolitical", title: "Russia launches missile strikes on Kyiv", entities: [] },
      ]),
    ).toBe("strong");
    expect(
      matchActiveEvent(two, [
        { id: "one", type: "geopolitical", title: "alpha", entities: ["LMT"] },
        { id: "both", type: "geopolitical", title: "beta", entities: ["LMT", "RTX"] },
      ]),
    ).toBe("both");
    expect(
      matchActiveEvent(two, [
        { id: "b", type: "geopolitical", title: "alpha", entities: ["LMT"] },
        { id: "a", type: "geopolitical", title: "beta", entities: ["LMT"] },
      ]),
    ).toBe("a");
  });
});

describe("eventStatus", () => {
  it("is active up to 6 hours after the last item, then faded", () => {
    expect(eventStatus("2022-02-24T06:00:00.000Z", NOW)).toBe("active");
    expect(eventStatus("2022-02-24T05:59:59.999Z", NOW)).toBe("faded");
    expect(eventStatus(NOW, NOW)).toBe("active");
  });
});
