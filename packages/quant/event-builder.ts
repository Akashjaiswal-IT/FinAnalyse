import {
  EVENT_FEATURE_WINDOW_HOURS,
  NEWS_BASELINE_DAYS,
  OFFSHORE_BOX,
  REPLAY_FORECAST_HOURS,
  VIX_Z_LOOKBACK_DAYS,
  barAvailableAt,
  formatValue,
} from "@repo/contracts";
import type { EventFeatures, EventType, Reaction, Refinery, StormPoint } from "@repo/contracts";
import {
  capacityAtRisk,
  findLandfall,
  hurricaneShareInBox,
  impactPoints,
  impactSourcePoints,
  interpolateTrack,
  isGulfHurricane,
  maxWindBetween,
  nearestLandfallRegion,
  refineriesAtRisk,
  saffirSimpsonCategory,
} from "./geo";
import { forwardLogReturn, lastIndexOnOrBefore, simpleReturn, tradingDateAfter, type DatedValue } from "./series";
import { trailingZ, windowZ, type TimelinePoint } from "./stats";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const TROPICAL_STORM_KT = 34;
/** Trading days that make up the realized window (SPEC 6: `realized_until` = t0 + 20 trading days). */
const REALIZED_DAYS = 20;
/** Hours before landfall that t0 must precede (SPEC 5.9). */
const HURRICANE_LEAD_HOURS = 24;
/** News window of a hurricane: the 2 days before its forecast origin (SPEC 5.9). */
const HURRICANE_NEWS_HOURS = 48;
/** A VIX observation older than this many days before t0 is not "VIX at t0". */
const VIX_MAX_GAP_DAYS = 5;

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

/** Latest date in `dates` (ascending) whose daily bar is readable at `instant` (SPEC 5.1). */
function lastReadableDate(dates: readonly string[], instant: number): string | null {
  let lo = 0;
  let hi = dates.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (barAvailableAt(dates[mid] as string).getTime() <= instant) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found < 0 ? null : (dates[found] as string);
}

function referenceDates(base: EventBuildBase): string[] {
  const symbol = base.referenceSymbol ?? "SPY";
  const series = base.closes[symbol];
  if (!series || series.length === 0) throw new RangeError(`no closes for the reference symbol ${symbol}`);
  return series.map((o) => o.date);
}

function reactionsAt(base: EventBuildBase, t0: string): Record<string, Reaction> {
  const out: Record<string, Reaction> = {};
  for (const [symbol, series] of Object.entries(base.closes)) {
    out[symbol] = {
      d1: forwardLogReturn(series, t0, 1),
      d5: forwardLogReturn(series, t0, 5),
      d20: forwardLogReturn(series, t0, 20),
    };
  }
  return out;
}

function vixZAt(vix: readonly DatedValue[], t0: string): number | null {
  const i = lastIndexOnOrBefore(vix, t0);
  if (i < 0) return null;
  const last = vix[i] as DatedValue;
  if ((Date.parse(t0) - Date.parse(last.date)) / DAY_MS > VIX_MAX_GAP_DAYS) return null;
  return trailingZ(
    vix.slice(0, i + 1).map((o) => o.value),
    VIX_Z_LOOKBACK_DAYS,
  );
}

