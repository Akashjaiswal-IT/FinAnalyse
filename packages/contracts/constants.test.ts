import { describe, expect, it } from "vitest";
import {
  AV_DAILY_MAX,
  AV_ROTATION,
  DEMO_PORTFOLIO,
  EVENT_KEYWORDS,
  EVENT_SUBTYPES,
  EXTERNAL_PEERS,
  FACTORS,
  FORECAST_TARGETS,
  GRAPH_EDGES,
  HEDGE_MENU,
  LANDFALL_REGIONS,
  NEWS_QUERIES,
  NODE_ORDER,
  NUMERIC_ALLOWLIST,
  PEERS,
  REPLAY_PRESETS,
  SEVERITY_BOUNDS,
  SEVERITY_VOLZ,
  TICKER_ALIASES,
  TIINGO_SYMBOLS,
  UNIVERSE,
  UNIVERSE_SYMBOLS,
  WEATHER_SUBTYPES,
  gdeltOrQuery,
} from "./constants";
import { EventType, FactorName, NodeName } from "./schemas";

describe("universe and portfolio", () => {
  it("has 37 Tiingo symbols plus 4 FRED factors, all unique", () => {
    expect(TIINGO_SYMBOLS).toHaveLength(37);
    expect(UNIVERSE).toHaveLength(41);
    expect(new Set(UNIVERSE_SYMBOLS).size).toBe(41);
  });

  it("holds 95% in 23 positions and 5% in cash", () => {
    const total = DEMO_PORTFOLIO.positions.reduce((s, p) => s + p.targetWeight, 0);
    expect(total).toBeCloseTo(0.95, 10);
    expect(DEMO_PORTFOLIO.positions).toHaveLength(23);
  });

  it("only references universe symbols", () => {
    const refs = [
      ...HEDGE_MENU,
      ...FORECAST_TARGETS,
      ...Object.values(FACTORS),
      ...Object.keys(TICKER_ALIASES),
      ...Object.keys(PEERS),
      ...Object.values(PEERS).flat(),
      ...Object.values(EXTERNAL_PEERS).flat(),
      ...UNIVERSE.flatMap((u) => (u.proxyFor ? [u.proxyFor] : [])),
      ...AV_ROTATION.flatMap((e) => (e.kind === "tickers" ? [e.value] : [])),
    ];
    for (const s of refs) expect(UNIVERSE_SYMBOLS).toContain(s);
  });

  it("gives every Tiingo symbol at least one alias, and every factor a series", () => {
    for (const s of TIINGO_SYMBOLS) expect(TICKER_ALIASES[s]?.length ?? 0).toBeGreaterThan(0);
    expect(Object.keys(FACTORS).sort()).toEqual([...FactorName.options].sort());
  });

  it("keeps peer groups symmetric", () => {
    for (const [s, peers] of Object.entries(PEERS)) {
      for (const p of peers) expect(PEERS[p]).toContain(s);
    }
  });
});

describe("events", () => {
  it("covers every event type with subtypes and keywords", () => {
    for (const t of EventType.options) {
      expect(EVENT_SUBTYPES[t].length).toBeGreaterThan(0);
      expect(EVENT_KEYWORDS[t].length).toBeGreaterThan(0);
    }
    for (const s of WEATHER_SUBTYPES) expect(EVENT_SUBTYPES.disaster).toContain(s);
  });

  it("has a collection query per event type except corporate, which uses company queries", () => {
    for (const t of EventType.options) {
      if (t === "corporate") expect(Object.keys(NEWS_QUERIES).some((k) => k.startsWith("company_"))).toBe(true);
      else expect(NEWS_QUERIES[t]).toBeDefined();
    }
    for (const q of Object.values(NEWS_QUERIES)) expect(q).toContain("sourcelang:english");
  });

  it("builds GDELT OR queries with quoted phrases and no two-letter terms", () => {
    expect(gdeltOrQuery(["Exxon", "Bank of America", "BP"])).toBe('(Exxon OR "Bank of America") sourcelang:english');
  });

  it("orders severity values and bounds", () => {
    expect(SEVERITY_VOLZ.low).toBeLessThan(SEVERITY_BOUNDS.medium);
    expect(SEVERITY_VOLZ.medium).toBeGreaterThanOrEqual(SEVERITY_BOUNDS.medium);
    expect(SEVERITY_VOLZ.medium).toBeLessThan(SEVERITY_BOUNDS.high);
    expect(SEVERITY_VOLZ.high).toBeGreaterThanOrEqual(SEVERITY_BOUNDS.high);
  });

  it("fits the Alpha Vantage rotation inside the daily quota", () => {
    expect(AV_ROTATION.length).toBeLessThanOrEqual(AV_DAILY_MAX);
  });
});

describe("replay presets", () => {
  it("has six unique presets, one per main type, in the allowed range", () => {
    expect(REPLAY_PRESETS).toHaveLength(6);
    expect(new Set(REPLAY_PRESETS.map((p) => p.id)).size).toBe(6);
    expect(new Set(REPLAY_PRESETS.map((p) => p.type)).size).toBe(6);
    for (const p of REPLAY_PRESETS) {
      expect(Date.parse(p.asOf)).toBeGreaterThanOrEqual(Date.parse("2017-01-01"));
      expect(p.id.startsWith(p.type === "supply_shock" ? "supply" : p.type)).toBe(true);
    }
  });

  it("sets asOf to firstReportAt plus 24 hours for curated presets", () => {
    for (const p of REPLAY_PRESETS) {
      if (p.firstReportAt === null) continue;
      expect(Date.parse(p.asOf) - Date.parse(p.firstReportAt)).toBe(24 * 3_600_000);
    }
  });
});

describe("graph and verifier constants", () => {
  it("keeps the graph definition consistent with NodeName", () => {
    expect([...NODE_ORDER].sort()).toEqual([...NodeName.options].sort());
    for (const [from, to] of GRAPH_EDGES) {
      expect(NODE_ORDER).toContain(from);
      expect(NODE_ORDER).toContain(to);
    }
  });

  it("lists longer allowlist entries before their prefixes", () => {
    NUMERIC_ALLOWLIST.forEach((a, i) => {
      for (const b of NUMERIC_ALLOWLIST.slice(i + 1)) expect(b.includes(a) && b !== a).toBe(false);
    });
  });

  it("defines six landfall regions", () => {
    expect(Object.keys(LANDFALL_REGIONS)).toHaveLength(6);
  });
});
