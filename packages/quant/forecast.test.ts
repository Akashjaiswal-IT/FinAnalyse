import type { EventFeatures, EventType, Reaction } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import {
  buildForecast,
  eligibleAnalogs,
  fitScaler,
  kernelWeights,
  standardize,
  targetForecast,
  variantGroups,
  withSimilarity,
  type PoolEvent,
  type QueryEvent,
} from "./forecast";

// Reference values come from an independent Python implementation of SPEC 5.9 (statistics.stdev, math.exp).

const NONE: EventFeatures = { volZ: null, toneZ: null, vixZ: null, windKt: null, capAtRisk: null, offshoreExposure: null };
const feat = (f: Partial<EventFeatures>): EventFeatures => ({ ...NONE, ...f });
const react = (d5: number | null): Reaction => ({ d1: null, d5, d20: null });

function event(
  id: string,
  type: EventType,
  features: Partial<EventFeatures>,
  d5: Record<string, number | null>,
  subtype: string | null = null,
): PoolEvent {
  return {
    id,
    name: id.toUpperCase(),
    type,
    subtype,
    features: feat(features),
    reactions: Object.fromEntries(Object.entries(d5).map(([s, v]) => [s, react(v)])),
  };
}

const pool: PoolEvent[] = [
  event("e1", "geopolitical", { volZ: 0, toneZ: 0, vixZ: 0 }, { SPY: 0.02, WTI: 0.05, XOM: 0.04 }),
  event("e2", "geopolitical", { volZ: 2, toneZ: -1, vixZ: 1 }, { SPY: -0.03, WTI: 0.08, XOM: 0.06 }),
  event("e3", "policy", { volZ: 4, toneZ: -2, vixZ: 2 }, { SPY: -0.05, WTI: -0.02, XOM: 0.01 }),
  event("e4", "macro", { volZ: 1, toneZ: 1, vixZ: -1 }, { SPY: 0.01, WTI: 0.0, XOM: 0.02 }),
];
const query: QueryEvent = { type: "geopolitical", features: feat({ volZ: 3, toneZ: -1.5, vixZ: 1.5 }) };

describe("variantGroups", () => {
  it("lists the groups each variant may use", () => {
    expect(variantGroups("combined")).toEqual(["type", "news", "regime", "weather"]);
    expect(variantGroups("news")).toEqual(["news"]);
    expect(variantGroups("regime")).toEqual(["regime"]);
    expect(variantGroups("weather")).toEqual(["weather"]);
    expect(variantGroups("type")).toEqual([]);
    expect(variantGroups("unconditional")).toEqual([]);
  });
});

describe("fitScaler and standardize", () => {
  it("uses the sample std over the non-null values", () => {
    const sc = fitScaler(pool);
    expect(sc.mean.volZ).toBeCloseTo(1.75, 12);
    expect(sc.std.volZ).toBeCloseTo(1.70782513, 8); // python statistics.stdev([0, 2, 4, 1])
    expect(sc.mean.toneZ).toBeCloseTo(-0.5, 12);
    expect(sc.std.vixZ).toBeCloseTo(1.29099445, 8);
    expect(sc.mean.windKt).toBeUndefined(); // no pool event has weather features
  });
  it("sets a zero or undefined spread to 1", () => {
    const sc = fitScaler([{ features: feat({ volZ: 2 }) }, { features: feat({ volZ: 2 }) }]);
    expect(sc.std.volZ).toBe(1);
    expect(fitScaler([{ features: feat({ volZ: 5 }) }]).std.volZ).toBe(1);
  });
  it("standardises, keeps nulls and drops features the scaler never saw", () => {
    const sc = fitScaler(pool);
    const z = standardize(feat({ volZ: 1.75 + 1.70782513, toneZ: null, windKt: 100 }), sc);
    expect(z.volZ).toBeCloseTo(1, 7);
    expect(z.toneZ).toBeNull();
    expect(z.windKt).toBeNull();
  });
});