function finish(
  base: EventBuildBase,
  dates: readonly string[],
  t0: string,
  featureAt: string,
  features: EventFeatures,
): BuiltEvent {
  return {
    featureAt,
    t0,
    features,
    reactions: reactionsAt(base, t0),
    realizedUntil: tradingDateAfter(dates, t0, REALIZED_DAYS),
  };
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
export function buildCuratedEvent(input: CuratedEventInput): BuiltEvent {
  const start = Date.parse(input.firstReportAt);
  const featureAt = new Date(start + EVENT_FEATURE_WINDOW_HOURS * HOUR_MS).toISOString();
  const dates = referenceDates(input);
  const t0 = lastReadableDate(dates, Date.parse(featureAt));
  if (t0 === null) throw new RangeError(`no close is readable at ${featureAt}`);
  return finish(input, dates, t0, featureAt, {
    volZ: windowZ(input.volTimeline, input.firstReportAt, featureAt, NEWS_BASELINE_DAYS),
    toneZ: windowZ(input.toneTimeline, input.firstReportAt, featureAt, NEWS_BASELINE_DAYS),
    vixZ: vixZAt(input.vix, t0),
    windKt: null,
    capAtRisk: null,
    offshoreExposure: null,
  });
}

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
export function hurricaneGdeltQuery(name: string): string {
  const title = name
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
  return `("Hurricane ${title}" OR "Tropical Storm ${title}")`;
}

/**
 * Hurricane (SPEC 5.9, 10.5): landfall by `findLandfall`; t0 = last close at least 24 hours before landfall;
 * `featureAt` = that close's availability time; news window = the 2 days before it; weather features from the
 * best track as a perfect forecast at `featureAt` (observed in the last 12 hours + the next 72 hours).
 * `offshoreExposure` is null when the track has no hurricane-force point in that window. Null when the storm
 * is not a Gulf hurricane or has no landfall.
 */
export function buildHurricaneEvent(input: HurricaneEventInput): BuiltHurricane | null {
  const observed = input.points
    .filter((p) => p.kind === "observed")
    .sort((a, b) => Date.parse(a.validAt) - Date.parse(b.validAt));
  if (observed.length === 0 || !isGulfHurricane(observed)) return null;
  const landfall = findLandfall(observed);
  if (!landfall) return null;

  const landfallMs = Date.parse(landfall.point.validAt);
  const dates = referenceDates(input);
  const t0 = lastReadableDate(dates, landfallMs - HURRICANE_LEAD_HOURS * HOUR_MS);
  if (t0 === null) return null;
  const featureAt = barAvailableAt(t0).toISOString();
  const asOf = Date.parse(featureAt);

  // The best track as a perfect forecast: what was observed by `featureAt`, then the next 72 hours as forecast.
  const horizon = asOf + REPLAY_FORECAST_HOURS * HOUR_MS;
  const track: StormPoint[] = observed.flatMap((p): StormPoint[] => {
    const t = Date.parse(p.validAt);
    if (t <= asOf) return [p];
    return t <= horizon ? [{ ...p, kind: "forecast" }] : [];
  });
  const source = impactSourcePoints(track, featureAt);
  const atRisk = refineriesAtRisk(input.refineries, impactPoints(source));
  const capacity = capacityAtRisk(input.refineries, atRisk);

  const newsStart = new Date(asOf - HURRICANE_NEWS_HOURS * HOUR_MS).toISOString();
  const features: EventFeatures = {
    volZ: windowZ(input.volTimeline, newsStart, featureAt, NEWS_BASELINE_DAYS),
    toneZ: windowZ(input.toneTimeline, newsStart, featureAt, NEWS_BASELINE_DAYS),
    vixZ: vixZAt(input.vix, t0),
    windKt: maxWindBetween(observed, new Date(landfallMs - 24 * HOUR_MS).toISOString(), landfall.point.validAt),
    capAtRisk: capacity.gulfShare,
    offshoreExposure: hurricaneShareInBox(interpolateTrack(source), OFFSHORE_BOX),
  };

  const first = observed.find((p) => p.windKt >= TROPICAL_STORM_KT) ?? (observed[0] as StormPoint);
  return {
    ...finish(input, dates, t0, featureAt, features),
    firstReportAt: first.validAt,
    landfallAt: landfall.point.validAt,
    landfallMethod: landfall.method,
    region: nearestLandfallRegion(landfall.point.lat, landfall.point.lon).region,
    gdeltQuery: hurricaneGdeltQuery(input.name),
    entities: Object.keys(capacity.company).sort(),
    companyCapAtRisk: capacity.company,
    landfallCategory: saffirSimpsonCategory(landfall.point.windKt),
    refineriesAtRisk: capacity.refineryCount,
    atRiskBpd: capacity.atRiskBpd,
    gulfShare: capacity.gulfShare,
  };
}

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

/** Sector ETFs that can be "the most-moved sector ETF" in a description. */
const SECTOR_ETFS = ["XLE", "XOP", "CRAK", "XLK", "XLF", "KRE", "ITA", "JETS", "XLP", "FXI", "DBA"] as const;

function moveText(reaction: Reaction | undefined): string {
  const d5 = reaction?.d5;
  return d5 === null || d5 === undefined ? "n/a" : formatValue("pct_signed", simpleReturn(d5));
}

/** The text embedded in Pinecone, from the fields by a template, never by an LLM (SPEC 10.5). */
export function describeEvent(input: DescribeInput): string {
  const { reactions } = input;
  const kind = input.subtype ? `${input.type} / ${input.subtype}` : input.type;
  const moved = SECTOR_ETFS.flatMap((symbol) => {
    const d5 = reactions[symbol]?.d5;
    return d5 === null || d5 === undefined ? [] : [{ symbol, d5 }];
  }).sort((a, b) => Math.abs(b.d5) - Math.abs(a.d5) || a.symbol.localeCompare(b.symbol))[0];

  const parts = [
    `${input.name} (${input.year}), ${kind}.`,
    `First reported ${formatValue("date", Date.parse(input.firstReportAt))}.`,
    `Directly involved: ${input.entities.length > 0 ? input.entities.join(", ") : "no listed company"}.`,
    `Sectors: ${input.affectedSectors.length > 0 ? input.affectedSectors.join(", ") : "none"}.`,
    `Five trading days later: S&P 500 ${moveText(reactions.SPY)}, WTI ${moveText(reactions.WTI)}, ` +
      `gold ${moveText(reactions.GLD)}, long Treasuries ${moveText(reactions.TLT)}` +
      (moved ? `, ${moved.symbol} ${moveText(reactions[moved.symbol])}.` : "."),
  ];
  if (input.hurricane) {
    const h = input.hurricane;
    parts.push(
      `Category ${formatValue("category", h.landfallCategory)} at landfall in ${h.region}. ` +
        `${h.refineriesAtRisk} refineries with ${formatValue("bpd", h.atRiskBpd)} ` +
        `(${formatValue("pct", h.gulfShare)} of Gulf Coast capacity) within 100 km of the hurricane-force track.`,
    );
  }
  return parts.join(" ");
}
