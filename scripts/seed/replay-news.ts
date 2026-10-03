import { NEWS_QUERIES, NEWS_WINDOW_HOURS, REPLAY_PRESETS, type EventType } from "../../packages/contracts/index";
import { db, eq } from "../../packages/database/index";
import { analogEvents } from "../../packages/database/schema";
import { AlphaVantageClient, normaliseAvFeed, rotationQueryKey } from "../../packages/services/clients/alphavantage";
import { defaultHttp } from "../../packages/services/clients/default-http";
import { GdeltClient, normaliseArticles } from "../../packages/services/clients/gdelt";
import { NewsService, type NewsItemInput } from "../../packages/services/news/index";
import { cachedJson, log, type SeedOptions } from "./lib";

// Step 6 (SPEC 10): news for each replay preset's window `[asOf - 72 h, asOf]`. Alpha Vantage's archive covers
// 2022 onward; GDELT adds coverage when this network is allowed to reach it.

const HOUR = 3_600_000;

/** Alpha Vantage topics per event type: the broad market topic plus the closest specific one. */
const AV_TOPICS: Record<EventType, readonly string[]> = {
  geopolitical: ["financial_markets", "energy_transportation"],
  policy: ["financial_markets", "economy_fiscal"],
  macro: ["financial_markets", "economy_monetary"],
  statement: ["financial_markets", "economy_monetary"],
  accident: ["financial_markets", "manufacturing"],
  disaster: ["financial_markets", "energy_transportation"],
  corporate: ["financial_markets", "finance"],
  supply_shock: ["financial_markets", "energy_transportation"],
};

export async function seedReplayNews(options: SeedOptions): Promise<void> {
  const http = defaultHttp();
  const av = new AlphaVantageClient(http);
  const gdelt = new GdeltClient(http);
  const news = new NewsService();

  for (const preset of REPLAY_PRESETS) {
    const to = new Date(preset.asOf);
    const from = new Date(to.getTime() - NEWS_WINDOW_HOURS * HOUR);
    const items: NewsItemInput[] = [];

    for (const topic of AV_TOPICS[preset.type]) {
      const entry = { kind: "topics" as const, value: topic };
      try {
        const feed = await cachedJson(`alphavantage/replay/${preset.id}-${topic}.json`, options, () => av.news(entry, 1000, { from, to }));
        items.push(...normaliseAvFeed(feed, rotationQueryKey(entry), to));
      } catch (error) {
        log("news", `${preset.id}: Alpha Vantage ${topic} unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const [row] = await db.select({ gdeltQuery: analogEvents.gdeltQuery }).from(analogEvents).where(eq(analogEvents.id, preset.id));
    const queries = [row?.gdeltQuery, NEWS_QUERIES[preset.type]].filter((q): q is string => Boolean(q));
    for (const query of queries) {
      try {
        const articles = await cachedJson(`gdelt/replay/${preset.id}-${queries.indexOf(query)}.json`, options, () =>
          gdelt.artlist(query, { start: from, end: to }),
        );
        items.push(...normaliseArticles(articles, preset.type, to));
      } catch (error) {
        log("news", `${preset.id}: GDELT unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Only the window: the archive endpoints can return items just outside it.
    const inWindow = items.filter((i) => {
      const t = Date.parse(i.publishedAt);
      return t >= from.getTime() && t <= to.getTime();
    });
    const r = await news.upsertBatch(inWindow);
    log("news", `${preset.id}: ${inWindow.length} items, ${r.inserted.length} new, ${r.prefiltered.length} prefiltered, ${r.indexed.length} indexed${r.indexError ? ` (index error: ${r.indexError})` : ""}`);
  }
}
