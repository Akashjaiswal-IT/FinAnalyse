import type {
  AnalogEvent,
  EventFeatures,
  EventType,
  FeatureGroup,
  Forecast,
  ForecastVariant,
  TargetForecast,
} from "@repo/contracts";
import { notImplemented } from "./not-implemented";

/** The part of an analog event the forecast reads. A full `AnalogEvent` row fits. */
export type PoolEvent = Pick<AnalogEvent, "id" | "name" | "type" | "subtype" | "features" | "reactions">;

/** The event being forecast: its type and its features at `asOf`. */
export interface QueryEvent {
  type: EventType;
  features: EventFeatures;
}

/** Per-feature mean and standard deviation, fit on the pool (the training events). */
export interface FeatureScaler {
  mean: Partial<Record<keyof EventFeatures, number>>;
  std: Partial<Record<keyof EventFeatures, number>>;
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

/** The features of each distance group (the `type` group has none: it is an indicator). */
export const GROUP_FEATURES: Readonly<Record<Exclude<FeatureGroup, "type">, readonly (keyof EventFeatures)[]>> = {
  news: ["volZ", "toneZ"],
  regime: ["vixZ"],
  weather: ["windKt", "capAtRisk", "offshoreExposure"],
};

/** Groups a variant may use: C all four, S news, M regime, W weather, T and N none (plain means). */
export const variantGroups: (variant: ForecastVariant) => FeatureGroup[] = notImplemented("variantGroups");

/** Mean and sample std of each feature over the non-null values of `events`; std of 0 or undefined becomes 1. */
export const fitScaler: (events: readonly { features: EventFeatures }[]) => FeatureScaler = notImplemented("fitScaler");

export const standardize: (features: EventFeatures, scaler: FeatureScaler) => EventFeatures =
  notImplemented("standardize");

/**
 * Kernel weights of every pool event for `variant` (SPEC 5.9):
 * `d² = sum over shared groups of ||x - xj||² / number of groups`, `w = exp(-d² / (2h²))`.
 * The type group adds `typeWeight²` when types differ. Weather is used only when both events have all three
 * weather features. T and N give weight 1 (T: same type only). Events sharing no group get no entry.
 */
export const kernelWeights: (
  query: QueryEvent,
  pool: readonly PoolEvent[],
  variant: ForecastVariant,
  scaler: FeatureScaler,
  options?: KernelOptions,
) => AnalogWeight[] = notImplemented("kernelWeights");

/** Weighted mean, spread and count of the pool's `d5` log return for `symbol`; null when no analog has data. */
export const targetForecast: (
  weights: readonly AnalogWeight[],
  pool: readonly PoolEvent[],
  symbol: string,
) => TargetForecast | null = notImplemented("targetForecast");

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
export const buildForecast: (query: QueryEvent, pool: readonly PoolEvent[], options?: ForecastOptions) => ForecastResult =
  notImplemented("buildForecast");

/** Adds the Pinecone score of each analog (0 when Pinecone did not return it) and the news basis. */
export const withSimilarity: (
  result: ForecastResult,
  similarity: Readonly<Record<string, number>>,
  newsBasis: Forecast["newsBasis"],
) => Forecast = notImplemented("withSimilarity");

/**
 * Analogs that may be used at `asOf` (SPEC 5.1): the window must be fully realized, i.e. the close of
 * `realizedUntil` is readable (`barAvailableAt(realizedUntil) <= asOf`). `excludeId` drops the event itself.
 */
export const eligibleAnalogs: <T extends Pick<AnalogEvent, "id" | "realizedUntil">>(
  events: readonly T[],
  asOf: string,
  excludeId?: string,
) => T[] = notImplemented("eligibleAnalogs");
