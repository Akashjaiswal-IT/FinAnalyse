import type { EventFeatures, EventType, Reaction, Refinery, StormPoint } from "@repo/contracts";
import { notImplemented } from "./not-implemented";
import type { DatedValue } from "./series";
import type { TimelinePoint } from "./stats";

/** Inputs both builders need. All series are as downloaded: nothing after the event is filtered out here. */
export interface EventBuildBase {
  /** Adjusted closes per symbol (universe symbols and FRED factors), sorted by date. */
  closes: Readonly<Record<string, readonly DatedValue[]>>;
  /** FRED `VIXCLS`. */
  vix: readonly DatedValue[];
  /** GDELT `timelinevol` and `timelinetone` for the event's `gdeltQuery`. */
  volTimeline: readonly TimelinePoint[];
  toneTimeline: readonly TimelinePoint[];
  /** Series whose calendar defines t0 and `realizedUntil` (default `SPY`). */
  referenceSymbol?: string;
}

export interface BuiltEvent {
  /** End of the feature window (ISO). */
  featureAt: string;
  /** Forecast origin: last close readable at `featureAt` (YYYY-MM-DD). */
  t0: string;
  features: EventFeatures;
  /** d1, d5 and d20 log returns from t0 for every symbol in `closes`; null where data is missing. */
  reactions: Record<string, Reaction>;
  /** 20 trading days after t0 on the reference calendar; null when the data does not reach that far. */
  realizedUntil: string | null;
}

export interface CuratedEventInput extends EventBuildBase {
  /** ISO datetime; a date-only source uses 23:59 UTC that day (SPEC 10.5). */
  firstReportAt: string;
}

/**
 * Curated event (SPEC 5.9, 10.5): feature window = 24 hours after `firstReportAt`; `featureAt` = its end;
 * t0 = last close readable at `featureAt`; `volZ` and `toneZ` over the window against the 28 days before it;
 * `vixZ` at t0; no weather features.
 */
export const buildCuratedEvent: (input: CuratedEventInput) => BuiltEvent = notImplemented("buildCuratedEvent");

export interface HurricaneEventInput extends EventBuildBase {
  stormId: string;
  /** HURDAT2 name, upper case. */
  name: string;
  /** Observed best-track points of the storm, sorted by `validAt`. */
  points: readonly StormPoint[];
  refineries: readonly Refinery[];
}

export interface BuiltHurricane extends BuiltEvent {
  /** First point at tropical-storm strength (34 kt) or, failing that, the first point. */
  firstReportAt: string;
  landfallAt: string;
  landfallMethod: "hurdat2_record" | "closest_approach";
  /** Key of `LANDFALL_REGIONS` nearest to the landfall point. */
  region: string;
  gdeltQuery: string;
  /** Tickers of companies with capacity at risk. */
  entities: string[];
  companyCapAtRisk: Record<string, number>;
  landfallCategory: number;
  refineriesAtRisk: number;
  atRiskBpd: number;
  gulfShare: number;
}

/** `("Hurricane Ida" OR "Tropical Storm Ida")` from the HURDAT2 name. */
export const hurricaneGdeltQuery: (name: string) => string = notImplemented("hurricaneGdeltQuery");

/**
 * Hurricane (SPEC 5.9, 10.5): landfall by `findLandfall`; t0 = last close at least 24 hours before landfall;
 * `featureAt` = that close's availability time; news window = the 2 days before it; weather features from the
 * best track as a perfect forecast at `featureAt` (observed in the last 12 hours + the next 72 hours).
 * Null when the storm is not a Gulf hurricane or has no landfall.
 */
export const buildHurricaneEvent: (input: HurricaneEventInput) => BuiltHurricane | null =
  notImplemented("buildHurricaneEvent");

export interface DescribeInput {
  name: string;
  year: number;
  type: EventType;
  subtype: string | null;
  firstReportAt: string;
  entities: readonly string[];
  affectedSectors: readonly string[];
  reactions: Readonly<Record<string, Reaction>>;
  hurricane?: Pick<BuiltHurricane, "landfallCategory" | "region" | "refineriesAtRisk" | "atRiskBpd" | "gulfShare">;
}

/** The text embedded in Pinecone, from the fields by a template, never by an LLM (SPEC 10.5). */
export const describeEvent: (input: DescribeInput) => string = notImplemented("describeEvent");
