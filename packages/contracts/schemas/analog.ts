import { z } from "zod";
import { IsoDate, IsoDateTime } from "./common";

export const AnalogKind = z.enum([
  "hurricane",
  "winter_storm",
  "supply_shock",
  "geopolitical",
  "macro",
]);
export type AnalogKind = z.infer<typeof AnalogKind>;

export const EventFeatures = z.object({
  windKt: z.number().nullable(),
  capAtRisk: z.number().nullable(),
  offshoreExposure: z.number().nullable(),
  toneZ: z.number().nullable(),
  volZ: z.number().nullable(),
});
export type EventFeatures = z.infer<typeof EventFeatures>;

export const FeatureName = z.enum(["windKt", "capAtRisk", "offshoreExposure", "toneZ", "volZ"]);
export type FeatureName = z.infer<typeof FeatureName>;

/** Log returns from t0; null where data is missing. */
export const Reaction = z.object({
  d1: z.number().nullable(),
  d5: z.number().nullable(),
  d20: z.number().nullable(),
});
export type Reaction = z.infer<typeof Reaction>;

export const AnalogEvent = z.object({
  id: z.string().describe("slug, for example hurricane-ida-2021"),
  kind: AnalogKind,
  name: z.string(),
  stormId: z.string().nullable(),
  t0: IsoDate,
  landfallAt: IsoDateTime.nullable(),
  region: z.string().nullable(),
  features: EventFeatures,
  companyCapAtRisk: z.record(z.string(), z.number()).nullable(),
  reactions: z.record(z.string(), Reaction),
  realizedUntil: IsoDate,
  outageDays: z.number().nullable(),
  description: z.string(),
  sources: z.array(z.string()),
});
export type AnalogEvent = z.infer<typeof AnalogEvent>;

export const AnalogsListInput = z.object({ kind: AnalogKind.optional() });

export const FeatureSet = z.enum(["combined", "weather", "sentiment"]);
export type FeatureSet = z.infer<typeof FeatureSet>;

export const AnalogMatch = z.object({
  eventId: z.string(),
  name: z.string(),
  similarity: z.number().describe("Pinecone score"),
  weight: z.number().describe("kernel weight"),
  realized: z.record(z.string(), Reaction),
});
export type AnalogMatch = z.infer<typeof AnalogMatch>;

export const TargetForecast = z.object({
  mean: z.number().describe("weighted mean 5-day log return"),
  spread: z.number().describe("weighted std"),
});
export type TargetForecast = z.infer<typeof TargetForecast>;

export const Forecast = z.object({
  featureSet: FeatureSet,
  bandwidth: z.number(),
  effectiveN: z.number(),
  targets: z.record(z.string(), TargetForecast),
  analogs: z.array(AnalogMatch),
});
export type Forecast = z.infer<typeof Forecast>;