describe("kernelWeights", () => {
  const sc = fitScaler(pool);
  it("combined: d² is the mean over type, news and regime distances", () => {
    const w = kernelWeights(query, pool, "combined", sc);
    expect(w.map((x) => x.id)).toEqual(["e1", "e2", "e3", "e4"]);
    expect(w[0]?.d2).toBeCloseTo(1.92857143, 8);
    expect(w[0]?.weight).toBeCloseTo(0.38125543, 8);
    expect(w[1]?.d2).toBeCloseTo(0.21428571, 8);
    expect(w[1]?.weight).toBeCloseTo(0.89839732, 8);
    expect(w[2]?.weight).toBeCloseTo(0.61745885, 8); // e3 is another type: includes the 2.25 type penalty
    expect(w[3]?.d2).toBeCloseTo(3.70714286, 8);
    expect(w.every((x) => x.groups.join() === "type,news,regime")).toBe(true);
  });
  it("a type mismatch adds exactly TYPE_WEIGHT² to the type group's squared distance", () => {
    const same = { id: "same", name: "S", type: "policy" as const, subtype: null, features: feat({ volZ: 1, toneZ: 1, vixZ: 1 }), reactions: {} };
    const other = { ...same, id: "other", type: "macro" as const };
    const q: QueryEvent = { type: "policy", features: same.features };
    const w = kernelWeights(q, [same, other], "combined", fitScaler([same, other]));
    expect(w[0]?.d2).toBe(0);
    expect(w[0]?.weight).toBe(1);
    expect(w[1]?.d2).toBeCloseTo(2.25 / 3, 12); // all other groups identical, three groups used
    expect(w[1]?.weight).toBeCloseTo(0.68728928, 8); // exp(-0.375)
  });
  it("honours another type weight and bandwidth", () => {
    const a = event("a", "policy", { volZ: 1, toneZ: 1, vixZ: 1 }, {});
    const b = { ...a, id: "b", type: "macro" as const };
    const q: QueryEvent = { type: "policy", features: a.features };
    const sc2 = fitScaler([a, b]);
    expect(kernelWeights(q, [a, b], "combined", sc2, { typeWeight: 3 })[1]?.d2).toBeCloseTo(9 / 3, 12);
    expect(kernelWeights(q, [a, b], "combined", sc2, { bandwidth: 0.5 })[1]?.weight).toBeCloseTo(Math.exp(-0.75 / (2 * 0.25)), 12);
    expect(() => kernelWeights(q, [a, b], "combined", sc2, { bandwidth: 0 })).toThrow(RangeError);
  });
  it("news-only and regime-only use one group each", () => {
    const news = kernelWeights(query, pool, "news", sc);
    expect(news.map((x) => x.groups.join())).toEqual(["news", "news", "news", "news"]);
    expect(news[0]?.weight).toBeCloseTo(0.10884209, 8);
    expect(news[1]?.weight).toBeCloseTo(0.78158719, 8);
    const regime = kernelWeights(query, pool, "regime", sc);
    expect(regime[0]?.weight).toBeCloseTo(0.50915642, 8);
    expect(regime[3]?.d2).toBeCloseTo(3.75, 8);
  });
  it("type-only and unconditional give weight 1 (type-only: same type)", () => {
    expect(kernelWeights(query, pool, "type", sc).map((x) => [x.id, x.weight])).toEqual([["e1", 1], ["e2", 1]]);
    expect(kernelWeights(query, pool, "unconditional", sc).map((x) => x.weight)).toEqual([1, 1, 1, 1]);
  });
  it("skips a group the query lacks (news unavailable) and an event the variant cannot compare", () => {
    const noNews: QueryEvent = { type: "geopolitical", features: feat({ vixZ: 1.5 }) };
    const w = kernelWeights(noNews, pool, "combined", fitScaler(pool));
    expect(w[0]?.groups).toEqual(["type", "regime"]);
    expect(kernelWeights(noNews, pool, "news", fitScaler(pool))).toEqual([]);
  });
});

