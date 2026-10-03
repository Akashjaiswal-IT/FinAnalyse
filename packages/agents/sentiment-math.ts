import { NEWS_HALF_LIFE_HOURS, PEER_GROUPS, UNIVERSE, type NewsItem, type Sector } from "@repo/contracts";

export type Aggregate = { score: number; n: number };

/** Peer news says less about a holding than news that names it. */
const PEER_WEIGHT = 0.5;
const HOUR = 3_600_000;

/** Weight of an item: its relevance, halved every `NEWS_HALF_LIFE_HOURS` of age (SPEC 5.5, `sentiment`). */
export function itemWeight(item: Pick<NewsItem, "relevance" | "publishedAt">, asOf: string): number {
  const ageHours = Math.max(0, (Date.parse(asOf) - Date.parse(item.publishedAt)) / HOUR);
  return (item.relevance ?? 0) * 0.5 ** (ageHours / NEWS_HALF_LIFE_HOURS);
}

type Scored = NewsItem & { sentiment: number };

/** Relevance given to an Alpha Vantage item that Claude has not scored: it is already finance news on a topic. */
export const SOURCE_SCORE_RELEVANCE = 0.5;
const UNIVERSE_SYMBOLS = new Set(UNIVERSE.map((u) => u.symbol));

/** Alpha Vantage's own scores stand in when Claude has not scored an item (SPEC 5.5, `sentiment`). */
export function withSourceScores(item: NewsItem): NewsItem {
  if (item.sentiment !== null || item.sourceSentiment === null) return item;
  const tickerScores = Object.entries(item.tickerSentiment ?? {}).filter(([symbol]) => UNIVERSE_SYMBOLS.has(symbol));
  return {
    ...item,
    sentiment: Math.max(-1, Math.min(1, item.sourceSentiment)),
    relevance: item.relevance ?? SOURCE_SCORE_RELEVANCE,
    entitySentiment: item.entitySentiment ?? (tickerScores.length ? tickerScores.map(([symbol, score]) => ({ symbol, score })) : null),
    scoreModel: item.scoreModel ?? "alphavantage",
  };
}

const isScored = (i: NewsItem): i is Scored => i.sentiment !== null && i.relevance !== null;

/** Sentiment of an item about one symbol: the per-entity score when the scorer gave one, else the item's own. */
function scoreFor(item: Scored, symbol: string): number {
  return item.entitySentiment?.find((e) => e.symbol === symbol)?.score ?? item.sentiment;
}

interface Sample {
  id: string;
  score: number;
  weight: number;
}

function combine(samples: Sample[]): Aggregate | null {
  const total = samples.reduce((s, x) => s + x.weight, 0);
  if (samples.length === 0 || total <= 0) return null;
  return { score: samples.reduce((s, x) => s + x.score * x.weight, 0) / total, n: new Set(samples.map((x) => x.id)).size };
}

export interface SentimentAggregates {
  holdings: Map<string, Aggregate>;
  sectors: Map<Sector, Aggregate>;
  peerGroups: { symbols: string[]; agg: Aggregate }[];
  scoredIds: string[];
}

/** Relevance-weighted, recency-decayed sentiment per holding, per peer group and per sector (SPEC 5.5). Items
 * without a score are ignored. */
export function aggregateSentiment(items: readonly NewsItem[], asOf: string, holdings: readonly string[]): SentimentAggregates {
  const scored = items.filter(isScored);
  const byHolding = new Map<string, Sample[]>();
  for (const item of scored) {
    const w = itemWeight(item, asOf);
    const direct = new Set([...item.tickers, ...(item.entitySentiment?.map((e) => e.symbol) ?? [])]);
    for (const symbol of holdings) {
      const named = direct.has(symbol);
      if (!named && !item.peerTickers.includes(symbol)) continue;
      const list = byHolding.get(symbol) ?? [];
      list.push({ id: item.id, score: scoreFor(item, symbol), weight: named ? w : w * PEER_WEIGHT });
      byHolding.set(symbol, list);
    }
  }

  const holdingAgg = new Map<string, Aggregate>();
  for (const [symbol, samples] of byHolding) {
    const agg = combine(samples);
    if (agg) holdingAgg.set(symbol, agg);
  }

  const sectorSamples = new Map<Sector, Sample[]>();
  for (const [symbol, samples] of byHolding) {
    const sector = UNIVERSE.find((u) => u.symbol === symbol)?.sector;
    if (!sector) continue;
    sectorSamples.set(sector, [...(sectorSamples.get(sector) ?? []), ...samples]);
  }
  const sectorAgg = new Map<Sector, Aggregate>();
  for (const [sector, samples] of sectorSamples) {
    const agg = combine(samples);
    if (agg) sectorAgg.set(sector, agg);
  }

  const peerGroups = PEER_GROUPS.flatMap((group) => {
    const samples = group.flatMap((s) => byHolding.get(s) ?? []);
    const agg = combine(samples);
    return agg ? [{ symbols: [...group], agg }] : [];
  });

  return { holdings: holdingAgg, sectors: sectorAgg, peerGroups, scoredIds: scored.map((i) => i.id) };
}
