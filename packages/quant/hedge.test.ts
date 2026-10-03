import { describe, expect, it } from "vitest";
import {
  applyOrders,
  checkHedgeLimits,
  fallbackHedge,
  maxOrderQuantity,
  minVarianceHedgeRatio,
  orderNotional,
  simulateHedges,
  suggestHedges,
  type HedgeLimitContext,
} from "./hedge";

// nav $10M: single action <= $1M, gross <= $3M, ADV share <= 1% of average dollar volume.
const ctx: HedgeLimitContext = {
  nav: 10_000_000,
  prices: { XLE: 100, SPY: 500, TLT: 90, XOM: 110, GLD: 200 },
  adv: { XLE: 50_000_000, SPY: 5_000_000_000, TLT: 2_000_000_000, XOM: 1_000_000_000, GLD: 1_000_000_000 },
  holdings: { XOM: 50, XLE: 0 },
};

const rules = (v: ReturnType<typeof checkHedgeLimits>) => v.map((x) => x.rule);

describe("orderNotional", () => {
  it("is quantity times price and fails without a price", () => {
    expect(orderNotional({ symbol: "XLE", side: "sell", quantity: 4000 }, ctx.prices)).toBe(400_000);
    expect(() => orderNotional({ symbol: "ZZZ", side: "buy", quantity: 1 }, ctx.prices)).toThrow(RangeError);
  });
});

describe("checkHedgeLimits", () => {
  it("accepts a plan inside every limit", () => {
    expect(checkHedgeLimits([{ symbol: "XLE", side: "sell", quantity: 4000 }], ctx)).toEqual([]);
    expect(checkHedgeLimits([], ctx)).toEqual([]);
  });
  it("accepts a single action exactly at 10% of NAV and an ADV share exactly at 1%", () => {
    expect(checkHedgeLimits([{ symbol: "SPY", side: "sell", quantity: 2000 }], ctx)).toEqual([]); // $1,000,000
    expect(checkHedgeLimits([{ symbol: "XLE", side: "sell", quantity: 5000 }], ctx)).toEqual([]); // $500,000 = 1% of ADV
  });
  it("flags a single action above 10% of NAV", () => {
    const v = checkHedgeLimits([{ symbol: "SPY", side: "sell", quantity: 2001 }], ctx);
    expect(rules(v)).toEqual(["single_action"]);
    expect(v[0]?.symbol).toBe("SPY");
  });
  it("flags notional above 1% of ADV", () => {
    expect(rules(checkHedgeLimits([{ symbol: "XLE", side: "sell", quantity: 5001 }], ctx))).toEqual(["adv"]);
  });
  it("flags gross notional above 30% of NAV", () => {
    const orders = ["SPY", "TLT", "GLD", "XLE", "SPY"].map((symbol) => ({ symbol, side: "sell" as const, quantity: 1 }));
    expect(checkHedgeLimits(orders, ctx)).toEqual([]); // tiny
    const big = [
      { symbol: "SPY", side: "sell" as const, quantity: 1400 }, // $700k each: 5 x = $3.5M
      { symbol: "TLT", side: "sell" as const, quantity: 7778 },
      { symbol: "GLD", side: "sell" as const, quantity: 3500 },
      { symbol: "SPY", side: "buy" as const, quantity: 1400 },
      { symbol: "TLT", side: "buy" as const, quantity: 7778 },
    ];
    const v = checkHedgeLimits(big, ctx);
    expect(rules(v)).toEqual(["gross_notional"]);
    expect(v[0]?.symbol).toBeNull();
  });
  it("flags non-integer or non-positive quantities", () => {
    expect(rules(checkHedgeLimits([{ symbol: "XLE", side: "sell", quantity: 10.5 }], ctx))).toContain("integer_quantity");
    expect(rules(checkHedgeLimits([{ symbol: "XLE", side: "sell", quantity: 0 }], ctx))).toContain("integer_quantity");
    expect(rules(checkHedgeLimits([{ symbol: "XLE", side: "sell", quantity: -3 }], ctx))).toContain("integer_quantity");
  });
  it("only allows new positions in menu ETFs; sells of other holdings may not exceed the quantity held", () => {
    expect(rules(checkHedgeLimits([{ symbol: "XOM", side: "buy", quantity: 10 }], ctx))).toEqual(["menu"]);
    expect(rules(checkHedgeLimits([{ symbol: "XOM", side: "sell", quantity: 51 }], ctx))).toEqual(["menu"]);
    expect(checkHedgeLimits([{ symbol: "XOM", side: "sell", quantity: 50 }], ctx)).toEqual([]);
    expect(checkHedgeLimits([{ symbol: "XLE", side: "sell", quantity: 100 }], ctx)).toEqual([]); // menu ETF: may go short
  });
  it("flags symbols outside the universe and missing prices or ADV", () => {
    expect(rules(checkHedgeLimits([{ symbol: "ZZZ", side: "sell", quantity: 1 }], ctx))).toEqual(["universe"]);
    const noPrice = { ...ctx, prices: {} };
    expect(rules(checkHedgeLimits([{ symbol: "XLE", side: "sell", quantity: 1 }], noPrice))).toEqual(["universe"]);
    const noAdv = { ...ctx, adv: {} };
    expect(rules(checkHedgeLimits([{ symbol: "XLE", side: "sell", quantity: 1 }], noAdv))).toEqual(["adv"]);
  });
  it("honours custom limits and menu", () => {
    const tight: HedgeLimitContext = { ...ctx, limits: { grossNotionalMaxPctNav: 0.01, singleActionMaxPctNav: 0.01, advMaxFraction: 0.01 } };
    expect(rules(checkHedgeLimits([{ symbol: "SPY", side: "sell", quantity: 400 }], tight))).toEqual(["single_action", "gross_notional"]);
    expect(rules(checkHedgeLimits([{ symbol: "XLE", side: "buy", quantity: 1 }], { ...ctx, menu: ["SPY"] }))).toEqual(["menu"]);
  });
});