describe("weather group", () => {
  const hurricanes: PoolEvent[] = [
    event("h1", "disaster", { volZ: 1, toneZ: 0, vixZ: 0, windKt: 100, capAtRisk: 0.2, offshoreExposure: 0.5 }, { SPY: -0.01, WTI: 0.04 }, "hurricane"),
    event("h2", "disaster", { volZ: 2, toneZ: -1, vixZ: 1, windKt: 130, capAtRisk: 0.5, offshoreExposure: 0.2 }, { SPY: -0.03, WTI: 0.09 }, "hurricane"),
    event("c1", "geopolitical", { volZ: 0, toneZ: 0, vixZ: 0 }, { SPY: 0.02, WTI: 0.01 }),
  ];
  const storm: QueryEvent = {
    type: "disaster",
    features: feat({ volZ: 1.5, toneZ: -0.5, vixZ: 0.5, windKt: 110, capAtRisk: 0.3, offshoreExposure: 0.4 }),
  };
  const sc = fitScaler(hurricanes);
  it("is used only between two events that both have weather features", () => {
    const w = kernelWeights(storm, hurricanes, "combined", sc);
    expect(w.map((x) => x.groups.length)).toEqual([4, 4, 3]);
    expect(w[0]?.groups).toEqual(["type", "news", "regime", "weather"]);
    expect(w[2]?.groups).toEqual(["type", "news", "regime"]);
    expect(w[0]?.weight).toBeCloseTo(0.73927646, 8);
    expect(w[1]?.weight).toBeCloseTo(0.57574908, 8);
    expect(w[2]?.d2).toBeCloseTo(2.0, 8);
    expect(w[2]?.weight).toBeCloseTo(0.36787944, 8);
  });
  it("a curated query never uses the weather group", () => {
    const curated: QueryEvent = { type: "geopolitical", features: feat({ volZ: 1, toneZ: 0, vixZ: 0 }) };
    const w = kernelWeights(curated, hurricanes, "combined", sc);
    expect(w.every((x) => !x.groups.includes("weather"))).toBe(true);
  });
  it("weather-only drops events without weather features", () => {
    const w = kernelWeights(storm, hurricanes, "weather", sc);
    expect(w.map((x) => x.id)).toEqual(["h1", "h2"]);
    expect(w[0]?.weight).toBeCloseTo(0.71653131, 8);
    expect(w[1]?.weight).toBeCloseTo(0.26359714, 8);
  });
  it("buildForecast matches the python reference for combined and weather-only", () => {
    const c = buildForecast(storm, hurricanes, { targets: ["SPY", "WTI"] });
    expect(c.groupsUsed).toEqual(["type", "news", "regime", "weather"]);
    expect(c.targets.SPY?.mean).toBeCloseTo(-0.01028439, 8);
    expect(c.targets.SPY?.spread).toBeCloseTo(0.01826208, 8);
    expect(c.targets.WTI?.mean).toBeCloseTo(0.05054787, 8);
    const w = buildForecast(storm, hurricanes, { variant: "weather", targets: ["SPY", "WTI"] });
    expect(w.groupsUsed).toEqual(["weather"]);
    expect(w.targets.SPY?.mean).toBeCloseTo(-0.01537883, 8);
    expect(w.targets.WTI?.n).toBe(2);
  });
});

describe("targetForecast", () => {
  const weights = [
    { id: "a", d2: 0, weight: 1, groups: [] },
    { id: "b", d2: 0, weight: 2, groups: [] },
    { id: "c", d2: 0, weight: 1, groups: [] },
  ];
  const p = [
    event("a", "policy", {}, { X: 1 }),
    event("b", "policy", {}, { X: 2 }),
    event("c", "policy", {}, { X: 3 }),
  ];
  it("is the weighted mean, population spread and count", () => {
    const f = targetForecast(weights, p, "X");
    expect(f?.mean).toBe(2);
    expect(f?.spread).toBeCloseTo(0.70710678, 8);
    expect(f?.n).toBe(3);
  });
  it("skips analogs with no return for the symbol or no weight, and is null when none has data", () => {
    const partial = [event("a", "policy", {}, { X: 1 }), event("b", "policy", {}, { X: null }), event("c", "policy", {}, {})];
    expect(targetForecast(weights, partial, "X")).toEqual({ mean: 1, spread: 0, n: 1 });
    expect(targetForecast(weights, partial, "Y")).toBeNull();
    expect(targetForecast([{ id: "a", d2: 0, weight: 0, groups: [] }], p, "X")).toBeNull();
  });
});

