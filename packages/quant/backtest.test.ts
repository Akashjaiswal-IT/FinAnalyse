import type { EventFeatures, EventType, Reaction } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { MODEL_KEYS, MODEL_VARIANT, computeMetrics, leaveOneOut, runBacktest, summarizePredictions } from "./backtest";
import type { PoolEvent } from "./forecast";

// Reference values come from an independent Python implementation of SPEC 5.9 and 9.1 (leave-one-out,
// scaler refit without the held-out event, statistics.correlation on average ranks).

const NONE: EventFeatures = { volZ: null, toneZ: null, vixZ: null, windKt: null, capAtRisk: null, offshoreExposure: null };
const react = (d5: number): Reaction => ({ d1: null, d5, d20: null });

function event(id: string, type: EventType, features: Partial<EventFeatures>, spy: number, wti: number): PoolEvent {
  return {
    id,
    name: id,
    type,
    subtype: type === "disaster" ? "hurricane" : null,
    features: { ...NONE, ...features },
    reactions: { SPY: react(spy), WTI: react(wti) },
  };
}

const pool: PoolEvent[] = [
  event("e1", "geopolitical", { volZ: 0, toneZ: 0, vixZ: 0 }, 0.02, 0.05),
  event("e2", "geopolitical", { volZ: 2, toneZ: -1, vixZ: 1 }, -0.03, 0.08),
  event("e3", "policy", { volZ: 4, toneZ: -2, vixZ: 2 }, -0.05, -0.02),
  event("e4", "macro", { volZ: 1, toneZ: 1, vixZ: -1 }, 0.01, 0.0),
  event("h1", "disaster", { volZ: 1, toneZ: 0, vixZ: 0, windKt: 100, capAtRisk: 0.2, offshoreExposure: 0.5 }, -0.01, 0.04),
  event("h2", "disaster", { volZ: 2, toneZ: -1, vixZ: 1, windKt: 130, capAtRisk: 0.5, offshoreExposure: 0.2 }, -0.03, 0.09),
];
const options = { targets: ["SPY", "WTI"] };

describe("computeMetrics", () => {
  it("computes directional accuracy, MAE and Spearman by hand", () => {
    const m = computeMetrics([
      { predicted: 0.01, realized: 0.02 }, // right direction
      { predicted: -0.02, realized: 0.03 }, // wrong
      { predicted: 0.03, realized: 0.001 }, // |realized| below 0.25%: excluded from direction
      { predicted: 0, realized: -0.05 }, // a zero prediction calls no direction: a miss
    ]);
    expect(m.n).toBe(4);
    expect(m.excludedSmallMoves).toBe(1);
    expect(m.directionalAccuracy).toBeCloseTo(1 / 3, 12);
    expect(m.mae).toBeCloseTo((0.01 + 0.05 + 0.029 + 0.05) / 4, 12);
    expect(m.spearman).toBeCloseTo(-0.4, 12); // ranks [3,1,4,2] and [3,4,2,1]
  });
  it("includes a realized move of exactly 0.25% and excludes just below it", () => {
    expect(computeMetrics([{ predicted: 0.01, realized: 0.0025 }]).excludedSmallMoves).toBe(0);
    expect(computeMetrics([{ predicted: 0.01, realized: 0.00249 }]).excludedSmallMoves).toBe(1);
    expect(computeMetrics([{ predicted: 0.01, realized: -0.0025 }]).directionalAccuracy).toBe(0);
  });
  it("has no directional accuracy when every move is small, and no Spearman under 3 pairs or for a constant series", () => {
    const small = computeMetrics([
      { predicted: 0.01, realized: 0.001 },
      { predicted: -0.01, realized: -0.001 },
    ]);
    expect(small.directionalAccuracy).toBeNull();
    expect(small.spearman).toBeNull();
    expect(small.mae).toBeCloseTo(0.009, 12); // |0.01 - 0.001| and |-0.01 + 0.001|
    expect(computeMetrics([1, 2, 3].map((r) => ({ predicted: 0.01, realized: r / 100 }))).spearman).toBeNull();
  });
  it("is all null for no pairs", () => {
    expect(computeMetrics([])).toEqual({ directionalAccuracy: null, mae: null, spearman: null, n: 0, excludedSmallMoves: 0 });
  });
});

