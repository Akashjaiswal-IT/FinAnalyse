import { z } from "zod";
import { IsoDate, IsoDateTime, Sector } from "./common";
import { EventType, NewsBasis } from "./event";

export const EventFeatures = z.object({
  volZ: z.number().nullable(),
  toneZ: z.number().nullable(),
  vixZ: z.number().nullable(),
  windKt: z.number().nullable(),
  capAtRisk: z.number().nullable(),
  offshoreExposure: z.number().nullable(),
});
export type EventFeatures = z.infer<typeof EventFeatures>;

export const FeatureName = z.enum(["volZ", "toneZ", "vixZ", "windKt", "capAtRisk", "offshoreExposure"]);
export type FeatureName = z.infer<typeof FeatureName>;

/** Distance groups of the grouped kNN (SPEC 5.9); `type` is an indicator, not a feature vector. */
export const FeatureGroup = z.enum(["type", "news", "regime", "weather"]);
export type FeatureGroup = z.infer<typeof FeatureGroup>;

/** Log returns from t0; null where data is missing. */
export const Reaction = z.object({
  d1: z.number().nullable(),
  d5: z.number().nullable(),
  d20: z.number().nullable(),
});
export type Reaction = z.infer<typeof Reaction>;

export const AnalogEvent = z.object({
  id: z.string().describe("slug, for example geopolitical-russia-ukraine-2022"),
  type: EventType,
  subtype: z.string().nullable(),
  name: z.string(),
  stormId: z.string().nullable(),
  firstReportAt: IsoDateTime,
  featureAt: IsoDateTime.describe("end of the feature window (SPEC 5.9)"),
  t0: IsoDate,
  landfallAt: IsoDateTime.nullable(),
  region: z.string().nullable(),
  entities: z.array(z.string()),
  affectedSectors: z.array(Sector),
  gdeltQuery: z.string(),
  features: EventFeatures,
  companyCapAtRisk: z.record(z.string(), z.number()).nullable(),
  reactions: z.record(z.string(), Reaction),
  realizedUntil: IsoDate,
  outageDays: z.number().nullable(),
  description: z.string(),
  sources: z.array(z.string()),
});
export type AnalogEvent = z.infer<typeof AnalogEvent>;

/** A hand-written row of data/seed/analog-events.json; the seed computes everything else (SPEC 10.5). */
export const CuratedEventSeed = z.object({
  id: z.string(),
  type: EventType,
  subtype: z.string().nullable(),
  name: z.string(),
  firstReportAt: IsoDateTime.describe("date-only sources use 23:59 UTC that day"),
  region: z.string().nullable(),
  entities: z.array(z.string()),
  affectedSectors: z.array(Sector),
  gdeltQuery: z.string(),
  sources: z.array(z.url()).min(1),
});
export type CuratedEventSeed = z.infer<typeof CuratedEventSeed>;

export const AnalogsListInput = z.object({ type: EventType.optional() });

/** Forecast variants (SPEC 5.9): C, T, S, M, W and N. Live runs use `combined`. */
export const ForecastVariant = z.enum(["combined", "type", "news", "regime", "weather", "unconditional"]);
export type ForecastVariant = z.infer<typeof ForecastVariant>;

export const AnalogMatch = z.object({
  eventId: z.string(),
  name: z.string(),
  type: EventType,
  similarity: z.number().describe("Pinecone score"),
  weight: z.number().describe("kernel weight"),
  realized: z.record(z.string(), Reaction),
});
export type AnalogMatch = z.infer<typeof AnalogMatch>;

export const TargetForecast = z.object({
  mean: z.number().describe("weighted mean 5-day log return"),
  spread: z.number().describe("weighted std"),
  n: z.number().int().describe("analogs with realized data"),
});
export type TargetForecast = z.infer<typeof TargetForecast>;

export const HoldingForecast = TargetForecast.extend({
  fallback: z.boolean().describe("true when fewer than 3 analogs had data: beta to SPY times the SPY forecast"),
});
export type HoldingForecast = z.infer<typeof HoldingForecast>;

export const Forecast = z.object({
  variant: ForecastVariant,
  groupsUsed: z.array(FeatureGroup),
  newsBasis: NewsBasis,
  bandwidth: z.number(),
  typeWeight: z.number(),
  effectiveN: z.number(),
  targets: z.record(z.string(), TargetForecast),
  holdings: z.record(z.string(), HoldingForecast),
  analogs: z.array(AnalogMatch),
});
export type Forecast = z.infer<typeof Forecast>;