describe("buildForecast", () => {
  it("combined: weighted mean, spread, effective n and groups match the python reference", () => {
    const f = buildForecast(query, pool, { targets: ["SPY", "WTI"], holdings: ["XOM"] });
    expect(f.variant).toBe("combined");
    expect(f.groupsUsed).toEqual(["type", "news", "regime"]);
    expect(f.bandwidth).toBe(1);
    expect(f.typeWeight).toBe(1.5);
    expect(f.effectiveN).toBeCloseTo(3.10544001, 7);
    expect(f.targets.SPY?.mean).toBeCloseTo(-0.02367965, 8);
    expect(f.targets.SPY?.spread).toBeCloseTo(0.02581584, 8);
    expect(f.targets.WTI?.mean).toBeCloseTo(0.03826362, 8);
    expect(f.targets.WTI?.spread).toBeCloseTo(0.04381575, 8);
    expect(f.holdings.XOM).toMatchObject({ n: 4, fallback: false });
    expect(f.holdings.XOM?.mean).toBeCloseTo(0.03820364, 8);
    expect(f.holdings.XOM?.spread).toBeCloseTo(0.02174491, 8);
  });
  it("news-only, regime-only, type-only and unconditional match the python reference", () => {
    const run = (variant: "news" | "regime" | "type" | "unconditional") =>
      buildForecast(query, pool, { variant, targets: ["SPY"] });
    expect(run("news").targets.SPY?.mean).toBeCloseTo(-0.03405865, 8);
    expect(run("news").effectiveN).toBeCloseTo(2.46854048, 7);
    expect(run("regime").targets.SPY?.mean).toBeCloseTo(-0.02482242, 8);
    expect(run("type").targets.SPY?.mean).toBeCloseTo(-0.005, 12); // mean of e1 and e2
    expect(run("type").targets.SPY?.n).toBe(2);
    expect(run("type").effectiveN).toBe(2);
    expect(run("unconditional").targets.SPY?.mean).toBeCloseTo(-0.0125, 12);
    expect(run("unconditional").targets.SPY?.spread).toBeCloseTo(0.02861381, 8);
    expect(run("type").groupsUsed).toEqual([]);
  });
  it("lists the top analogs by weight with their realized returns for the requested symbols only", () => {
    const f = buildForecast(query, pool, { targets: ["SPY"], holdings: ["XOM"], topAnalogs: 2 });
    expect(f.analogs.map((a) => a.eventId)).toEqual(["e2", "e3"]); // weights 0.898 and 0.617
    expect(f.analogs[0]).toMatchObject({ name: "E2", type: "geopolitical" });
    expect(f.analogs[0]?.weight).toBeCloseTo(0.89839732, 8);
    expect(Object.keys(f.analogs[0]?.realized ?? {}).sort()).toEqual(["SPY", "XOM"]);
    expect(f.analogs[0]?.realized.SPY?.d5).toBe(-0.03);
  });
  it("a holding with fewer than 3 analogs uses beta to SPY times the SPY forecast and says so", () => {
    const sparse = pool.map((e, i) => (i < 2 ? { ...e, reactions: { ...e.reactions, NEWCO: react(0.5) } } : e));
    const f = buildForecast(query, sparse, { targets: ["SPY"], holdings: ["NEWCO", "XOM"], betaToSpy: { NEWCO: 1.5 } });
    expect(f.holdings.NEWCO?.fallback).toBe(true);
    expect(f.holdings.NEWCO?.mean).toBeCloseTo(1.5 * -0.02367965075680785, 12);
    expect(f.holdings.NEWCO?.spread).toBeCloseTo(1.5 * 0.02581583657053801, 12);
    expect(f.holdings.NEWCO?.n).toBe(4); // the SPY forecast's n
    expect(f.holdings.XOM?.fallback).toBe(false);
  });
  it("uses a negative beta with an absolute spread", () => {
    const sparse = pool.map((e, i) => (i < 2 ? { ...e, reactions: { ...e.reactions, NEWCO: react(0.5) } } : e));
    const f = buildForecast(query, sparse, { holdings: ["NEWCO"], betaToSpy: { NEWCO: -2 } });
    expect(f.holdings.NEWCO?.mean).toBeCloseTo(-2 * -0.02367965075680785, 12);
    expect(f.holdings.NEWCO?.spread).toBeCloseTo(2 * 0.02581583657053801, 12);
  });
  it("omits a holding it cannot forecast (too few analogs and no beta) instead of inventing one", () => {
    const sparse = pool.map((e, i) => (i < 2 ? { ...e, reactions: { ...e.reactions, NEWCO: react(0.5) } } : e));
    expect(buildForecast(query, sparse, { holdings: ["NEWCO"] }).holdings).toEqual({});
    expect(buildForecast(query, sparse, { holdings: ["GHOST"], betaToSpy: { GHOST: 1 } }).holdings.GHOST?.fallback).toBe(true);
  });
  it("defaults to the forecast targets and omits targets without data", () => {
    const f = buildForecast(query, pool);
    expect(Object.keys(f.targets).sort()).toEqual(["SPY", "WTI"]); // the pool has no GLD, TLT, ...
  });
  it("is deterministic and does not change its inputs", () => {
    const before = JSON.stringify(pool);
    expect(buildForecast(query, pool, { holdings: ["XOM"] })).toEqual(buildForecast(query, pool, { holdings: ["XOM"] }));
    expect(JSON.stringify(pool)).toBe(before);
  });
  it("is empty for an empty pool", () => {
    const f = buildForecast(query, [], { holdings: ["XOM"] });
    expect(f.targets).toEqual({});
    expect(f.analogs).toEqual([]);
    expect(f.effectiveN).toBe(0);
  });
});

