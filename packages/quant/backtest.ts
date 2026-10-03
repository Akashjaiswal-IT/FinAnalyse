import { DIRECTION_EPSILON, FORECAST_TARGETS, KNN_BANDWIDTH, MIN_TYPE_EVENTS, TYPE_WEIGHT } from "@repo/contracts";
import type { Backtest, BacktestMetrics, ForecastVariant, ModelKey } from "@repo/contracts";
import { fitScaler, kernelWeights, targetForecast, type KernelOptions, type PoolEvent } from "./forecast";
import { mean, spearman } from "./stats";

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

/**
 * Metrics of one set of (predicted, realized) pairs (SPEC 9.1). `n` counts every pair. Directional accuracy is
 * measured on the pairs whose realized move is at least `DIRECTION_EPSILON` (0.25%) in size; the others are
 * counted in `excludedSmallMoves`. A prediction of exactly 0 calls no direction and counts as a miss.
 */
export function computeMetrics(pairs: readonly { predicted: number; realized: number }[]): BacktestMetrics {
  const n = pairs.length;
  if (n === 0) return { directionalAccuracy: null, mae: null, spearman: null, n: 0, excludedSmallMoves: 0 };
  const moves = pairs.filter((p) => Math.abs(p.realized) >= DIRECTION_EPSILON);
  const hits = moves.filter((p) => p.predicted !== 0 && p.predicted > 0 === p.realized > 0).length;
  return {
    directionalAccuracy: moves.length > 0 ? hits / moves.length : null,
    mae: mean(pairs.map((p) => Math.abs(p.predicted - p.realized))),
    spearman: spearman(
      pairs.map((p) => p.predicted),
      pairs.map((p) => p.realized),
    ),
    n,
    excludedSmallMoves: n - moves.length,
  };
}

/** Leave-one-out predictions: each event is predicted from all the others (the scaler is refit without it). */
export function leaveOneOut(events: readonly PoolEvent[], options: BacktestOptions = {}): BacktestPrediction[] {
  const targets = options.targets ?? FORECAST_TARGETS;
  const models = options.models ?? MODEL_KEYS;
  const kernel: KernelOptions = { bandwidth: options.bandwidth, typeWeight: options.typeWeight };
  const sorted = [...events].sort((a, b) => a.id.localeCompare(b.id));
  const out: BacktestPrediction[] = [];
  for (const event of sorted) {
    const training = sorted.filter((e) => e.id !== event.id);
    const scaler = fitScaler(training);
    const query = { type: event.type, features: event.features };
    for (const model of models) {
      const weights = kernelWeights(query, training, MODEL_VARIANT[model], scaler, kernel);
      for (const target of targets) {
        out.push({
          eventId: event.id,
          eventType: event.type,
          target,
          model,
          predicted: targetForecast(weights, training, target)?.mean ?? null,
          realized: event.reactions[target]?.d5 ?? null,
        });
      }
    }
  }
  return out;
}

/**
 * Metrics keyed by target, `pooled` and `type:<eventType>`, per model. A type with fewer than `minTypeEvents`
 * events (default `MIN_TYPE_EVENTS`) keeps its n but no performance claim (SPEC 9.1).
 */
export function summarizePredictions(
  predictions: readonly BacktestPrediction[],
  minTypeEvents: number = MIN_TYPE_EVENTS,
): Backtest["metrics"] {
  const models = MODEL_KEYS.filter((m) => predictions.some((p) => p.model === m));
  const targets = [...new Set(predictions.map((p) => p.target))];
  const types = [...new Set(predictions.map((p) => p.eventType))].sort();
  const eventsOfType = (type: string) => new Set(predictions.filter((p) => p.eventType === type).map((p) => p.eventId)).size;

  const metricsFor = (select: (p: BacktestPrediction) => boolean, claim: boolean) => {
    const row: Partial<Record<ModelKey, BacktestMetrics>> = {};
    for (const model of models) {
      const pairs = predictions
        .filter((p) => p.model === model && select(p) && p.predicted !== null && p.realized !== null)
        .map((p) => ({ predicted: p.predicted as number, realized: p.realized as number }));
      const m = computeMetrics(pairs);
      row[model] = claim ? m : { ...m, directionalAccuracy: null, mae: null, spearman: null };
    }
    return row;
  };

  const out: Backtest["metrics"] = {};
  for (const target of targets) out[target] = metricsFor((p) => p.target === target, true);
  out.pooled = metricsFor(() => true, true);
  for (const type of types) out[`type:${type}`] = metricsFor((p) => p.eventType === type, eventsOfType(type) >= minTypeEvents);
  return out;
}

export type BacktestRun = Omit<Backtest, "id" | "createdAt">;

/** The full backtest: predictions, metrics, config and caveats. Deterministic. */
export function runBacktest(events: readonly PoolEvent[], options: BacktestOptions = {}): BacktestRun {
  const targets = options.targets ?? FORECAST_TARGETS;
  const predictions = leaveOneOut(events, options);
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
  const perType = [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([t, n]) => `${t} ${n}`).join(", ");
  const thin = [...counts].filter(([, n]) => n < MIN_TYPE_EVENTS).map(([t]) => t).sort();
  return {
    config: {
      bandwidth: options.bandwidth ?? KNN_BANDWIDTH,
      typeWeight: options.typeWeight ?? TYPE_WEIGHT,
      targets: [...targets],
    },
    metrics: summarizePredictions(predictions),
    predictions,
    caveats: [
      `Small samples: ${events.length} events (${perType}). Types with fewer than ${MIN_TYPE_EVENTS} events${thin.length > 0 ? ` (${thin.join(", ")})` : ""} carry no per-type claim.`,
      "Curated events were chosen with hindsight, because each is known to have moved markets (selection bias).",
      "Hurricane weather features use the best track, which is more accurate than the forecast available at the time.",
      "Leave-one-out also trains on events that happened after the one it predicts; it is not a walk-forward test.",
      "An event with no realized 5-day return for a target is left out of that target's metrics.",
    ],
  };
}
