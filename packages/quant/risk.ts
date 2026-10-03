import { FactorName, VAR_CONFIDENCE } from "@repo/contracts";
import type {
  ExposureChannel,
  FactorExposure,
  HoldingExposure,
  RiskSnapshot,
  Sector,
} from "@repo/contracts";
import { primaryChannel } from "./exposure";
import { rollingSums, simpleReturn } from "./series";
import { mean, ols } from "./stats";

/** Aligned daily log returns per symbol, oldest first, all of equal length (`alignedLogReturns`). */
export type ReturnsBySymbol = Readonly<Record<string, readonly number[]>>;

/** Market value per symbol in USD; negative for shorts. */
export type Values = Readonly<Record<string, number>>;

export type VarCvarValue = RiskSnapshot["var1d"];

const CHANNELS: readonly ExposureChannel[] = ["direct", "peer", "factor"];

/** Symbols that carry value; zero-value entries are ignored everywhere. */
function held(values: Values): string[] {
  return Object.keys(values).filter((s) => values[s] !== 0);
}

function column(returns: ReturnsBySymbol, symbol: string): readonly number[] {
  const col = returns[symbol];
  if (!col) throw new RangeError(`no returns for ${symbol}`);
  return col;
}

/**
 * Historical-simulation P&L series of today's `values`: for each past day (or overlapping `horizonDays` window,
 * from sums of daily log returns) `sum value * (e^r - 1)` (SPEC 5.10).
 */
export function historicalPnl(values: Values, returns: ReturnsBySymbol, horizonDays = 1): number[] {
  const symbols = held(values);
  if (symbols.length === 0) return [];
  const windows = symbols.map((s) => rollingSums(column(returns, s), horizonDays));
  const length = (windows[0] as number[]).length;
  if (windows.some((w) => w.length !== length)) throw new RangeError("return columns differ in length");
  const out: number[] = [];
  for (let t = 0; t < length; t++) {
    let pnl = 0;
    symbols.forEach((s, k) => {
      pnl += (values[s] as number) * simpleReturn((windows[k] as number[])[t] as number);
    });
    out.push(pnl);
  }
  return out;
}

/**
 * Discrete historical VaR and CVaR as positive losses: with `k = ceil(n (1 - confidence))`, VaR is the k-th
 * smallest P&L negated and CVaR the mean of the k smallest negated.
 */
export function varCvar(pnl: readonly number[], confidence = VAR_CONFIDENCE): VarCvarValue {
  if (pnl.length === 0) throw new RangeError("VaR needs at least one P&L observation");
  const k = Math.max(1, Math.ceil(pnl.length * (1 - confidence) - 1e-9));
  const sorted = [...pnl].sort((a, b) => a - b);
  return { var95: -(sorted[k - 1] as number), cvar95: -mean(sorted.slice(0, k)) };
}

/** VaR and CVaR of today's positions over the past returns. */
export function portfolioVarCvar(
  values: Values,
  returns: ReturnsBySymbol,
  horizonDays: number,
  confidence = VAR_CONFIDENCE,
): VarCvarValue {
  return varCvar(historicalPnl(values, returns, horizonDays), confidence);
}

export interface ScenarioPnl {
  total: number;
  perHolding: { symbol: string; pnl: number }[];
}

/** `value * (e^r - 1)` per holding with `forecast[symbol]` the 5-day log return; throws on a missing forecast. */
export function scenarioPnl(values: Values, forecast: Readonly<Record<string, number>>): ScenarioPnl {
  const perHolding = held(values).map((symbol) => {
    const f = forecast[symbol];
    if (f === undefined) throw new RangeError(`no forecast for ${symbol}`);
    return { symbol, pnl: (values[symbol] as number) * simpleReturn(f) };
  });
  return { total: perHolding.reduce((s, h) => s + h.pnl, 0), perHolding };
}

/** Scenario P&L per sector; holdings with no sector are left out. Sorted by sector name. */
export function pnlBySector(
  perHolding: readonly { symbol: string; pnl: number }[],
  sectorOf: Readonly<Record<string, Sector | null | undefined>>,
): { sector: Sector; pnl: number }[] {
  const sums = new Map<Sector, number>();
  for (const h of perHolding) {
    const sector = sectorOf[h.symbol];
    if (sector) sums.set(sector, (sums.get(sector) ?? 0) + h.pnl);
  }
  return [...sums].sort(([a], [b]) => a.localeCompare(b)).map(([sector, pnl]) => ({ sector, pnl }));
}

