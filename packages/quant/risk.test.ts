import type { FactorExposure, HoldingExposure } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import {
  analogReplayPnl,
  factorExposures,
  historicalPnl,
  pnlByChannel,
  pnlBySector,
  portfolioFactorBeta,
  portfolioVarCvar,
  riskSnapshot,
  scenarioPnl,
  topFactorExposures,
  varCvar,
} from "./risk";

// Reference values come from independent Python calculations (math.expm1, statistics.linear_regression).

const link = (channel: "direct" | "peer" | "factor") => ({
  channel,
  reason: channel === "direct" ? ("named_in_news" as const) : channel === "peer" ? ("peer_group" as const) : ("factor_beta" as const),
  detail: "x",
  evidenceKeys: [],
});
const exposure = (symbol: string, ...channels: ("direct" | "peer" | "factor")[]): HoldingExposure => ({
  symbol,
  channels: channels.map(link),
  expectedSign: "unclear",
});

describe("varCvar", () => {
  it("with 20 observations the 5% tail is the single worst day", () => {
    const pnl = [-50, -40, -30, -20, -10, 0, 5, 8, 10, 12, 15, 18, 20, 22, 25, 30, 35, 40, 45, 60];
    expect(pnl).toHaveLength(20);
    expect(varCvar(pnl)).toEqual({ var95: 50, cvar95: 50 });
  });
  it("with 40 observations the tail is the two worst days", () => {
    const pnl = [-50, -40, ...Array.from({ length: 38 }, (_, i) => i)];
    expect(varCvar(pnl)).toEqual({ var95: 40, cvar95: 45 });
  });
  it("with 100 observations the tail is the five worst days", () => {
    const pnl = Array.from({ length: 100 }, (_, i) => i - 50); // -50 .. 49
    const r = varCvar(pnl);
    expect(r.var95).toBe(46); // 5th worst is -46
    expect(r.cvar95).toBe(48); // mean(-50..-46) = -48
  });
  it("does not depend on input order and CVaR is never below VaR", () => {
    const pnl = [3, -7, 1, -2, 9, -12, 4, 0, -5, 6, 2, -1, 8, -3, 5, -9, 7, -4, 10, -6];
    const a = varCvar(pnl);
    expect(varCvar([...pnl].reverse())).toEqual(a);
    expect(a.cvar95).toBeGreaterThanOrEqual(a.var95);
  });
  it("supports another confidence level and rejects an empty series", () => {
    const pnl = Array.from({ length: 100 }, (_, i) => i - 50);
    expect(varCvar(pnl, 0.9).var95).toBe(41); // k = 10 -> 10th worst is -41
    expect(() => varCvar([])).toThrow(RangeError);
  });
});

describe("historicalPnl", () => {
  const returns = { A: [0.01, -0.02, 0.03], B: [0.02, 0.01, -0.01] };
  const values = { A: 1000, B: -500 };
  it("replays today's positions over each past day", () => {
    const pnl = historicalPnl(values, returns);
    expect(pnl).toHaveLength(3);
    expect(pnl[0]).toBeCloseTo(-0.05050293, 7);
    expect(pnl[1]).toBeCloseTo(-24.82641024, 7);
    expect(pnl[2]).toBeCloseTo(35.42961707, 7);
  });
  it("uses overlapping window sums of log returns for longer horizons", () => {
    const pnl = historicalPnl(values, returns, 2);
    expect(pnl).toHaveLength(2);
    expect(pnl[0]).toBeCloseTo(-25.17743323, 7);
    expect(pnl[1]).toBeCloseTo(10.05016708, 7);
  });
  it("ignores zero-value entries and fails on a missing return column", () => {
    expect(historicalPnl({ A: 1000, Z: 0 }, returns)).toHaveLength(3);
    expect(historicalPnl({}, returns)).toEqual([]);
    expect(() => historicalPnl({ A: 1000, Z: 5 }, returns)).toThrow(RangeError);
  });
});

