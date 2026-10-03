import type { LimitViolation, RiskSnapshot } from "@repo/contracts";
import { HEDGE_LIMITS } from "@repo/contracts";
import { notImplemented } from "./not-implemented";
import type { RiskSnapshotInput } from "./risk";

export interface HedgeOrder {
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
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
  limits?: typeof HEDGE_LIMITS;
}

export const orderNotional: (order: HedgeOrder, prices: Readonly<Record<string, number>>) => number =
  notImplemented("orderNotional");

/**
 * Checks SPEC 5.11: gross notional, single action, ADV, integer quantity above zero, menu (new positions only
 * in menu ETFs; sells of other holdings may not exceed the quantity held) and universe.
 */
export const checkHedgeLimits: (orders: readonly HedgeOrder[], ctx: HedgeLimitContext) => LimitViolation[] =
  notImplemented("checkHedgeLimits");

/**
 * Largest integer quantity of one more order in `symbol` that keeps every limit, given the gross notional
 * already used. 0 when nothing fits.
 */
export const maxOrderQuantity: (symbol: string, ctx: HedgeLimitContext, usedGrossNotional: number) => number =
  notImplemented("maxOrderQuantity");

/** `cov(sleeve, etf) / var(etf)`: USD of ETF per unit of sleeve exposure that minimises variance; null if undefined. */
export const minVarianceHedgeRatio: (sleevePnl: readonly number[], etfReturns: readonly number[]) => number | null =
  notImplemented("minVarianceHedgeRatio");

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
export const suggestHedges: (
  sleevePnl: readonly number[],
  etfReturns: Readonly<Record<string, readonly number[]>>,
  ctx: HedgeLimitContext,
) => HedgeSuggestion[] = notImplemented("suggestHedges");

/** The single-order fallback plan: the best-fit suggestion with a non-zero quantity, or null. */
export const fallbackHedge: (suggestions: readonly HedgeSuggestion[]) => HedgeOrder | null =
  notImplemented("fallbackHedge");

/** Quantities after the orders (buy adds, sell subtracts; a sell beyond the position goes short). */
export const applyOrders: (
  quantities: Readonly<Record<string, number>>,
  orders: readonly HedgeOrder[],
) => Record<string, number> = notImplemented("applyOrders");

export interface SimulateHedgesInput {
  /** `values` and the rest are for the book BEFORE the orders; prices turn the orders into value changes. */
  book: RiskSnapshotInput;
  quantities: Readonly<Record<string, number>>;
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
export const simulateHedges: (input: SimulateHedgesInput) => SimulateHedgesResult = notImplemented("simulateHedges");