/**
 * Scenario P&L per channel, each exposed holding counted once under its primary channel (direct, peer, factor),
 * so the three rows sum to the exposed holdings' P&L. All three channels are listed.
 */
export function pnlByChannel(
  perHolding: readonly { symbol: string; pnl: number }[],
  exposures: readonly HoldingExposure[],
): { channel: ExposureChannel; pnl: number }[] {
  const channelOf = new Map(exposures.map((e) => [e.symbol, primaryChannel(e.channels)] as const));
  const sums = new Map<ExposureChannel, number>(CHANNELS.map((c) => [c, 0]));
  for (const h of perHolding) {
    const channel = channelOf.get(h.symbol);
    if (channel) sums.set(channel, (sums.get(channel) as number) + h.pnl);
  }
  return CHANNELS.map((channel) => ({ channel, pnl: sums.get(channel) as number }));
}

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
 * P&L of today's positions replayed through each analog's realized returns (SPEC 5.10). Only analogs with
 * positive weight and a return for every held symbol count. Null when none does.
 */
export function analogReplayPnl(values: Values, analogs: readonly AnalogOutcome[]): AnalogPnl | null {
  const symbols = held(values);
  const outcomes: { weight: number; pnl: number }[] = [];
  for (const a of analogs) {
    if (!(a.weight > 0)) continue;
    let pnl = 0;
    let complete = true;
    for (const s of symbols) {
      const r = a.returns[s];
      if (r === null || r === undefined) {
        complete = false;
        break;
      }
      pnl += (values[s] as number) * simpleReturn(r);
    }
    if (complete) outcomes.push({ weight: a.weight, pnl });
  }
  if (outcomes.length === 0) return null;
  const totalWeight = outcomes.reduce((s, o) => s + o.weight, 0);
  return {
    weightedMean: outcomes.reduce((s, o) => s + o.weight * o.pnl, 0) / totalWeight,
    worst: Math.min(...outcomes.map((o) => o.pnl)),
    n: outcomes.length,
  };
}

/** OLS beta and R² of every holding on every factor in `factorReturns` (pairs with no fit are left out). */
export function factorExposures(
  holdingReturns: ReturnsBySymbol,
  factorReturns: Readonly<Partial<Record<FactorName, readonly number[]>>>,
): FactorExposure[] {
  const out: FactorExposure[] = [];
  for (const holding of Object.keys(holdingReturns)) {
    for (const factor of FactorName.options) {
      const x = factorReturns[factor];
      if (!x) continue;
      const fit = ols(column(holdingReturns, holding), x);
      if (fit) out.push({ holding, factor, beta: fit.beta, r2: fit.r2 });
    }
  }
  return out;
}

/** `sum value / nav * beta` of the holdings in `exposures` to one factor; a holding with no fit counts as 0. */
export function portfolioFactorBeta(
  values: Values,
  nav: number,
  exposures: readonly FactorExposure[],
  factor: FactorName,
): number {
  let beta = 0;
  for (const e of exposures) {
    if (e.factor === factor) beta += ((values[e.holding] ?? 0) / nav) * e.beta;
  }
  return beta;
}

/** The `n` factors with the largest absolute portfolio beta, largest first (default 3). */
export function topFactorExposures(
  values: Values,
  nav: number,
  exposures: readonly FactorExposure[],
  n = 3,
): { factor: FactorName; beta: number }[] {
  const factors = [...new Set(exposures.map((e) => e.factor))];
  return factors
    .map((factor) => ({ factor, beta: portfolioFactorBeta(values, nav, exposures, factor) }))
    .sort((a, b) => Math.abs(b.beta) - Math.abs(a.beta) || a.factor.localeCompare(b.factor))
    .slice(0, n);
}

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
export function riskSnapshot(input: RiskSnapshotInput): RiskSnapshot {
  const { nav, values, returns, factorReturns, factor, sleeve, forecast, confidence } = input;
  const x = factorReturns[factor];
  if (!x) throw new RangeError(`no returns for factor ${factor}`);
  let sleeveBeta = 0;
  for (const symbol of sleeve) {
    const value = values[symbol] ?? 0;
    if (value === 0) continue;
    const fit = ols(column(returns, symbol), x);
    if (fit) sleeveBeta += (value / nav) * fit.beta;
  }
  return {
    var1d: portfolioVarCvar(values, returns, 1, confidence),
    var5d: portfolioVarCvar(values, returns, 5, confidence),
    sleeveBeta,
    scenarioPnl: scenarioPnl(values, forecast).total,
  };
}
