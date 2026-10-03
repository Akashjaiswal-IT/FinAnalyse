import { z } from "zod";
import { IsoDateTime } from "./common";

export const StormPointKind = z.enum(["observed", "forecast"]);

export const Storm = z.object({
  id: z.string().describe("uppercase, for example AL092021"),
  name: z.string(),
  season: z.number().int(),
  source: z.enum(["hurdat2", "nhc"]),
});
export type Storm = z.infer<typeof Storm>;

export const StormPoint = z.object({
  stormId: z.string(),
  kind: StormPointKind,
  issuedAt: IsoDateTime,
  validAt: IsoDateTime,
  lat: z.number(),
  lon: z.number().describe("west longitudes are negative"),
  windKt: z.number().int(),
  pressureMb: z.number().int().nullable(),
  status: z.string().nullable(),
  recordId: z.string().nullable().describe("HURDAT2 `L` marks landfall"),
});
export type StormPoint = z.infer<typeof StormPoint>;

export const Refinery = z.object({
  id: z.string(),
  name: z.string(),
  company: z.string(),
  ticker: z.string().nullable(),
  state: z.string(),
  padd: z.number().int(),
  lat: z.number(),
  lon: z.number(),
  capacityBpd: z.number().int(),
});
export type Refinery = z.infer<typeof Refinery>;

export const AtRiskRefinery = Refinery.extend({
  distanceKm: z.number().describe("to the nearest impact point"),
});
export type AtRiskRefinery = z.infer<typeof AtRiskRefinery>;

export const HypotheticalStormParams = z.object({
  category: z.number().int().min(1).max(5),
  region: z.string().describe("key of LANDFALL_REGIONS"),
  hoursToLandfall: z.number().positive().default(48),
});
export type HypotheticalStormParams = z.infer<typeof HypotheticalStormParams>;

export const TrackLabel = z.enum([
  "observed",
  "nhc_forecast",
  "persistence_forecast",
  "perfect_forecast_replay",
  "hypothetical",
]);
export type TrackLabel = z.infer<typeof TrackLabel>;

export const StormTrack = z.object({
  storm: Storm,
  asOf: IsoDateTime,
  points: z.array(StormPoint),
  forecastLabel: TrackLabel.nullable(),
  atRiskRefineries: z.array(AtRiskRefinery),
});
export type StormTrack = z.infer<typeof StormTrack>;

export const HubForecast = z.object({
  hub: z.string(),
  lat: z.number(),
  lon: z.number(),
  maxGustKmh: z.number(),
  maxPrecipMm: z.number(),
  hoursAhead: z.number(),
});
export type HubForecast = z.infer<typeof HubForecast>;

export const WeatherStormsInput = z.object({ asOf: IsoDateTime.optional() });
export const WeatherTrackInput = z.object({
  stormId: z.string(),
  asOf: IsoDateTime.optional(),
});
