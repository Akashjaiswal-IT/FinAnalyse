import { HEDGE_LIMITS, HEDGE_MENU, UNIVERSE_SYMBOLS } from "@repo/contracts";
import type { LimitViolation, RiskSnapshot } from "@repo/contracts";
import { riskSnapshot, type RiskSnapshotInput } from "./risk";
import { ols } from "./stats";

export interface HedgeOrder {
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
}

export interface HedgeLimits {
  grossNotionalMaxPctNav: number;
  singleActionMaxPctNav: number;
  advMaxFraction: number;
}

export interface HedgeLimitContext {
  nav: number;
  /** Close at `asOf` per symbol. */
  prices: Readonly<Record<string, number>>;
  /** 20-day average dollar volume per symbol. */
  adv: Readonly<Record<string, number>>;
  /** Current quantity per symbol; a sell of a non-menu symbol may not exceed it. */
  holdings: Readonly<Record<string, number>>;
  /** Defaults to `HEDGE_MENU`, `UNIVERSE_SYMBOLS` and `HEDGE_LIMITS`. */
  menu?: readonly string[];
  universe?: readonly string[];
  limits?: HedgeLimits;
}

/** Slack for comparing notionals that were computed as quantity times price. */
const EPS = 1e-6;

export function orderNotional(order: HedgeOrder, prices: Readonly<Record<string, number>>): number {
  const price = prices[order.symbol];
  if (price === undefined) throw new RangeError(`no price for ${order.symbol}`);
  return order.quantity * price;
}

/**
 * Checks SPEC 5.11: gross notional, single action, ADV, integer quantity above zero, menu (new positions only
 * in menu ETFs; sells of other holdings may not exceed the quantity held) and universe.
 */
export function checkHedgeLimits(orders: readonly HedgeOrder[], ctx: HedgeLimitContext): LimitViolation[] {
  const menu = ctx.menu ?? HEDGE_MENU;
  const universe = ctx.universe ?? UNIVERSE_SYMBOLS;
  const limits = ctx.limits ?? HEDGE_LIMITS;
  const violations: LimitViolation[] = [];
  let gross = 0;

  for (const o of orders) {
    const say = (rule: LimitViolation["rule"], message: string) =>
      violations.push({ rule, symbol: o.symbol, message });

    if (!Number.isInteger(o.quantity) || o.quantity <= 0) {
      say("integer_quantity", `${o.symbol}: quantity must be a whole number above zero, got ${o.quantity}.`);
    }
    if (!universe.includes(o.symbol)) {
      say("universe", `${o.symbol} is not in the universe.`);
      continue;
    }
    const inMenu = menu.includes(o.symbol);
    if (o.side === "buy" && !inMenu) {
      say("menu", `${o.symbol} is not a menu ETF, so it cannot be bought.`);
    }
    if (o.side === "sell" && !inMenu && o.quantity > (ctx.holdings[o.symbol] ?? 0)) {
      say("menu", `${o.symbol} is not a menu ETF, so a sell may not exceed the ${ctx.holdings[o.symbol] ?? 0} held (no new shorts).`);
    }
    const price = ctx.prices[o.symbol];
    if (price === undefined) {
      say("universe", `No price for ${o.symbol}.`);
      continue;
    }
    const notional = o.quantity * price;
    gross += notional;
    if (notional > limits.singleActionMaxPctNav * ctx.nav + EPS) {
      say("single_action", `${o.symbol}: notional exceeds ${limits.singleActionMaxPctNav * 100}% of NAV.`);
    }
    const adv = ctx.adv[o.symbol];
    if (adv === undefined) {
      say("adv", `No average dollar volume for ${o.symbol}.`);
    } else if (notional > limits.advMaxFraction * adv + EPS) {
      say("adv", `${o.symbol}: notional exceeds ${limits.advMaxFraction * 100}% of 20-day average dollar volume.`);
    }
  }
  if (gross > limits.grossNotionalMaxPctNav * ctx.nav + EPS) {
    violations.push({
      rule: "gross_notional",
      symbol: null,
      message: `Gross hedge notional exceeds ${limits.grossNotionalMaxPctNav * 100}% of NAV.`,
    });
  }
  return violations;
}

/**
 * Largest integer quantity of one more order in `symbol` that keeps every limit, given the gross notional
 * already used. 0 when nothing fits.
 */
