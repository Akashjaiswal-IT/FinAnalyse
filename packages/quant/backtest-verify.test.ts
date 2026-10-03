import type { EventFeatures, EventType, Reaction } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { runBacktest } from "./backtest";
import { diffBacktests } from "./backtest-verify";
import type { PoolEvent } from "./forecast";

const NONE: EventFeatures = { volZ: null, toneZ: null, vixZ: null, windKt: null, capAtRisk: null, offshoreExposure: null };
const react = (d5: number): Reaction => ({ d1: null, d5, d20: null });
function event(id: string, type: EventType, features: Partial<EventFeatures>, spy: number, wti: number): PoolEvent {
  return { id, name: id, type, subtype: null, features: { ...NONE, ...features }, reactions: { SPY: react(spy), WTI: react(wti) } };
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
const fresh = runBacktest(pool, options);
/** What comes back from Postgres jsonb: a JSON round trip. */
const stored = (run: typeof fresh) => JSON.parse(JSON.stringify(run)) as typeof fresh;

describe("diffBacktests", () => {
  it("a deterministic re-run equals the recorded run, including after a jsonb round trip", () => {
    const again = diffBacktests(runBacktest([...pool].reverse(), options), stored(fresh));
    expect(again).toEqual({ same: true, differences: [], omitted: 0 });
  });
  it("names the events that were added or removed first, as the likely cause", () => {
    const more = runBacktest([...pool, event("e5", "policy", { volZ: 3, toneZ: -1, vixZ: 1 }, -0.02, 0.01)], options);
    const d = diffBacktests(more, stored(fresh));
    expect(d.same).toBe(false);
    expect(d.differences[0]).toBe("events: 1 not in the recorded run (e5)");
    expect(d.differences.some((l) => l.startsWith("metrics."))).toBe(true);
    const fewer = diffBacktests(runBacktest(pool.slice(1), options), stored(fresh));
    expect(fewer.differences[0]).toBe("events: 1 in the recorded run but not now (e1)");
  });
  it("finds a changed metric exactly, with both values", () => {
    const tampered = stored(fresh);
    (tampered.metrics.pooled?.C as { mae: number }).mae += 1e-12; // one part in 10^10 is still a difference
    const d = diffBacktests(fresh, tampered);
    expect(d.same).toBe(false);
    expect(d.differences).toHaveLength(1);
    expect(d.differences[0]).toMatch(/^metrics\.pooled\.C\.mae: recorded 0\.029326633\d+, fresh 0\.029326633\d+$/);
  });
  it("finds a changed prediction and counts how many differ", () => {
    const tampered = stored(fresh);
    (tampered.predictions[5] as { predicted: number | null }).predicted = 0.123;
    (tampered.predictions[9] as { predicted: number | null }).predicted = 0.456;
    const d = diffBacktests(fresh, tampered);
    expect(d.differences.some((l) => l.startsWith("predictions: 2 of 72 differ, the first at #5"))).toBe(true);
  });
  it("finds a different configuration, caveat list and prediction count", () => {
    const other = runBacktest(pool, { ...options, bandwidth: 0.75 });
    expect(diffBacktests(other, stored(fresh)).differences).toContain("config.bandwidth: recorded 1, fresh 0.75");
    const noCaveats = { ...stored(fresh), caveats: [] };
    expect(diffBacktests(fresh, noCaveats).differences).toContain("caveats differ");
    const short = { ...stored(fresh), predictions: stored(fresh).predictions.slice(1) };
    expect(diffBacktests(fresh, short).differences).toContain("predictions: recorded 71, fresh 72");
  });
  it("reports a metrics key or model that exists on one side only", () => {
    const tampered = stored(fresh);
    delete tampered.metrics["type:macro"];
    delete tampered.metrics.pooled?.W;
    const d = diffBacktests(fresh, tampered);
    expect(d.differences).toContain("metrics.type:macro: missing in the recorded run");
    expect(d.differences).toContain("metrics.pooled.W: missing in the recorded run");
  });
  it("limits the list and says how many were left out", () => {
    const wrong = stored(fresh);
    for (const key of Object.keys(wrong.metrics)) {
      for (const m of Object.values(wrong.metrics[key] ?? {})) (m as { n: number }).n += 1;
    }
    const d = diffBacktests(fresh, wrong, 3);
    expect(d.differences).toHaveLength(3);
    expect(d.omitted).toBeGreaterThan(0);
    expect(diffBacktests(fresh, wrong, 1000).omitted).toBe(0);
  });
  it("does not change its inputs", () => {
    const before = JSON.stringify(fresh);
    diffBacktests(fresh, stored(fresh));
    expect(JSON.stringify(fresh)).toBe(before);
  });
});