describe("leaveOneOut", () => {
  const preds = leaveOneOut(pool, options);
  const get = (eventId: string, model: string, target: string) =>
    preds.find((p) => p.eventId === eventId && p.model === model && p.target === target);

  it("predicts every event with every model and target, in a stable order", () => {
    expect(preds).toHaveLength(6 * 6 * 2);
    expect(preds.slice(0, 3).map((p) => [p.eventId, p.model, p.target])).toEqual([
      ["e1", "N", "SPY"],
      ["e1", "N", "WTI"],
      ["e1", "T", "SPY"],
    ]);
    expect(preds.map((p) => p.eventId)).toEqual([...preds.map((p) => p.eventId)].sort());
  });
  it("matches the python reference for e1", () => {
    expect(get("e1", "N", "SPY")?.predicted).toBeCloseTo(-0.022, 12); // mean of the other five (-0.03, -0.05, 0.01, -0.01, -0.03)
    expect(get("e1", "T", "SPY")?.predicted).toBeCloseTo(-0.03, 12); // the only other geopolitical event is e2
    expect(get("e1", "S", "SPY")?.predicted).toBeCloseTo(-0.00837857, 8);
    expect(get("e1", "M", "SPY")?.predicted).toBeCloseTo(-0.01681723, 8);
    expect(get("e1", "C", "SPY")?.predicted).toBeCloseTo(-0.01451386, 8);
    expect(get("e1", "W", "SPY")?.predicted).toBeNull(); // e1 has no weather features
    expect(get("e1", "N", "SPY")?.realized).toBe(0.02);
  });
  it("matches the python reference for the hurricane h1, including the weather-only model", () => {
    expect(get("h1", "N", "SPY")?.predicted).toBeCloseTo(-0.016, 12);
    expect(get("h1", "T", "SPY")?.predicted).toBeCloseTo(-0.03, 12);
    expect(get("h1", "S", "SPY")?.predicted).toBeCloseTo(-0.00431947, 8);
    expect(get("h1", "M", "SPY")?.predicted).toBeCloseTo(-0.00760587, 8);
    expect(get("h1", "W", "SPY")?.predicted).toBeCloseTo(-0.03, 12); // h2 is the only other event with weather features
    expect(get("h1", "C", "SPY")?.predicted).toBeCloseTo(-0.0016573, 7);
  });
  it("never uses the held-out event: changing its own returns does not change its prediction", () => {
    const changed = pool.map((e) => (e.id === "e1" ? { ...e, reactions: { SPY: react(0.9), WTI: react(0.9) } } : e));
    const again = leaveOneOut(changed, options);
    for (const model of MODEL_KEYS) {
      for (const target of ["SPY", "WTI"]) {
        const a = preds.find((p) => p.eventId === "e1" && p.model === model && p.target === target);
        const b = again.find((p) => p.eventId === "e1" && p.model === model && p.target === target);
        expect(b?.predicted).toBe(a?.predicted);
      }
    }
    expect(again.find((p) => p.eventId === "e1" && p.model === "N")?.realized).toBe(0.9);
  });
  it("does not depend on the order of the input events", () => {
    expect(leaveOneOut([...pool].reverse(), options)).toEqual(preds);
  });
  it("honours the models and bandwidth options", () => {
    const only = leaveOneOut(pool, { ...options, models: ["N", "C"] });
    expect(new Set(only.map((p) => p.model))).toEqual(new Set(["N", "C"]));
    const wide = leaveOneOut(pool, { ...options, models: ["C"], bandwidth: 1.5 });
    const narrow = leaveOneOut(pool, { ...options, models: ["C"], bandwidth: 0.75 });
    expect(wide[0]?.predicted).not.toBe(narrow[0]?.predicted);
  });
  it("records a missing realized return as null", () => {
    const gap = pool.map((e) => (e.id === "e4" ? { ...e, reactions: { SPY: react(0.01) } } : e));
    expect(leaveOneOut(gap, options).find((p) => p.eventId === "e4" && p.target === "WTI")?.realized).toBeNull();
  });
  it("maps each model key to a variant", () => {
    expect(MODEL_VARIANT).toEqual({ N: "unconditional", T: "type", S: "news", M: "regime", W: "weather", C: "combined" });
  });
});