export function maxOrderQuantity(symbol: string, ctx: HedgeLimitContext, usedGrossNotional: number): number {
  const limits = ctx.limits ?? HEDGE_LIMITS;
  const price = ctx.prices[symbol];
  const adv = ctx.adv[symbol];
  if (price === undefined || adv === undefined || !(price > 0)) return 0;
  const cap = Math.min(
    limits.singleActionMaxPctNav * ctx.nav,
    limits.grossNotionalMaxPctNav * ctx.nav - usedGrossNotional,
    limits.advMaxFraction * adv,
  );
  return Math.max(0, Math.floor(cap / price));
}

/** `cov(sleeve, etf) / var(etf)`: USD of ETF per unit of sleeve exposure that minimises variance; null if undefined. */
export function minVarianceHedgeRatio(sleevePnl: readonly number[], etfReturns: readonly number[]): number | null {
  return ols(sleevePnl, etfReturns)?.beta ?? null;
}

export interface HedgeSuggestion {
  symbol: string;
  /** USD notional of the minimum-variance hedge: positive means sell the ETF, negative means buy it. */
  hedgeNotional: number;
  /** Squared correlation between the sleeve P&L and the ETF return: the variance share the hedge removes. */
  r2: number;
  side: "buy" | "sell";
  /** Integer quantity of the minimum-variance hedge, capped by the limits; 0 when nothing fits. */
  quantity: number;
}

/**
 * Minimum-variance hedge against the exposed sleeve for each menu ETF (SPEC 5.11), best fit first.
 * `sleevePnl` is the sleeve's historical P&L series and `etfReturns` the ETFs' simple returns on the same days.
 */
export function suggestHedges(
  sleevePnl: readonly number[],
  etfReturns: Readonly<Record<string, readonly number[]>>,
  ctx: HedgeLimitContext,
): HedgeSuggestion[] {
  const menu = ctx.menu ?? HEDGE_MENU;
  const out: HedgeSuggestion[] = [];
  for (const symbol of menu) {
    const returns = etfReturns[symbol];
    const price = ctx.prices[symbol];
    if (!returns || price === undefined || !(price > 0)) continue;
    const fit = ols(sleevePnl, returns);
    if (!fit) continue;
    const wanted = Math.floor(Math.abs(fit.beta) / price);
    out.push({
      symbol,
      hedgeNotional: fit.beta,
      r2: fit.r2,
      side: fit.beta >= 0 ? "sell" : "buy",
      quantity: Math.min(wanted, maxOrderQuantity(symbol, ctx, 0)),
    });
  }
  return out.sort((a, b) => b.r2 - a.r2 || a.symbol.localeCompare(b.symbol));
}

/**
 * The single-order fallback plan: the best-fit suggestion with a non-zero quantity, on the side its
 * minimum-variance ratio implies (normally a sell), or null.
 */
export function fallbackHedge(suggestions: readonly HedgeSuggestion[]): HedgeOrder | null {
  const best = suggestions.find((s) => s.quantity > 0);
  return best ? { symbol: best.symbol, side: best.side, quantity: best.quantity } : null;
}

/** Quantities after the orders (buy adds, sell subtracts; a sell beyond the position goes short). */
export function applyOrders(
  quantities: Readonly<Record<string, number>>,
  orders: readonly HedgeOrder[],
): Record<string, number> {
  const out: Record<string, number> = { ...quantities };
  for (const o of orders) out[o.symbol] = (out[o.symbol] ?? 0) + (o.side === "buy" ? o.quantity : -o.quantity);
  return out;
}

export interface SimulateHedgesInput {
  /** The book BEFORE the orders. `returns` and `forecast` must also cover every symbol the orders trade. */
  book: RiskSnapshotInput;
  prices: Readonly<Record<string, number>>;
  orders: readonly HedgeOrder[];
  limits: HedgeLimitContext;
}

export interface SimulateHedgesResult {
  before: RiskSnapshot;
  after: RiskSnapshot;
  grossNotional: number;
  violations: LimitViolation[];
}

/** Before and after risk of a hedge plan plus any limit violations (the `simulate_hedges` tool, SPEC 5.11). */
export function simulateHedges(input: SimulateHedgesInput): SimulateHedgesResult {
  const { book, prices, orders, limits } = input;
  const afterValues: Record<string, number> = { ...book.values };
  let grossNotional = 0;
  for (const o of orders) {
    const notional = orderNotional(o, prices);
    grossNotional += notional;
    afterValues[o.symbol] = (afterValues[o.symbol] ?? 0) + (o.side === "buy" ? notional : -notional);
  }
  const sleeve = [...new Set([...book.sleeve, ...orders.map((o) => o.symbol)])];
  return {
    before: riskSnapshot(book),
    after: riskSnapshot({ ...book, values: afterValues, sleeve }),
    grossNotional,
    violations: checkHedgeLimits(orders, limits),
  };
}
