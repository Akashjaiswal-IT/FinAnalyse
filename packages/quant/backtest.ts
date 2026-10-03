import type { Backtest, BacktestMetrics, ForecastVariant, ModelKey } from "@repo/contracts";
import { notImplemented } from "./not-implemented";
import type { KernelOptions, PoolEvent } from "./forecast";

export const MODEL_VARIANT: Readonly<Record<ModelKey, ForecastVariant>> = {
  N: "unconditional",
  T: "type",
  S: "news",
  M: "regime",
  W: "weather",
  C: "combined",
};

export const MODEL_KEYS: readonly ModelKey[] = ["N", "T", "S", "M", "W", "C"];

export interface BacktestOptions extends KernelOptions {
  /** Defaults to `FORECAST_TARGETS`. */
  targets?: readonly string[];
  models?: readonly ModelKey[];
}

/** One leave-one-out prediction. `predicted` is null when the model cannot predict that event. */
export type BacktestPrediction = Backtest["predictions"][number];

/** Metrics of one set of (predicted, realized) pairs (SPEC 9.1). */
export const computeMetrics: (pairs: readonly { predicted: number; realized: number }[]) => BacktestMetrics =
  notImplemented("computeMetrics");

/** Leave-one-out predictions: each event is predicted from all the others (the scaler is refit without it). */
export const leaveOneOut: (events: readonly PoolEvent[], options?: BacktestOptions) => BacktestPrediction[] =
  notImplemented("leaveOneOut");

/**
 * Metrics keyed by target, `pooled` and `type:<eventType>`, per model. A type with fewer than
 * `MIN_TYPE_EVENTS` events keeps its n but no performance claim (SPEC 9.1).
 */
export const summarizePredictions: (
  predictions: readonly BacktestPrediction[],
  eventTypes: Readonly<Record<string, string>>,
) => Backtest["metrics"] = notImplemented("summarizePredictions");

export type BacktestRun = Omit<Backtest, "id" | "createdAt">;

/** The full backtest: predictions, metrics, config and caveats. Deterministic. */
export const runBacktest: (events: readonly PoolEvent[], options?: BacktestOptions) => BacktestRun =
  notImplemented("runBacktest");