describe("scenarioPnl", () => {
  it("is value times (e^r - 1) per holding", () => {
    const r = scenarioPnl({ A: 1000, B: 2000 }, { A: Math.log(1.1), B: -0.05 });
    expect(r.perHolding[0]?.pnl).toBeCloseTo(100, 8);
    expect(r.perHolding[1]?.pnl).toBeCloseTo(-97.541151, 6);
    expect(r.total).toBeCloseTo(2.458849, 6);
  });
  it("throws instead of inventing a missing forecast", () => {
    expect(() => scenarioPnl({ A: 1000 }, {})).toThrow(/no forecast for A/);
  });
});

describe("pnlBySector and pnlByChannel", () => {
  const perHolding = [
    { symbol: "XOM", pnl: 10 },
    { symbol: "CVX", pnl: 5 },
    { symbol: "LMT", pnl: 8 },
    { symbol: "DAL", pnl: -12 },
    { symbol: "SPY", pnl: -3 },
  ];
  it("sums per sector, sorted by name, leaving out holdings with no sector", () => {
    const out = pnlBySector(perHolding, { XOM: "energy", CVX: "energy", LMT: "defense", DAL: "airlines" });
    expect(out).toEqual([
      { sector: "airlines", pnl: -12 },
      { sector: "defense", pnl: 8 },
      { sector: "energy", pnl: 15 },
    ]);
  });
  it("counts each exposed holding once under its primary channel; channel rows sum to the exposed P&L", () => {
    const out = pnlByChannel(perHolding, [
      exposure("LMT", "direct", "factor"),
      exposure("XOM", "factor"),
      exposure("CVX", "peer", "factor"),
      exposure("DAL", "factor"),
    ]);
    expect(out).toEqual([
      { channel: "direct", pnl: 8 },
      { channel: "peer", pnl: 5 },
      { channel: "factor", pnl: -2 }, // XOM 10 + DAL -12; SPY has no channel and is left out
    ]);
    expect(out.reduce((s, c) => s + c.pnl, 0)).toBe(11);
  });
});

describe("analogReplayPnl", () => {
  it("averages by weight over analogs with data for every holding and reports the worst", () => {
    const r = analogReplayPnl({ A: 1000, B: 2000 }, [
      { weight: 1, returns: { A: 0.01, B: -0.02 } },
      { weight: 3, returns: { A: 0.02, B: null } }, // no data for B: left out
      { weight: 2, returns: { A: -0.05, B: -0.01 } },
      { weight: 0, returns: { A: 0.5, B: 0.5 } }, // no weight: not an analog
    ]);
    expect(r?.n).toBe(2);
    expect(r?.weightedMean).toBeCloseTo(-55.6314341, 6);
    expect(r?.worst).toBeCloseTo(-68.670908, 6);
  });
  it("is null when no analog has data", () => {
    expect(analogReplayPnl({ A: 1000 }, [{ weight: 1, returns: {} }])).toBeNull();
    expect(analogReplayPnl({ A: 1000 }, [])).toBeNull();
  });
});

describe("factorExposures", () => {
  const f = [0.01, -0.02, 0.015, 0.0, -0.01, 0.02];
  const h = [0.021, -0.038, 0.032, 0.001, -0.019, 0.041];
  const g = [0.02, 0.01, -0.015, 0.005, 0.03, -0.02];
  it("returns the OLS beta and R² of each holding on each factor", () => {
    const out = factorExposures({ H: h, G: g }, { MARKET: f });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ holding: "H", factor: "MARKET" });
    expect(out[0]?.beta).toBeCloseTo(1.99157895, 7);
    expect(out[0]?.r2).toBeCloseTo(0.99973487, 7);
    expect(out[1]?.beta).toBeCloseTo(-0.84210526, 7);
    expect(out[1]?.r2).toBeCloseTo(0.4432133, 7);
  });
  it("lists factors in contract order and skips factors with no returns", () => {
    const out = factorExposures({ H: h }, { WTI: g, MARKET: f });
    expect(out.map((e) => e.factor)).toEqual(["MARKET", "WTI"]);
  });
});

