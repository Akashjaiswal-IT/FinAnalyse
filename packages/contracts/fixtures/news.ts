import type { NewsEventType, NewsItem } from "../schemas";
import { FIXTURE_AS_OF, FIXTURE_AS_OF_UKRAINE } from "./portfolio";

// Invented headlines for UI development. URLs point at example.com on purpose.
function item(
  n: number,
  asOf: string,
  title: string,
  hoursBefore: number,
  tickers: string[],
  eventType: NewsEventType,
  sentiment: number,
  relevance: number,
): NewsItem {
  const published = new Date(Date.parse(asOf) - hoursBefore * 3_600_000).toISOString();
  return {
    id: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`,
    source: n % 2 === 0 ? "alphavantage" : "gdelt",
    url: `https://example.com/fixture/news/${n}`,
    title: `[fixture] ${title}`,
    summary: null,
    domain: "example.com",
    queryKey: eventType === "none" ? null : eventType,
    publishedAt: published,
    fetchedAt: published,
    indexedAt: published,
    prefilterMatch: true,
    tickers,
    peerTickers: [],
    topics: [],
    sourceSentiment: null,
    tickerSentiment: null,
    sentiment,
    relevance,
    eventType,
    entitySentiment: tickers.map((symbol) => ({ symbol, score: sentiment })),
    factorDirections: [],
    marketEventId: null,
    scoredAt: published,
    scoreModel: "fixture",
  };
}

export const fixtureNews: NewsItem[] = [
  item(1, FIXTURE_AS_OF, "Refiners prepare shutdown plans as Gulf storm strengthens", 3, ["VLO", "MPC"], "disaster", -0.5, 0.9),
  item(2, FIXTURE_AS_OF, "Gasoline futures climb on Gulf Coast supply worries", 6, ["UGA"], "disaster", -0.2, 0.8),
  item(3, FIXTURE_AS_OF, "Offshore producers evacuate platforms ahead of the storm", 9, ["XOM"], "disaster", -0.4, 0.7),
  item(4, FIXTURE_AS_OF, "Natural gas edges higher on LNG export disruption risk", 14, ["UNG"], "disaster", 0.1, 0.6),
  item(5, FIXTURE_AS_OF, "Analysts see limited index impact from the storm", 20, ["SPY"], "none", 0.05, 0.3),
];

export const fixtureNewsUkraine: NewsItem[] = [
  item(11, FIXTURE_AS_OF_UKRAINE, "Defense contractors rally as the invasion widens", 4, ["LMT", "RTX"], "geopolitical", 0.45, 0.9),
  item(12, FIXTURE_AS_OF_UKRAINE, "Oil jumps as traders price supply risk from the war", 7, ["USO", "XOM"], "geopolitical", -0.3, 0.85),
  item(13, FIXTURE_AS_OF_UKRAINE, "Airlines slide on fuel costs and airspace closures", 10, ["DAL"], "geopolitical", -0.6, 0.8),
  item(14, FIXTURE_AS_OF_UKRAINE, "Gold climbs as investors seek havens", 12, ["GLD"], "geopolitical", 0.2, 0.7),
  item(15, FIXTURE_AS_OF_UKRAINE, "Western governments draft new sanctions packages", 18, [], "geopolitical", -0.4, 0.75),
];
