import type {
  ExposureChannel,
  FactorExposure,
  FactorName,
  HoldingExposure,
  RiskSnapshot,
  Sector,
} from "@repo/contracts";
import { notImplemented } from "./not-implemented";

/** Aligned daily log returns per symbol, oldest first, all of equal length (`alignedLogReturns`). */
export type ReturnsBySymbol = Readonly<Record<string, readonly number[]>>;

/** Market value per symbol in USD; negative for shorts. */
export type Values = Readonly<Record<string, number>>;

export type VarCvarValue = RiskSnapshot["var1d"];

/**
 * Historical-simulation P&L series of today's `values`: for each past day (or overlapping `horizonDays` window,
 * from sums of daily log returns) `sum value * (e^r - 1)` (SPEC 5.10).
 */
export const historicalPnl: (values: Values, returns: ReturnsBySymbol, horizonDays?: number) => number[] =
  notImplemented("historicalPnl");

/**
 * Discrete historical VaR and CVaR as positive losses: with `k = ceil(n (1 - confidence))`, VaR is the k-th
 * smallest P&L negated and CVaR the mean of the k smallest negated.
 */
export const varCvar: (pnl: readonly number[], confidence?: number) => VarCvarValue = notImplemented("varCvar");

/** VaR and CVaR of today's positions over the past returns. */
export const portfolioVarCvar: (
  values: Values,
  returns: ReturnsBySymbol,
  horizonDays: number,
  confidence?: number,
) => VarCvarValue = notImplemented("portfolioVarCvar");

export interface ScenarioPnl {
  total: number;
  perHolding: { symbol: string; pnl: number }[];
}

/** `value * (e^r - 1)` per holding with `forecast[symbol]` the 5-day log return; throws on a missing forecast. */
export const scenarioPnl: (values: Values, forecast: Readonly<Record<string, number>>) => ScenarioPnl =
  notImplemented("scenarioPnl");

/** Scenario P&L per sector; holdings with no sector are left out. Sorted by sector name. */
export const pnlBySector: (
  perHolding: readonly { symbol: string; pnl: number }[],
  sectorOf: Readonly<Record<string, Sector | null | undefined>>,
) => { sector: Sector; pnl: number }[] = notImplemented("pnlBySector");

/**
 * Scenario P&L per channel, each exposed holding counted once under its primary channel (direct, peer, factor),
 * so the three rows sum to the exposed holdings' P&L. All three channels are listed.
 */
export const pnlByChannel: (
  perHolding: readonly { symbol: string; pnl: number }[],
  exposures: readonly HoldingExposure[],
) => { channel: ExposureChannel; pnl: number }[] = notImplemented("pnlByChannel");

export interface AnalogOutcome {
  weight: number;
  /** Realized 5-day log return per symbol; null or missing when the analog has no data for it. */
  returns: Readonly<Record<string, number | null | undefined>>;
}

export interface AnalogPnl {
  weightedMean: number;
  worst: number;
  n: number;
}

/**
 * P&L of today's positions replayed through each analog's realized returns (SPEC 5.10). Only analogs with a
 * return for every held symbol count. Null when none does.
 */
export const analogReplayPnl: (values: Values, analogs: readonly AnalogOutcome[]) => AnalogPnl | null =
  notImplemented("analogReplayPnl");

/** OLS beta and R² of every holding on every factor in `factorReturns` (pairs with no fit are left out). */
export const factorExposures: (
  holdingReturns: ReturnsBySymbol,
  factorReturns: Readonly<Partial<Record<FactorName, readonly number[]>>>,
) => FactorExposure[] = notImplemented("factorExposures");

/** `sum value / nav * beta` of the holdings in `exposures` to one factor. */
export const portfolioFactorBeta: (
  values: Values,
  nav: number,
  exposures: readonly FactorExposure[],
  factor: FactorName,
) => number = notImplemented("portfolioFactorBeta");

/** The `n` factors with the largest absolute portfolio beta, largest first (default 3). */
export const topFactorExposures: (
  values: Values,
  nav: number,
  exposures: readonly FactorExposure[],
  n?: number,
) => { factor: FactorName; beta: number }[] = notImplemented("topFactorExposures");

export interface RiskSnapshotInput {
  nav: number;
  /** Positions after any hedge trades (hedge ETFs included, shorts negative). */
  values: Values;
  returns: ReturnsBySymbol;
  factorReturns: Readonly<Partial<Record<FactorName, readonly number[]>>>;
  /** The factor the sleeve beta is measured against; keep it fixed between before and after. */
  factor: FactorName;
  /** Symbols counted in the sleeve beta (the exposed sleeve plus hedge ETFs). */
  sleeve: readonly string[];
  /** 5-day log return forecast per symbol, for the scenario P&L. */
  forecast: Readonly<Record<string, number>>;
  confidence?: number;
}

/** VaR/CVaR (1 and 5 days), sleeve beta and scenario P&L of one book (`before` and `after` of a hedge plan). */
export const riskSnapshot: (input: RiskSnapshotInput) => RiskSnapshot = notImplemented("riskSnapshot");
