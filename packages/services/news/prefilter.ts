import { EVENT_KEYWORDS, EXTERNAL_PEERS, TICKER_ALIASES, UNIVERSE_SYMBOLS, type EventType } from "@repo/contracts";

// Rule-based prefilter in the sub-second ingest path (SPEC 5.2): only matching items are embedded and scored.

export interface PrefilterInput {
  title: string;
  summary: string | null;
  /** Alpha Vantage per-ticker sentiment; its keys are the tickers Alpha Vantage tagged. */
  tickerSentiment: Record<string, number> | null;
}

export interface PrefilterResult {
  match: boolean;
  /** Universe symbols named directly (alias match or Alpha Vantage tag). */
  tickers: string[];
  /** Universe symbols whose competitor is named (EXTERNAL_PEERS), minus those named directly. */
  peerTickers: string[];
  /** Event types whose keywords appear; a hint for scoring, not stored. */
  eventTypes: EventType[];
}

function escape(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word (or whole-phrase) matcher: no letter or digit may touch either end. */
function wordPattern(terms: readonly string[], flags: string): RegExp {
  const sorted = [...terms].sort((a, b) => b.length - a.length).map(escape);
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${sorted.join("|")})(?![\\p{L}\\p{N}])`, flags);
}

const UNIVERSE = new Set(UNIVERSE_SYMBOLS);

// Aliases and keywords are lower-case and matched case-insensitively. External peer names are proper nouns
// that are also common words ("Target", "Meta", "Southwest"), so they are matched case-sensitively.
const ALIASES = Object.entries(TICKER_ALIASES).map(([symbol, names]) => ({ symbol, re: wordPattern(names, "iu") }));
const PEERS = Object.entries(EXTERNAL_PEERS).map(([name, symbols]) => ({ symbols, re: wordPattern([name], "u") }));
const KEYWORDS = (Object.entries(EVENT_KEYWORDS) as [EventType, readonly string[]][]).map(([type, words]) => ({
  type,
  re: wordPattern(words, "iu"),
}));

export function prefilter(item: PrefilterInput): PrefilterResult {
  const text = item.summary ? `${item.title}\n${item.summary}` : item.title;
  const tickers = new Set<string>();
  for (const a of ALIASES) if (a.re.test(text)) tickers.add(a.symbol);
  for (const t of Object.keys(item.tickerSentiment ?? {})) if (UNIVERSE.has(t)) tickers.add(t);

  const peers = new Set<string>();
  for (const p of PEERS) if (p.re.test(text)) for (const s of p.symbols) if (!tickers.has(s)) peers.add(s);

  const eventTypes = KEYWORDS.filter((k) => k.re.test(text)).map((k) => k.type);
  const peerTickers = [...peers].sort();
  return {
    match: tickers.size > 0 || peerTickers.length > 0 || eventTypes.length > 0,
    tickers: [...tickers].sort(),
    peerTickers,
    eventTypes,
  };
}
