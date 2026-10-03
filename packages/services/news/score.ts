import { EventType, FACTORS, TIINGO_SYMBOLS, UNIVERSE, type Scores } from "@repo/contracts";
import type { NewsItemRow } from "@repo/database/schema";

// Haiku news scoring (SPEC 5.2 enrichment). The model only labels; its numbers are stored with basis `model`.

export const SCORING_SYSTEM = `You label financial news for a portfolio terminal. For every item return:
- sentiment: from -1 (clearly bad for the companies or sectors it is about) to 1 (clearly good); 0 when neutral or unclear.
- relevance: from 0 (not market-moving) to 1 (clearly moves prices of listed companies, sectors or commodities).
- eventType: one of ${EventType.options.join(", ")}, or none when the item is not about a market-moving event.
- tickers: only symbols from the universe list that the item is about (directly named or clearly meant).
- entitySentiment: a score from -1 to 1 for each of those tickers.
- factorDirections: for each factor in ${Object.keys(FACTORS).join(", ")} that the item clearly pushes, up or down. Leave out factors it does not clearly move.
Use only the item text. Return one entry per item id, with the same ids.`;

const UNIVERSE_NAMES = UNIVERSE.filter((u) => u.source === "tiingo").map((u) => `${u.symbol}: ${u.name}`);

export function scoringUser(rows: readonly Pick<NewsItemRow, "id" | "title" | "summary" | "tickers">[]): string {
  return JSON.stringify({
    universe: UNIVERSE_NAMES,
    items: rows.map((r) => ({ id: r.id, title: r.title, summary: r.summary?.slice(0, 600) ?? null, taggedTickers: r.tickers })),
  });
}

const universe = new Set(TIINGO_SYMBOLS);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** The row update for one scored item; tickers and entities outside the universe are dropped. */
export function scoreUpdate(score: Scores["scores"][number], existingTickers: readonly string[], model: string, now: Date) {
  return {
    sentiment: clamp(score.sentiment, -1, 1),
    relevance: clamp(score.relevance, 0, 1),
    eventType: score.eventType,
    tickers: [...new Set([...existingTickers, ...score.tickers.filter((t) => universe.has(t))])],
    entitySentiment: Object.fromEntries(
      score.entitySentiment.filter((e) => universe.has(e.symbol)).map((e) => [e.symbol, clamp(e.score, -1, 1)]),
    ),
    factorDirections: Object.fromEntries(score.factorDirections.map((f) => [f.factor, f.direction])),
    scoredAt: now,
    scoreModel: model,
  };
}
