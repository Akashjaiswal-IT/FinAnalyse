import type { EventFeatures, EventType, Reaction } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { runBacktest } from "./backtest";
import { renderBacktestSection, renderBacktestTables, type BacktestReportMeta } from "./backtest-report";
import type { PoolEvent } from "./forecast";

// The six-event pool and its metrics are the ones verified against the independent Python run in backtest.test.ts.

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
const meta: BacktestReportMeta = { generatedAt: "2026-10-03T16:40:00.000Z", machine: "test-host", commit: "abc1234" };

describe("renderBacktestTables", () => {
  const md = renderBacktestTables(runBacktest(pool, options));

  it("lists the pooled table with the python-verified numbers, formatted", () => {
    expect(md).toContain("### Pooled (all targets)");
    expect(md).toContain("| Model | n | Directional accuracy | Small moves excluded | MAE | Spearman |");
    expect(md).toContain("| N | 12 | 72.7% | 1 | 3.30% | 0.17 |");
    expect(md).toContain("| T | 8 | 75.0% | 0 | 3.75% | 0.55 |");
    expect(md).toContain("| S | 12 | 81.8% | 1 | 2.77% | 0.59 |");
    expect(md).toContain("| M | 12 | 81.8% | 1 | 2.91% | 0.52 |");
    expect(md).toContain("| W | 4 | 100.0% | 0 | 3.50% | 0.60 |");
    expect(md).toContain("| C | 12 | 72.7% | 1 | 2.93% | 0.49 |");
  });
  it("lists one table per target in the configured order", () => {
    expect(md.indexOf("#### SPY")).toBeGreaterThan(-1);
    expect(md.indexOf("#### SPY")).toBeLessThan(md.indexOf("#### WTI"));
    expect(md).toContain("| N | 6 | 66.7% | 0 | 2.60% | -1.00 |"); // SPY
    expect(md).toContain("| C | 6 | 66.7% | 0 | 1.76% | 0.55 |");
  });
  it("gives a thin event type its n but no metrics, and says why", () => {
    expect(md).toContain("#### geopolitical (2 events, fewer than 5: no per-type claim)");
    expect(md).toContain("#### policy (1 events, fewer than 5: no per-type claim)");
    expect(md).toContain("| C | 4 | n/a | 0 | n/a | n/a |"); // geopolitical, two events x two targets
  });
  it("sorts the event types and shows models with no pairs as n = 0", () => {
    const types = [...md.matchAll(/^#### (\w+) \(/gm)].map((m) => m[1]);
    expect(types).toEqual(["disaster", "geopolitical", "macro", "policy"]);
    expect(md).toContain("| W | 0 | n/a | 0 | n/a | n/a |"); // the weather model cannot predict a geopolitical event
  });
  it("is deterministic", () => {
    expect(renderBacktestTables(runBacktest([...pool].reverse(), options))).toBe(md);
  });
});

describe("renderBacktestSection", () => {
  const headline = runBacktest(pool, options);
  const narrow = runBacktest(pool, { ...options, bandwidth: 0.75 });
  const wide = runBacktest(pool, { ...options, bandwidth: 1.5 });
  const md = renderBacktestSection(headline, [wide, narrow], meta);

  it("states date, machine and commit, the events and the fixed parameters", () => {
    expect(md).toContain("## Backtest (leave-one-out, SPEC 9.1)");
    expect(md).toContain("- Run: 2026-10-03T16:40:00.000Z on test-host, commit `abc1234`.");
    expect(md).toContain("- Events: 6 (disaster 2, geopolitical 2, macro 1, policy 1). Targets: SPY, WTI.");
    expect(md).toContain("bandwidth h = 1, type weight 1.5");
    expect(md).toContain("  - W: weather features only (hurricanes)");
  });
  it("embeds the headline tables", () => {
    expect(md).toContain(renderBacktestTables(headline));
  });
  it("shows the other bandwidths next to the reported one, in ascending order, never instead of it", () => {
    const at = (s: string) => md.indexOf(s);
    expect(md).toContain("### Bandwidth sensitivity (pooled)");
    expect(at("| 0.75 | C |")).toBeGreaterThan(-1);
    expect(at("| 0.75 | C |")).toBeLessThan(at("| 1 (reported) | C |"));
    expect(at("| 1 (reported) | C |")).toBeLessThan(at("| 1.5 | C |"));
    // N and T have no kernel, so their rows are the same at every bandwidth
    const rowsOf = (label: string, model: string) =>
      md.split("\n").filter((l) => l.startsWith(`| ${label} | ${model} |`)).map((l) => l.replace(`| ${label} `, ""));
    expect(rowsOf("0.75", "N")).toEqual(rowsOf("1 (reported)", "N"));
    expect(rowsOf("1.5", "T")).toEqual(rowsOf("1 (reported)", "T"));
    expect(rowsOf("0.75", "C")).not.toEqual(rowsOf("1 (reported)", "C"));
  });
  it("lists every caveat of the headline run", () => {
    expect(md).toContain("### Caveats");
    for (const caveat of headline.caveats) expect(md).toContain(`- ${caveat}`);
  });
  it("leaves out the sensitivity table when there is no other bandwidth", () => {
    const alone = renderBacktestSection(headline, [], meta);
    expect(alone).not.toContain("Bandwidth sensitivity");
    expect(alone).toContain("### Caveats");
  });
  it("is deterministic", () => {
    expect(renderBacktestSection(headline, [wide, narrow], meta)).toBe(md);
    expect(renderBacktestSection(headline, [narrow, wide], meta)).toBe(md);
  });
});
