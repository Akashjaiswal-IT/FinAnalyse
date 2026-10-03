import { describe, expect, it } from "vitest";
import {
  DEMO_PORTFOLIO,
  FORECAST_TARGETS,
  GRAPH_EDGES,
  HEDGE_MENU,
  LANDFALL_REGIONS,
  NODE_ORDER,
  REPLAY_PRESETS,
  TICKER_ALIASES,
  UNIVERSE,
  UNIVERSE_SYMBOLS,
} from "./constants";
import { NodeName } from "./schemas";

describe("constants", () => {
  it("has 21 unique instruments", () => {
    expect(UNIVERSE).toHaveLength(21);
    expect(new Set(UNIVERSE_SYMBOLS).size).toBe(21);
  });

  it("holds 95% in positions and 5% in cash", () => {
    const total = DEMO_PORTFOLIO.positions.reduce((s, p) => s + p.targetWeight, 0);
    expect(total).toBeCloseTo(0.95, 10);
    expect(DEMO_PORTFOLIO.positions).toHaveLength(11);
  });

  it("only references universe symbols", () => {
    for (const s of HEDGE_MENU) expect(UNIVERSE_SYMBOLS).toContain(s);
    for (const s of FORECAST_TARGETS) expect(UNIVERSE_SYMBOLS).toContain(s);
    for (const s of Object.keys(TICKER_ALIASES)) expect(UNIVERSE_SYMBOLS).toContain(s);
    for (const u of UNIVERSE) if (u.proxyFor) expect(UNIVERSE_SYMBOLS).toContain(u.proxyFor);
  });

  it("keeps the graph definition consistent with NodeName", () => {
    expect([...NODE_ORDER].sort()).toEqual([...NodeName.options].sort());
    for (const [from, to] of GRAPH_EDGES) {
      expect(NODE_ORDER).toContain(from);
      expect(NODE_ORDER).toContain(to);
    }
  });

  it("has four unique replay presets in the allowed range", () => {
    expect(REPLAY_PRESETS).toHaveLength(4);
    expect(new Set(REPLAY_PRESETS.map((p) => p.id)).size).toBe(4);
    for (const p of REPLAY_PRESETS) expect(Date.parse(p.asOf)).toBeGreaterThanOrEqual(Date.parse("2017-01-01"));
  });

  it("defines six landfall regions", () => {
    expect(Object.keys(LANDFALL_REGIONS)).toHaveLength(6);
  });
});