describe("maxOrderQuantity", () => {
  it("is the integer quantity under the tightest of the single, gross and ADV caps", () => {
    expect(maxOrderQuantity("XLE", ctx, 0)).toBe(5000); // ADV cap $500k / $100
    expect(maxOrderQuantity("SPY", ctx, 0)).toBe(2000); // single cap $1M / $500
    expect(maxOrderQuantity("XLE", ctx, 2_800_000)).toBe(2000); // gross cap leaves $200k
    expect(maxOrderQuantity("XLE", ctx, 3_000_000)).toBe(0);
    expect(maxOrderQuantity("XLE", ctx, 3_500_000)).toBe(0);
  });
  it("floors to a whole quantity and is 0 without a price or ADV", () => {
    expect(maxOrderQuantity("SPY", { ...ctx, prices: { SPY: 333 } }, 0)).toBe(3003); // $1M / $333 = 3003.003
    expect(maxOrderQuantity("ZZZ", ctx, 0)).toBe(0);
    expect(maxOrderQuantity("XLE", { ...ctx, adv: {} }, 0)).toBe(0);
  });
  it("a quantity it returns passes checkHedgeLimits", () => {
    for (const symbol of ["XLE", "SPY", "TLT", "GLD"]) {
      const q = maxOrderQuantity(symbol, ctx, 0);
      expect(checkHedgeLimits([{ symbol, side: "sell", quantity: q }], ctx)).toEqual([]);
    }
  });
});

describe("minVarianceHedgeRatio", () => {
  const etf = [0.01, -0.02, 0.015, 0.0, -0.01, 0.02];
  it("is cov(S, E) / var(E): exact for a pure exposure", () => {
    expect(minVarianceHedgeRatio(etf.map((e) => 1.5e6 * e), etf)).toBeCloseTo(1.5e6, 4);
  });
  it("matches a regression of the sleeve P&L on the ETF return", () => {
    const sleeve = [15000, -29000, 23000, 500, -14000, 31000];
    expect(minVarianceHedgeRatio(sleeve, etf)).toBeCloseTo(1489473.6842, 3); // python linear_regression slope
    expect(minVarianceHedgeRatio(sleeve, [0.005, 0.01, -0.02, 0.0, 0.015, -0.01])).toBeCloseTo(-1405882.3529, 3);
  });
  it("is null for a constant ETF series", () => {
    expect(minVarianceHedgeRatio([1, 2, 3], [0.01, 0.01, 0.01])).toBeNull();
  });
});

describe("suggestHedges and fallbackHedge", () => {
  const sleeve = [15000, -29000, 23000, 500, -14000, 31000];
  const returns = {
    XLE: [0.01, -0.02, 0.015, 0.0, -0.01, 0.02], // r² 0.99973, sell $1.489M
    TLT: [0.005, 0.01, -0.02, 0.0, 0.015, -0.01], // r² 0.63753, buy $1.406M
  };
  it("ranks menu ETFs by fit and sizes each within the limits", () => {
    const out = suggestHedges(sleeve, returns, ctx);
    expect(out.map((s) => s.symbol)).toEqual(["XLE", "TLT"]);
    expect(out[0]).toMatchObject({ side: "sell" });
    expect(out[0]?.r2).toBeCloseTo(0.9997337, 6);
    expect(out[0]?.hedgeNotional).toBeCloseTo(1489473.68, 1);
    expect(out[0]?.quantity).toBe(5000); // wants 14894 shares; the ADV cap is 5000
    expect(out[1]).toMatchObject({ side: "buy" });
    expect(out[1]?.hedgeNotional).toBeLessThan(0);
    expect(out[1]?.quantity).toBe(11111); // wants floor(1405882 / 90) = 15620; the single cap $1M gives 11111
  });
  it("skips symbols with no returns, no price, no fit or off the menu", () => {
    expect(suggestHedges(sleeve, { XLE: returns.XLE, XOM: returns.XLE, GLD: [0.01, 0.01, 0.01, 0.01, 0.01, 0.01] }, ctx).map((s) => s.symbol)).toEqual(["XLE"]);
    expect(suggestHedges(sleeve, { XLE: returns.XLE }, { ...ctx, prices: {} })).toEqual([]);
  });
  it("the fallback is the best-fit suggestion that has a quantity", () => {
    const out = suggestHedges(sleeve, returns, ctx);
    expect(fallbackHedge(out)).toEqual({ symbol: "XLE", side: "sell", quantity: 5000 });
    expect(fallbackHedge([{ ...(out[0] as (typeof out)[number]), quantity: 0 }, out[1] as (typeof out)[number]])).toEqual({
      symbol: "TLT",
      side: "buy",
      quantity: 11111,
    });
    expect(fallbackHedge([])).toBeNull();
  });
});

