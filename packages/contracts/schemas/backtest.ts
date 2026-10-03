import { z } from "zod";
import { IsoDateTime } from "./common";
import { EventType } from "./event";

/** N unconditional, T type-only, S news-only, M regime-only, W weather-only, C combined (SPEC 5.9). */
export const ModelKey = z.enum(["N", "T", "S", "M", "W", "C"]);
export type ModelKey = z.infer<typeof ModelKey>;

export const BacktestMetrics = z.object({
  directionalAccuracy: z.number().nullable(),
  mae: z.number().nullable(),
  spearman: z.number().nullable(),
  n: z.number().int(),
  excludedSmallMoves: z.number().int(),
});
export type BacktestMetrics = z.infer<typeof BacktestMetrics>;

export const BacktestPrediction = z.object({
  eventId: z.string(),
  eventType: EventType,
  target: z.string(),
  model: ModelKey,
  predicted: z.number().nullable(),
  realized: z.number().nullable(),
});

export const Backtest = z.object({
  id: z.uuid(),
  createdAt: IsoDateTime,
  config: z.object({ bandwidth: z.number(), typeWeight: z.number(), targets: z.array(z.string()) }),
  metrics: z.record(z.string(), z.partialRecord(ModelKey, BacktestMetrics)).describe("target, `pooled` or `type:<eventType>` -> model -> metrics"),
  predictions: z.array(BacktestPrediction),
  caveats: z.array(z.string()),
});
export type Backtest = z.infer<typeof Backtest>;
