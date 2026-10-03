import type { EventType, FactorDirectionEntry, MarketEventStatus, Severity } from "@repo/contracts";
import { notImplemented } from "./not-implemented";

/** A scored news item as clustering sees it (SPEC 5.14). */
export interface DetectItem {
  id: string;
  title: string;
  domain: string | null;
  eventType: EventType;
  tickers: readonly string[];
  peerTickers: readonly string[];
  relevance: number;
  /** ISO datetime. */
  publishedAt: string;
  factorDirections: readonly FactorDirectionEntry[];
}

export interface DetectedCluster {
  /** Item ids, oldest first. */
  itemIds: string[];
  type: EventType;
  /** Title of the earliest item. */
  title: string;
  articleCount: number;
  domainCount: number;
  /** Union of the items' tickers (not peer tickers), sorted. */
  entities: string[];
  /** Majority vote per factor; a tie is `unclear`. */
  factorDirections: FactorDirectionEntry[];
  firstSeenAt: string;
  lastSeenAt: string;
  /** Up to five item ids by relevance, highest first. */
  topNewsIds: string[];
}

/** Lower-case words of a title without stopwords and one-letter tokens. */
export const titleTokens: (title: string) => Set<string> = notImplemented("titleTokens");

export const jaccard: (a: ReadonlySet<string>, b: ReadonlySet<string>) => number = notImplemented("jaccard");

/** Same type and either a shared ticker (`tickers` or `peerTickers`) or title Jaccard of at least `DETECT_JACCARD`. */
export const sameStory: (a: DetectItem, b: DetectItem) => boolean = notImplemented("sameStory");

/**
 * Connected groups of items under `sameStory`, keeping only items with relevance of at least
 * `DETECT_MIN_RELEVANCE` published in the `DETECT_WINDOW_HOURS` before `now`. Every group is returned, big or
 * small; `isEvent` decides which count. No API calls, no clock: `now` is an argument.
 */
export const clusterNews: (items: readonly DetectItem[], now: string) => DetectedCluster[] = notImplemented("clusterNews");

/** At least `DETECT_MIN_ARTICLES` items from at least `DETECT_MIN_DOMAINS` domains. */
export const isEvent: (cluster: Pick<DetectedCluster, "articleCount" | "domainCount">) => boolean =
  notImplemented("isEvent");

/** Low below `SEVERITY_BOUNDS.medium`, high from `SEVERITY_BOUNDS.high`; `low` when `volZ` is null. */
export const severityFromVolZ: (volZ: number | null) => Severity = notImplemented("severityFromVolZ");

/** z-score of today's article count against the daily counts of the same type over the previous days. */
export const clusterZ: (count24h: number, dailyCounts: readonly number[]) => number | null = notImplemented("clusterZ");

export interface ActiveEventRef {
  id: string;
  type: EventType;
  title: string;
  entities: readonly string[];
}

/** The active event a cluster updates: same type and a shared entity or title Jaccard of at least `DETECT_JACCARD`. */
export const matchActiveEvent: (cluster: DetectedCluster, active: readonly ActiveEventRef[]) => string | null =
  notImplemented("matchActiveEvent");

/** `active` while the last item is at most `EVENT_FADE_HOURS` old at `now`, else `faded`. */
export const eventStatus: (lastSeenAt: string, now: string) => MarketEventStatus = notImplemented("eventStatus");