describe("withSimilarity", () => {
  it("adds the Pinecone score, 0 when Pinecone did not return the analog, and the news basis", () => {
    const f = withSimilarity(buildForecast(query, pool, { targets: ["SPY"], topAnalogs: 2 }), { e2: 0.91 }, "observed");
    expect(f.newsBasis).toBe("observed");
    expect(f.analogs.map((a) => [a.eventId, a.similarity])).toEqual([["e2", 0.91], ["e3", 0]]);
  });
});

describe("eligibleAnalogs", () => {
  const rows = [
    { id: "a", realizedUntil: "2021-08-26" },
    { id: "b", realizedUntil: "2021-08-27" },
    { id: "c", realizedUntil: "2021-08-30" },
  ];
  it("needs the last close of the window to be readable at asOf (21:00 UTC)", () => {
    expect(eligibleAnalogs(rows, "2021-08-27T21:00:00.000Z").map((r) => r.id)).toEqual(["a", "b"]);
    expect(eligibleAnalogs(rows, "2021-08-27T20:59:59.000Z").map((r) => r.id)).toEqual(["a"]);
    expect(eligibleAnalogs(rows, "2025-01-01T00:00:00.000Z")).toHaveLength(3);
    expect(eligibleAnalogs(rows, "2020-01-01T00:00:00.000Z")).toEqual([]);
  });
  it("drops the excluded event", () => {
    expect(eligibleAnalogs(rows, "2025-01-01T00:00:00.000Z", "b").map((r) => r.id)).toEqual(["a", "c"]);
  });
});
