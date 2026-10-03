import type { NewsItem } from "../schemas";

// Invented headlines for UI development. URLs point at example.com on purpose.
function item(n: number, title: string, hoursBefore: number, tickers: string[], sentiment: number, relevance: number): NewsItem {
  const published = new Date(Date.parse("2021-08-27T21:00:00.000Z") - hoursBefore * 3_600_000).toISOString();
  return {
    id: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`,
    source: n % 2 === 0 ? "alphavantage" : "gdelt",
    url: `https://example.com/fixture/news/${n}`,
    title: `[fixture] ${title}`,
    summary: null,
    domain: "example.com",
    publishedAt: published,
    fetchedAt: published,
    indexedAt: published,
    tickers,
    topics: ["energy_transportation"],
    sourceSentiment: null,
    sentiment,
    relevance,
    scoredAt: published,
    scoreModel: "fixture",
  };
}

export const fixtureNews: NewsItem[] = [
  item(1, "Refiners prepare shutdown plans as Gulf storm strengthens", 3, ["VLO", "MPC"], -0.5, 0.9),
  item(2, "Gasoline futures climb on Gulf Coast supply worries", 6, ["UGA"], -0.2, 0.8),
  item(3, "Offshore producers evacuate platforms ahead of the storm", 9, ["XOM", "MUR"], -0.4, 0.7),
  item(4, "Natural gas edges higher on LNG export disruption risk", 14, ["UNG"], 0.1, 0.6),
  item(5, "Analysts see limited index impact from the storm", 20, ["SPY"], 0.05, 0.3),
];
