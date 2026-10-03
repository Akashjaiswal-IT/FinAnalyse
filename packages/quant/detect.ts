import {
  DETECT_JACCARD,
  DETECT_MIN_ARTICLES,
  DETECT_MIN_DOMAINS,
  DETECT_MIN_RELEVANCE,
  DETECT_WINDOW_HOURS,
  EVENT_FADE_HOURS,
  FactorName,
  SEVERITY_BOUNDS,
} from "@repo/contracts";
import type { EventType, FactorDirection, FactorDirectionEntry, MarketEventStatus, Severity } from "@repo/contracts";
import { zScore } from "./stats";

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

const HOUR_MS = 3_600_000;
const TOP_NEWS = 5;

const STOPWORDS = new Set(
  (
    "a an the and or but of to in on for at by with from as is are was were be been it its this that these those " +
    "after before over under into about amid says say said will would could may might has have had not no than then " +
    "up down out off new more most as per via vs"
  ).split(" "),
);

/** Lower-case words of a title without stopwords and one-letter tokens. */
export function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 2 && !STOPWORDS.has(t)),
  );
}

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let shared = 0;
  for (const x of a) if (b.has(x)) shared++;
  return shared / (a.size + b.size - shared);
}

function tickersOf(item: DetectItem): Set<string> {
  return new Set([...item.tickers, ...item.peerTickers]);
}

/** Same type and either a shared ticker (`tickers` or `peerTickers`) or title Jaccard of at least `DETECT_JACCARD`. */
export function sameStory(a: DetectItem, b: DetectItem): boolean {
  if (a.eventType !== b.eventType) return false;
  const ta = tickersOf(a);
  for (const t of tickersOf(b)) if (ta.has(t)) return true;
  return jaccard(titleTokens(a.title), titleTokens(b.title)) >= DETECT_JACCARD;
}

function majority(votes: readonly FactorDirection[]): FactorDirection {
  const count: Record<FactorDirection, number> = { up: 0, down: 0, unclear: 0 };
  for (const v of votes) count[v]++;
  const ranked = (Object.entries(count) as [FactorDirection, number][]).sort((a, b) => b[1] - a[1]);
  const [first, second] = ranked as [[FactorDirection, number], [FactorDirection, number], ...unknown[]];
  return first[1] > second[1] ? first[0] : "unclear";
}

function summarize(items: readonly DetectItem[]): DetectedCluster {
  const sorted = [...items].sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt) || a.id.localeCompare(b.id));
  const first = sorted[0] as DetectItem;
  const last = sorted[sorted.length - 1] as DetectItem;
  const votes = new Map<FactorName, FactorDirection[]>();
  for (const item of sorted) {
    for (const f of item.factorDirections) votes.set(f.factor, [...(votes.get(f.factor) ?? []), f.direction]);
  }
  return {
    itemIds: sorted.map((i) => i.id),
    type: first.eventType,
    title: first.title,
    articleCount: sorted.length,
    domainCount: new Set(sorted.map((i) => i.domain).filter((d): d is string => d !== null)).size,
    entities: [...new Set(sorted.flatMap((i) => i.tickers))].sort(),
    factorDirections: FactorName.options
      .filter((factor) => votes.has(factor))
      .map((factor) => ({ factor, direction: majority(votes.get(factor) as FactorDirection[]) })),
    firstSeenAt: first.publishedAt,
    lastSeenAt: last.publishedAt,
    topNewsIds: [...sorted]
      .sort((a, b) => b.relevance - a.relevance || Date.parse(a.publishedAt) - Date.parse(b.publishedAt) || a.id.localeCompare(b.id))
      .slice(0, TOP_NEWS)
      .map((i) => i.id),
  };
}

/**
 * Connected groups of items under `sameStory`, keeping only items with relevance of at least
 * `DETECT_MIN_RELEVANCE` published in the `DETECT_WINDOW_HOURS` before `now`. Every group is returned, big or
 * small; `isEvent` decides which count. No API calls, no clock: `now` is an argument.
 */
export function clusterNews(items: readonly DetectItem[], now: string): DetectedCluster[] {
  const end = Date.parse(now);
  const start = end - DETECT_WINDOW_HOURS * HOUR_MS;
  const kept = items.filter((i) => {
    const t = Date.parse(i.publishedAt);
    return i.relevance >= DETECT_MIN_RELEVANCE && t >= start && t <= end;
  });

  const parent = kept.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root] as number;
    while (parent[i] !== root) {
      const next = parent[i] as number;
      parent[i] = root;
      i = next;
    }
    return root;
  };
  for (let i = 0; i < kept.length; i++) {
    for (let j = i + 1; j < kept.length; j++) {
      if (find(i) !== find(j) && sameStory(kept[i] as DetectItem, kept[j] as DetectItem)) parent[find(j)] = find(i);
    }
  }

  const groups = new Map<number, DetectItem[]>();
  kept.forEach((item, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), item]));
  return [...groups.values()]
    .map(summarize)
    .sort(
      (a, b) =>
        b.articleCount - a.articleCount ||
        Date.parse(a.firstSeenAt) - Date.parse(b.firstSeenAt) ||
        (a.itemIds[0] as string).localeCompare(b.itemIds[0] as string),
    );
}

/** At least `DETECT_MIN_ARTICLES` items from at least `DETECT_MIN_DOMAINS` domains. */
export function isEvent(cluster: Pick<DetectedCluster, "articleCount" | "domainCount">): boolean {
  return cluster.articleCount >= DETECT_MIN_ARTICLES && cluster.domainCount >= DETECT_MIN_DOMAINS;
}

/** Low below `SEVERITY_BOUNDS.medium`, high from `SEVERITY_BOUNDS.high`; `low` when `volZ` is null. */
export function severityFromVolZ(volZ: number | null): Severity {
  if (volZ === null) return "low";
  if (volZ >= SEVERITY_BOUNDS.high) return "high";
  if (volZ >= SEVERITY_BOUNDS.medium) return "medium";
  return "low";
}

/** z-score of today's article count against the daily counts of the same type over the previous days. */
export function clusterZ(count24h: number, dailyCounts: readonly number[]): number | null {
  return zScore(count24h, dailyCounts);
}

export interface ActiveEventRef {
  id: string;
  type: EventType;
  title: string;
  entities: readonly string[];
}

/**
 * The active event a cluster updates: same type and a shared entity or title Jaccard of at least `DETECT_JACCARD`.
 * The best title overlap wins, then the most shared entities, then the smaller id.
 */
export function matchActiveEvent(cluster: DetectedCluster, active: readonly ActiveEventRef[]): string | null {
  const clusterTokens = titleTokens(cluster.title);
  const entities = new Set(cluster.entities);
  let best: { id: string; overlap: number; shared: number } | null = null;
  for (const a of active) {
    if (a.type !== cluster.type) continue;
    const overlap = jaccard(clusterTokens, titleTokens(a.title));
    const shared = a.entities.filter((e) => entities.has(e)).length;
    if (shared === 0 && overlap < DETECT_JACCARD) continue;
    if (
      !best ||
      overlap > best.overlap ||
      (overlap === best.overlap && (shared > best.shared || (shared === best.shared && a.id < best.id)))
    ) {
      best = { id: a.id, overlap, shared };
    }
  }
  return best?.id ?? null;
}

/** `active` while the last item is at most `EVENT_FADE_HOURS` old at `now`, else `faded`. */
export function eventStatus(lastSeenAt: string, now: string): MarketEventStatus {
  return Date.parse(now) - Date.parse(lastSeenAt) <= EVENT_FADE_HOURS * HOUR_MS ? "active" : "faded";
}