describe("applyOrders", () => {
  it("adds buys, subtracts sells and lets a sell go short", () => {
    const out = applyOrders({ XLE: 100, XOM: 50 }, [
      { symbol: "XLE", side: "sell", quantity: 150 },
      { symbol: "XOM", side: "buy", quantity: 5 },
      { symbol: "SPY", side: "sell", quantity: 10 },
    ]);
    expect(out).toEqual({ XLE: -50, XOM: 55, SPY: -10 });
  });
  it("does not change its input", () => {
    const q = { XLE: 1 };
    applyOrders(q, [{ symbol: "XLE", side: "buy", quantity: 1 }]);
    expect(q).toEqual({ XLE: 1 });
  });
});

describe("simulateHedges", () => {
  const Ra = [0.01, -0.02, 0.015, -0.005, 0.012, -0.018, 0.007, 0.003, -0.011, 0.02, -0.004, 0.009];
  const Rb = [-0.004, 0.012, -0.008, 0.006, -0.01, 0.015, -0.003, 0.002, 0.007, -0.013, 0.005, -0.006];
  const Rf = [0.008, -0.015, 0.012, -0.004, 0.01, -0.014, 0.005, 0.002, -0.009, 0.016, -0.003, 0.007];
  const book = {
    nav: 10_000_000,
    values: { A: 6_000_000, B: 4_000_000 },
    returns: { A: Ra, B: Rb, SPY: Rf },
    factorReturns: { MARKET: Rf },
    factor: "MARKET" as const,
    sleeve: ["A", "B"],
    forecast: { A: 0.02, B: -0.01, SPY: 0.01 },
  };
  const limits: HedgeLimitContext = { ...ctx, holdings: {} };

  it("reports before and after risk of selling $1M of SPY (python reference)", () => {
    const r = simulateHedges({ book, prices: ctx.prices, orders: [{ symbol: "SPY", side: "sell", quantity: 2000 }], limits });
    expect(r.grossNotional).toBe(1_000_000);
    expect(r.violations).toEqual([]);
    expect(r.before.var1d.var95).toBeCloseTo(70518.8047, 3);
    expect(r.before.sleeveBeta).toBeCloseTo(0.42147359, 7);
    expect(r.before.scenarioPnl).toBeCloseTo(81407.3752, 3);
    expect(r.after.var1d.var95).toBeCloseTo(55630.7443, 3);
    expect(r.after.var5d.var95).toBeCloseTo(23844.09998, 3);
    expect(r.after.sleeveBeta).toBeCloseTo(0.32147359, 7); // minus 0.1 x beta(SPY on MARKET) = 1
    expect(r.after.scenarioPnl).toBeCloseTo(71357.208, 3);
  });
  it("lowers the sleeve beta and VaR when the hedge is the right sign", () => {
    const r = simulateHedges({ book, prices: ctx.prices, orders: [{ symbol: "SPY", side: "sell", quantity: 2000 }], limits });
    expect(r.after.sleeveBeta).toBeLessThan(r.before.sleeveBeta);
    expect(r.after.var1d.var95).toBeLessThan(r.before.var1d.var95);
  });
  it("returns the violations of the plan without refusing to simulate it", () => {
    const r = simulateHedges({ book, prices: ctx.prices, orders: [{ symbol: "SPY", side: "sell", quantity: 2001 }], limits });
    expect(r.violations.map((v) => v.rule)).toEqual(["single_action"]);
    expect(r.after.sleeveBeta).toBeLessThan(r.before.sleeveBeta);
  });
  it("with no orders after equals before", () => {
    const r = simulateHedges({ book, prices: ctx.prices, orders: [], limits });
    expect(r.after).toEqual(r.before);
    expect(r.grossNotional).toBe(0);
  });
  it("buying adds to a position and does not touch the input book", () => {
    const before = JSON.stringify(book);
    const r = simulateHedges({ book, prices: ctx.prices, orders: [{ symbol: "SPY", side: "buy", quantity: 2000 }], limits });
    expect(r.after.sleeveBeta).toBeCloseTo(0.52147359, 7);
    expect(JSON.stringify(book)).toBe(before);
  });
});