describe("summarizePredictions", () => {
  const preds = leaveOneOut(pool, options);

  it("pooled and per-target metrics match the python reference", () => {
    const m = summarizePredictions(preds, 1);
    expect(m.pooled?.N).toMatchObject({ n: 12, excludedSmallMoves: 1 });
    expect(m.pooled?.N?.mae).toBeCloseTo(0.033, 12);
    expect(m.pooled?.N?.directionalAccuracy).toBeCloseTo(8 / 11, 12);
    expect(m.pooled?.N?.spearman).toBeCloseTo(0.17192982, 8);
    expect(m.pooled?.T).toMatchObject({ n: 8, excludedSmallMoves: 0 });
    expect(m.pooled?.T?.mae).toBeCloseTo(0.0375, 12);
    expect(m.pooled?.S?.mae).toBeCloseTo(0.027694068, 8);
    expect(m.pooled?.S?.spearman).toBeCloseTo(0.59298246, 8);
    expect(m.pooled?.M?.mae).toBeCloseTo(0.029104663, 8);
    expect(m.pooled?.W).toMatchObject({ n: 4 });
    expect(m.pooled?.W?.directionalAccuracy).toBe(1);
    expect(m.pooled?.C?.mae).toBeCloseTo(0.029326634, 8);
    expect(m.pooled?.C?.directionalAccuracy).toBeCloseTo(8 / 11, 12);
    expect(m.pooled?.C?.spearman).toBeCloseTo(0.49036853, 8);
    expect(m.SPY?.C?.mae).toBeCloseTo(0.017558983, 8);
    expect(m.SPY?.C?.spearman).toBeCloseTo(0.55078248, 8);
    expect(m.WTI?.C?.mae).toBeCloseTo(0.041094285, 8);
    expect(m.WTI?.C?.directionalAccuracy).toBeCloseTo(0.8, 12);
    expect(m.WTI?.C?.excludedSmallMoves).toBe(1); // e4 realized WTI move is 0
  });
  it("per-type metrics match the python reference when a type has enough events", () => {
    const m = summarizePredictions(preds, 1);
    expect(m["type:geopolitical"]?.C).toMatchObject({ n: 4 });
    expect(m["type:geopolitical"]?.C?.mae).toBeCloseTo(0.022628030, 8);
    expect(m["type:geopolitical"]?.C?.directionalAccuracy).toBe(0.75);
    expect(m["type:geopolitical"]?.C?.spearman).toBeCloseTo(0.6, 12);
    expect(m["type:disaster"]?.C?.spearman).toBeCloseTo(1, 12);
    expect(m["type:macro"]?.C).toMatchObject({ n: 2, excludedSmallMoves: 1 });
    expect(m["type:macro"]?.C?.directionalAccuracy).toBe(0);
    expect(m["type:macro"]?.C?.spearman).toBeNull();
    expect(m["type:geopolitical"]?.T).toMatchObject({ n: 4 });
    expect(m["type:policy"]?.T).toMatchObject({ n: 0 }); // no other policy event to average
  });
  it("keeps n but makes no claim for a type with fewer than MIN_TYPE_EVENTS events", () => {
    const m = summarizePredictions(preds);
    expect(m["type:geopolitical"]?.C).toEqual({
      directionalAccuracy: null,
      mae: null,
      spearman: null,
      n: 4,
      excludedSmallMoves: 0,
    });
    expect(m.pooled?.C?.mae).not.toBeNull(); // pooled and per-target rows are always reported
    expect(m.SPY?.C?.mae).not.toBeNull();
  });
  it("lists every target, pooled, and a row per event type", () => {
    expect(Object.keys(summarizePredictions(preds)).sort()).toEqual(
      ["SPY", "WTI", "pooled", "type:disaster", "type:geopolitical", "type:macro", "type:policy"].sort(),
    );
  });
  it("ignores predictions that have no prediction or no realized return", () => {
    const m = summarizePredictions(preds, 1);
    expect(m.pooled?.W?.n).toBe(4); // only the two hurricanes can be predicted by the weather model
  });
});

describe("runBacktest", () => {
  const run = runBacktest(pool, options);
  it("echoes its configuration", () => {
    expect(run.config).toEqual({ bandwidth: 1, typeWeight: 1.5, targets: ["SPY", "WTI"] });
    expect(runBacktest(pool, { ...options, bandwidth: 0.75 }).config.bandwidth).toBe(0.75);
  });
  it("returns the predictions and their summary", () => {
    expect(run.predictions).toEqual(leaveOneOut(pool, options));
    expect(run.metrics).toEqual(summarizePredictions(run.predictions));
  });
  it("states its caveats, with the event counts and the types too thin to claim", () => {
    expect(run.caveats).toHaveLength(5);
    expect(run.caveats[0]).toContain("6 events");
    expect(run.caveats[0]).toContain("disaster 2");
    expect(run.caveats[0]).toContain("(disaster, geopolitical, macro, policy)");
    expect(run.caveats.join(" ")).toMatch(/hindsight/);
    expect(run.caveats.join(" ")).toMatch(/walk-forward/);
    expect(run.caveats.join(" ")).toMatch(/best track/);
  });
  it("is deterministic: the same numbers and text whatever the order of the events", () => {
    expect(runBacktest(pool, options)).toEqual(run);
    expect(runBacktest([...pool].reverse(), options)).toEqual(run);
  });
  it("reports at the three bandwidths side by side without changing the headline one", () => {
    const headline = runBacktest(pool, options);
    const narrow = runBacktest(pool, { ...options, bandwidth: 0.75 });
    const wide = runBacktest(pool, { ...options, bandwidth: 1.5 });
    expect(headline.config.bandwidth).toBe(1);
    expect(narrow.metrics.pooled?.C?.mae).not.toBe(headline.metrics.pooled?.C?.mae);
    expect(wide.metrics.pooled?.C?.mae).not.toBe(headline.metrics.pooled?.C?.mae);
    // N, T carry no kernel, so the bandwidth cannot change them
    expect(narrow.metrics.pooled?.N).toEqual(headline.metrics.pooled?.N);
    expect(wide.metrics.pooled?.T).toEqual(headline.metrics.pooled?.T);
  });
});
