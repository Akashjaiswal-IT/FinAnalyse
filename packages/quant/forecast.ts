import {
  FORECAST_TARGETS,
  KNN_BANDWIDTH,
  MIN_ANALOGS_PER_HOLDING,
  TYPE_WEIGHT,
  barAvailableAt,
} from "@repo/contracts";
import type {
  AnalogEvent,
  EventFeatures,
  EventType,
  FeatureGroup,
  Forecast,
  ForecastVariant,
  HoldingForecast,
  TargetForecast,
} from "@repo/contracts";
import { effectiveSampleSize, mean, std, weightedMean, weightedStd } from "./stats";

/** The part of an analog event the forecast reads. A full `AnalogEvent` row fits. */
export type PoolEvent = Pick<AnalogEvent, "id" | "name" | "type" | "subtype" | "features" | "reactions">;

/** The event being forecast: its type and its features at `asOf`. */
export interface QueryEvent {
  type: EventType;
  features: EventFeatures;
}

type FeatureKey = keyof EventFeatures;

/** Per-feature mean and standard deviation, fit on the pool (the training events). */
export interface FeatureScaler {
  mean: Partial<Record<FeatureKey, number>>;
  std: Partial<Record<FeatureKey, number>>;
}

export interface KernelOptions {
  /** Defaults to `KNN_BANDWIDTH`. */
  bandwidth?: number;
  /** Defaults to `TYPE_WEIGHT`. */
  typeWeight?: number;
}

export interface AnalogWeight {
  id: string;
  /** Squared distance over the groups the pair shares, divided by their number (SPEC 5.9). */
  d2: number;
  weight: number;
  groups: FeatureGroup[];
}

const FEATURE_KEYS: readonly FeatureKey[] = ["volZ", "toneZ", "vixZ", "windKt", "capAtRisk", "offshoreExposure"];
const GROUP_ORDER: readonly FeatureGroup[] = ["type", "news", "regime", "weather"];

/** The features of each distance group (the `type` group has none: it is an indicator). */
export const GROUP_FEATURES: Readonly<Record<Exclude<FeatureGroup, "type">, readonly FeatureKey[]>> = {
  news: ["volZ", "toneZ"],
  regime: ["vixZ"],
  weather: ["windKt", "capAtRisk", "offshoreExposure"],
};

/** Groups a variant may use: C all four, S news, M regime, W weather, T and N none (plain means). */
export function variantGroups(variant: ForecastVariant): FeatureGroup[] {
  switch (variant) {
    case "combined":
      return ["type", "news", "regime", "weather"];
    case "news":
      return ["news"];
    case "regime":
      return ["regime"];
    case "weather":
      return ["weather"];
    case "type":
    case "unconditional":
      return [];
  }
}

/** Mean and sample std of each feature over the non-null values of `events`; std of 0 or undefined becomes 1. */
export function fitScaler(events: readonly { features: EventFeatures }[]): FeatureScaler {
  const scaler: FeatureScaler = { mean: {}, std: {} };
  for (const key of FEATURE_KEYS) {
    const values = events.map((e) => e.features[key]).filter((v): v is number => v !== null && Number.isFinite(v));
    if (values.length === 0) continue;
    const spread = values.length > 1 ? std(values) : 0;
    scaler.mean[key] = mean(values);
    scaler.std[key] = spread > 0 ? spread : 1;
  }
  return scaler;
}

/** `(v - mean) / std` per feature; a feature the scaler never saw becomes null. */
export function standardize(features: EventFeatures, scaler: FeatureScaler): EventFeatures {
  const out = { ...features };
  for (const key of FEATURE_KEYS) {
    const v = features[key];
    const m = scaler.mean[key];
    const s = scaler.std[key];
    out[key] = v === null || m === undefined || s === undefined ? null : (v - m) / s;
  }
  return out;
}

function groupDistance(group: Exclude<FeatureGroup, "type">, a: EventFeatures, b: EventFeatures): number | null {
  let sum = 0;
  for (const key of GROUP_FEATURES[group]) {
    const x = a[key];
    const y = b[key];
    if (x === null || y === null) return null;
    sum += (x - y) ** 2;
  }
  return sum;
}

/**
 * Kernel weights of every pool event for `variant` (SPEC 5.9):
 * `d² = sum over shared groups of ||x - xj||² / number of groups`, `w = exp(-d² / (2h²))`.
 * The type group adds `typeWeight²` when types differ. Weather is used only when both events have all three
 * weather features. T and N give weight 1 (T: same type only). Events sharing no group get no entry.
 */
export function kernelWeights(
  query: QueryEvent,
  pool: readonly PoolEvent[],
  variant: ForecastVariant,
  scaler: FeatureScaler,
  options: KernelOptions = {},
): AnalogWeight[] {
  const h = options.bandwidth ?? KNN_BANDWIDTH;
  const typeWeight = options.typeWeight ?? TYPE_WEIGHT;
  if (!(h > 0)) throw new RangeError(`bandwidth must be positive, got ${h}`);

  if (variant === "unconditional") return pool.map((e) => ({ id: e.id, d2: 0, weight: 1, groups: [] }));
  if (variant === "type") {
    return pool.filter((e) => e.type === query.type).map((e) => ({ id: e.id, d2: 0, weight: 1, groups: [] }));
  }

  const wanted = variantGroups(variant);
  const q = standardize(query.features, scaler);
  const out: AnalogWeight[] = [];
  for (const event of pool) {
    const e = standardize(event.features, scaler);
    const groups: FeatureGroup[] = [];
    let total = 0;
    for (const group of wanted) {
      if (group === "type") {
        groups.push(group);
        if (event.type !== query.type) total += typeWeight ** 2;
        continue;
      }
      const d = groupDistance(group, q, e);
      if (d === null) continue;
      groups.push(group);
      total += d;
    }
    if (groups.length === 0) continue;
    const d2 = total / groups.length;
    out.push({ id: event.id, d2, weight: Math.exp(-d2 / (2 * h * h)), groups });
  }
  return out;
}