describe("portfolioFactorBeta and topFactorExposures", () => {
  const exposures: FactorExposure[] = [
    { holding: "A", factor: "MARKET", beta: 1.2, r2: 0.5 },
    { holding: "B", factor: "MARKET", beta: 0.5, r2: 0.3 },
    { holding: "A", factor: "WTI", beta: -0.3, r2: 0.2 },
    { holding: "B", factor: "WTI", beta: 0.9, r2: 0.6 },
    { holding: "B", factor: "GOLD", beta: -0.1, r2: 0.1 },
  ];
  const values = { A: 6_000_000, B: 4_000_000 };
  it("is the value-weighted beta over NAV", () => {
    expect(portfolioFactorBeta(values, 10_000_000, exposures, "MARKET")).toBeCloseTo(0.6 * 1.2 + 0.4 * 0.5, 12);
    expect(portfolioFactorBeta(values, 10_000_000, exposures, "WTI")).toBeCloseTo(0.6 * -0.3 + 0.4 * 0.9, 12);
    expect(portfolioFactorBeta(values, 10_000_000, exposures, "RATES")).toBe(0);
  });
  it("ranks factors by absolute portfolio beta", () => {
    const top = topFactorExposures(values, 10_000_000, exposures);
    expect(top.map((t) => t.factor)).toEqual(["MARKET", "WTI", "GOLD"]);
    expect(topFactorExposures(values, 10_000_000, exposures, 1)).toHaveLength(1);
    expect(top[1]?.beta).toBeCloseTo(0.18, 12);
  });
});

describe("riskSnapshot", () => {
  const Ra = [0.01, -0.02, 0.015, -0.005, 0.012, -0.018, 0.007, 0.003, -0.011, 0.02, -0.004, 0.009];
  const Rb = [-0.004, 0.012, -0.008, 0.006, -0.01, 0.015, -0.003, 0.002, 0.007, -0.013, 0.005, -0.006];
  const Rf = [0.008, -0.015, 0.012, -0.004, 0.01, -0.014, 0.005, 0.002, -0.009, 0.016, -0.003, 0.007];
  it("combines VaR/CVaR, sleeve beta and scenario P&L (python reference)", () => {
    const snap = riskSnapshot({
      nav: 10_000_000,
      values: { A: 6_000_000, B: 4_000_000 },
      returns: { A: Ra, B: Rb },
      factorReturns: { MARKET: Rf },
      factor: "MARKET",
      sleeve: ["A", "B"],
      forecast: { A: 0.02, B: -0.01 },
    });
    // 12 daily and 8 overlapping 5-day observations: the 5% tail is the single worst one.
    expect(snap.var1d.var95).toBeCloseTo(70518.8047, 3);
    expect(snap.var1d.cvar95).toBeCloseTo(70518.8047, 3);
    expect(snap.var5d.var95).toBeCloseTo(34783.8212, 3);
    expect(snap.sleeveBeta).toBeCloseTo(0.42147359, 7);
    expect(snap.scenarioPnl).toBeCloseTo(81407.3752, 3);
  });
  it("only counts the sleeve in the beta but all positions in VaR and scenario P&L", () => {
    const snap = riskSnapshot({
      nav: 10_000_000,
      values: { A: 6_000_000, B: 4_000_000 },
      returns: { A: Ra, B: Rb },
      factorReturns: { MARKET: Rf },
      factor: "MARKET",
      sleeve: ["A"],
      forecast: { A: 0.02, B: -0.01 },
    });
    expect(snap.sleeveBeta).toBeCloseTo(0.6 * 1.27320148, 6);
    expect(snap.scenarioPnl).toBeCloseTo(81407.3752, 3);
  });
  it("matches portfolioVarCvar and fails without returns for the factor", () => {
    expect(portfolioVarCvar({ A: 6_000_000, B: 4_000_000 }, { A: Ra, B: Rb }, 1).var95).toBeCloseTo(70518.8047, 3);
    expect(() =>
      riskSnapshot({ nav: 1, values: {}, returns: {}, factorReturns: {}, factor: "MARKET", sleeve: [], forecast: {} }),
    ).toThrow(RangeError);
  });
});