/** Weighted mean, spread and count of the pool's `d5` log return for `symbol`; null when no analog has data. */
export function targetForecast(
  weights: readonly AnalogWeight[],
  pool: readonly PoolEvent[],
  symbol: string,
): TargetForecast | null {
  const byId = new Map(pool.map((e) => [e.id, e] as const));
  const values: number[] = [];
  const ws: number[] = [];
  for (const w of weights) {
    const d5 = byId.get(w.id)?.reactions[symbol]?.d5;
    if (d5 === null || d5 === undefined || !(w.weight > 0)) continue;
    values.push(d5);
    ws.push(w.weight);
  }
  if (values.length === 0) return null;
  return { mean: weightedMean(values, ws), spread: weightedStd(values, ws), n: values.length };
}

export interface ForecastOptions extends KernelOptions {
  variant?: ForecastVariant;
  /** Defaults to `FORECAST_TARGETS`. */
  targets?: readonly string[];
  /** Holdings to forecast. */
  holdings?: readonly string[];
  /** OLS beta of each holding to SPY, for the fewer-than-3-analogs fallback. */
  betaToSpy?: Readonly<Record<string, number>>;
  /** Analogs listed in the result, by weight (default 6). */
  topAnalogs?: number;
}

/** A `Forecast` whose analogs carry no Pinecone similarity yet (attach it with `withSimilarity`). */
export type ForecastResult = Omit<Forecast, "analogs" | "newsBasis"> & {
  analogs: Omit<Forecast["analogs"][number], "similarity">[];
};

/**
 * The forecast for one event over a pool of eligible analogs: weighted mean and spread of the 5-day log return
 * per target and per holding, the effective sample size and the top analogs. Holdings with fewer than
 * `MIN_ANALOGS_PER_HOLDING` analogs use `betaToSpy` times the SPY forecast and say so (`fallback`).
 */
export function buildForecast(
  query: QueryEvent,
  pool: readonly PoolEvent[],
  options: ForecastOptions = {},
): ForecastResult {
  const variant = options.variant ?? "combined";
  const targets = options.targets ?? FORECAST_TARGETS;
  const holdings = options.holdings ?? [];
  const bandwidth = options.bandwidth ?? KNN_BANDWIDTH;
  const typeWeight = options.typeWeight ?? TYPE_WEIGHT;
  const weights = kernelWeights(query, pool, variant, fitScaler(pool), { bandwidth, typeWeight });

  const targetResults: Record<string, TargetForecast> = {};
  for (const symbol of targets) {
    const f = targetForecast(weights, pool, symbol);
    if (f) targetResults[symbol] = f;
  }

  const spy = targetForecast(weights, pool, "SPY");
  const holdingResults: Record<string, HoldingForecast> = {};
  for (const symbol of holdings) {
    const f = targetForecast(weights, pool, symbol);
    if (f && f.n >= MIN_ANALOGS_PER_HOLDING) {
      holdingResults[symbol] = { ...f, fallback: false };
      continue;
    }
    const beta = options.betaToSpy?.[symbol];
    if (beta !== undefined && spy) {
      holdingResults[symbol] = { mean: beta * spy.mean, spread: Math.abs(beta) * spy.spread, n: spy.n, fallback: true };
    }
  }

  const used = new Set(weights.flatMap((w) => w.groups));
  const symbols = [...new Set([...targets, ...holdings])];
  const byId = new Map(pool.map((e) => [e.id, e] as const));
  const top = [...weights]
    .sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id))
    .slice(0, options.topAnalogs ?? 6)
    .map((w) => {
      const event = byId.get(w.id) as PoolEvent;
      return {
        eventId: event.id,
        name: event.name,
        type: event.type,
        weight: w.weight,
        realized: Object.fromEntries(symbols.flatMap((s) => (event.reactions[s] ? [[s, event.reactions[s]]] : []))),
      };
    });

  return {
    variant,
    groupsUsed: GROUP_ORDER.filter((g) => used.has(g)),
    bandwidth,
    typeWeight,
    effectiveN: effectiveSampleSize(weights.map((w) => w.weight)),
    targets: targetResults,
    holdings: holdingResults,
    analogs: top,
  };
}

/** Adds the Pinecone score of each analog (0 when Pinecone did not return it) and the news basis. */
export function withSimilarity(
  result: ForecastResult,
  similarity: Readonly<Record<string, number>>,
  newsBasis: Forecast["newsBasis"],
): Forecast {
  return {
    ...result,
    newsBasis,
    analogs: result.analogs.map((a) => ({ ...a, similarity: similarity[a.eventId] ?? 0 })),
  };
}

/**
 * Analogs that may be used at `asOf` (SPEC 5.1): the window must be fully realized, i.e. the close of
 * `realizedUntil` is readable (`barAvailableAt(realizedUntil) <= asOf`). `excludeId` drops the event itself.
 */
export function eligibleAnalogs<T extends Pick<AnalogEvent, "id" | "realizedUntil">>(
  events: readonly T[],
  asOf: string,
  excludeId?: string,
): T[] {
  const limit = Date.parse(asOf);
  return events.filter((e) => e.id !== excludeId && barAvailableAt(e.realizedUntil).getTime() <= limit);
}
