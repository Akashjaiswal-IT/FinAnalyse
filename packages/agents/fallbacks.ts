import {
  EVENT_KEYWORDS,
  EXTERNAL_PEERS,
  HORIZON_DAYS,
  TICKER_ALIASES,
  UNIVERSE,
  UNIVERSE_SYMBOLS,
  WEATHER_SUBTYPES,
  LANDFALL_REGIONS,
  type EventClassification,
  type EventType,
  type FactorDirectionEntry,
  type Mode,
  type Plan,
  type Sector,
  type Severity,
} from "@repo/contracts";

// Rule-based stand-ins for the LLM calls (SPEC 5.5): used when a call is refused, truncated, unavailable
// or returns something the schema rejects. They only ever read the question; they invent no numbers.

export { buildTemplateAnswer } from "./template-answer";

const word = (w: string) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");

const TYPE_SIGNALS: Record<EventType, RegExp> = {
  geopolitical: /\b(invad\w*|invasion\w*|war|wars|attack\w*|strike|strikes|missile\w*|sanction\w*|blockade\w*|coup|ceasefire|troops|conflict|military|taiwan|ukraine|russia\w*|iran\w*|israel\w*|gaza)\b/i,
  policy: /\b(tariffs?|trade war|taxes|tax|law|laws|regulat\w*|legislat\w*|executive order|subsid\w*|ban|bill|congress)\b/i,
  macro: /\b(fed|federal reserve|rates?|rate hike|rate cut|inflation|cpi|recession|jobs report|payrolls|unemployment|pandemic|gdp|central bank|bond yields?)\b/i,
  statement: /\b(says?|said|remarks?|speech|testif\w*|comments?|warns?|press conference|interview|tweet\w*)\b/i,
  accident: /\b(explosion|explodes?|outage|cyber\w*|hack\w*|crash\w*|recall\w*|spill|derail\w*|blowout|blew out|blown out|accident|fire|leak|shutdown|grounded|emergency landing|mid-?flight)\b/i,
  disaster: /\b(hurricanes?|tropical storm|typhoon|earthquake|flood\w*|wildfire\w*|winter storm|cyclone|tornado|category \d|storm surge)\b/i,
  corporate: /\b(earnings|guidance|merger|acquisition|acquire\w*|takeover|bankrupt\w*|lawsuit|sues?|chief executive|ceo|layoffs|collapse[sd]?|competitor|ipo|buyback|dividend)\b/i,
  supply_shock: /\b(opec\+?|production cuts?|output cuts?|supply disruption|export ban|shortage|pipeline|embargo|supply)\b/i,
};

/** Ties go to the earlier entry. */
const TYPE_PRIORITY: readonly EventType[] = [
  "disaster", "accident", "supply_shock", "geopolitical", "policy", "statement", "macro", "corporate",
];

const SUBTYPE_SIGNALS: readonly [EventType, string, RegExp][] = [
  ["geopolitical", "war", /\b(invad\w*|invasion\w*|war|military|troops|ceasefire)\b/i],
  ["geopolitical", "attack", /\b(attack\w*|strike|missile\w*|blockade\w*)\b/i],
  ["geopolitical", "sanctions", /\bsanction\w*\b/i],
  ["geopolitical", "unrest", /\b(coup|unrest|protests?)\b/i],
  ["policy", "tariff", /\b(tariffs?|trade war)\b/i],
  ["policy", "tax", /\btax(es)?\b/i],
  ["policy", "regulation", /\bregulat\w*\b/i],
  ["policy", "legislation", /\b(law|laws|bill|legislat\w*)\b/i],
  ["macro", "rates", /\b(rates?|fed|federal reserve|central bank)\b/i],
  ["macro", "inflation", /\b(inflation|cpi)\b/i],
  ["macro", "pandemic", /\bpandemic\b/i],
  ["macro", "growth", /\b(recession|gdp|jobs report|payrolls|unemployment)\b/i],
  ["statement", "central_bank", /\b(fed|powell|central bank)\b/i],
  ["statement", "opec", /\bopec\b/i],
  ["statement", "ceo", /\b(ceo|chief executive)\b/i],
  ["statement", "government", /\b(president|minister|white house|kremlin)\b/i],
  ["accident", "cyber", /\b(cyber\w*|hack\w*)\b/i],
  ["accident", "transport", /\b(crash\w*|derail\w*|airline|flight|mid-?flight|grounded|emergency landing|door panel)\b/i],
  ["accident", "recall", /\brecall\w*\b/i],
  ["accident", "industrial", /\b(explosion|explodes?|refinery|plant|spill|blowout|fire|leak)\b/i],
  ["disaster", "hurricane", /\bhurricanes?\b/i],
  ["disaster", "tropical_storm", /\btropical storm\b/i],
  ["disaster", "winter_storm", /\bwinter storm\b/i],
  ["disaster", "earthquake", /\bearthquake\b/i],
  ["disaster", "flood", /\bflood\w*\b/i],
  ["disaster", "wildfire", /\bwildfire\w*\b/i],
  ["corporate", "earnings", /\b(earnings|guidance)\b/i],
  ["corporate", "m&a", /\b(merger|acquisition|acquire\w*|takeover)\b/i],
  ["corporate", "failure", /\b(bankrupt\w*|collapse[sd]?|failure)\b/i],
  ["corporate", "legal", /\b(lawsuit|sues?)\b/i],
  ["corporate", "leadership", /\b(ceo|chief executive)\b/i],
  ["supply_shock", "production_cut", /\b(production cuts?|output cuts?|opec\+?)\b/i],
  ["supply_shock", "export_ban", /\b(export ban|embargo)\b/i],
  ["supply_shock", "disruption", /\b(disruption|pipeline|shortage|supply)\b/i],
];

const SECTOR_SIGNALS: readonly [Sector, RegExp][] = [
  ["energy", /\b(oil|crude|energy|gas|petroleum)\b/i],
  ["refiner", /\b(refiner\w*|refinery|gasoline)\b/i],
  ["airlines", /\b(airlines?|flights?|aviation)\b/i],
  ["aerospace", /\b(aerospace|boeing|aircraft)\b/i],
  ["banks", /\b(banks?|banking|lender\w*)\b/i],
  ["tech", /\b(tech|software|cloud)\b/i],
  ["semis", /\b(chips?|semiconductors?)\b/i],
  ["defense", /\b(defen[cs]e|weapons?|military)\b/i],
  ["gold", /\bgold\b/i],
  ["china", /\bchina|chinese|taiwan\b/i],
  ["agriculture", /\b(grain|wheat|corn|crops?|agricultur\w*)\b/i],
  ["consumer", /\b(consumer|retail\w*)\b/i],
];

export const DEFAULT_FACTORS: Record<EventType, FactorDirectionEntry[]> = {
  geopolitical: [
    { factor: "MARKET", direction: "down" },
    { factor: "GOLD", direction: "up" },
    { factor: "WTI", direction: "up" },
  ],
  policy: [{ factor: "MARKET", direction: "down" }],
  macro: [{ factor: "MARKET", direction: "unclear" }],
  statement: [{ factor: "MARKET", direction: "unclear" }],
  accident: [{ factor: "MARKET", direction: "unclear" }],
  disaster: [{ factor: "GULF_GASOLINE", direction: "up" }],
  corporate: [{ factor: "MARKET", direction: "unclear" }],
  supply_shock: [{ factor: "WTI", direction: "up" }],
};

function countMatches(re: RegExp, text: string): number {
  return [...text.matchAll(new RegExp(re.source, "gi"))].length;
}

function scoreTypes(text: string): Map<EventType, number> {
  const scores = new Map<EventType, number>();
  for (const type of TYPE_PRIORITY) {
    const keywordHits = EVENT_KEYWORDS[type].filter((k) => word(k).test(text)).length;
    scores.set(type, keywordHits + countMatches(TYPE_SIGNALS[type], text));
  }
  return scores;
}

function mentionedSymbols(text: string): string[] {
  const found = new Set<string>();
  const lower = text.toLowerCase();
  for (const [symbol, aliases] of Object.entries(TICKER_ALIASES)) {
    if (aliases.some((a) => lower.includes(a))) found.add(symbol);
  }
  for (const m of text.matchAll(/\b[A-Z]{2,5}\b/g)) {
    const w = m[0];
    if ((UNIVERSE_SYMBOLS as readonly string[]).includes(w) && !["BA", "DAL", "USO", "SPY"].includes(w)) found.add(w);
  }
  return [...found];
}

function mentionedExternal(text: string): string[] {
  return Object.keys(EXTERNAL_PEERS).filter((name) => word(name).test(text));
}

function severityOf(text: string): Severity {
  if (/\b(catastrophic|massive|major|severe|huge|devastating|full[- ]scale)\b/i.test(text)) return "high";
  if (/\b(small|minor|limited|slight|brief)\b/i.test(text)) return "low";
  return "medium";
}

/** Keyword event classifier (SPEC 5.5, `event` node fallback). Returns null when no type is recognisable. */
export function classifyEventByKeywords(text: string): EventClassification | null {
  const scores = scoreTypes(text);
  let best: EventType | null = null;
  let bestScore = 0;
  for (const type of TYPE_PRIORITY) {
    const s = scores.get(type) ?? 0;
    if (s > bestScore) {
      best = type;
      bestScore = s;
    }
  }
  const entities = mentionedSymbols(text);
  const externalNames = mentionedExternal(text);
  // A named company and no other signal: company-specific news.
  if (!best && (entities.length > 0 || externalNames.length > 0)) best = "corporate";
  if (!best) return null;
  const type = best;
  const subtype = SUBTYPE_SIGNALS.find(([t, , re]) => t === type && re.test(text))?.[1] ?? null;
  const sectors = new Set<Sector>(SECTOR_SIGNALS.filter(([, re]) => re.test(text)).map(([s]) => s));
  for (const e of entities) {
    const sector = UNIVERSE.find((u) => u.symbol === e)?.sector;
    if (sector) sectors.add(sector);
  }
  for (const name of externalNames) {
    for (const s of EXTERNAL_PEERS[name] ?? []) {
      const sector = UNIVERSE.find((u) => u.symbol === s)?.sector;
      if (sector) sectors.add(sector);
    }
  }
  return {
    type,
    subtype,
    entities,
    externalNames,
    affectedSectors: [...sectors],
    factorDirections: DEFAULT_FACTORS[type],
  };
}

const FINANCE_WORDS =
  /\b(portfolio|holdings?|positions?|exposure|risk|hedg\w*|market|markets|stocks?|equit\w*|bonds?|oil|gas|gold|rates?|yields?|var|volatility|vix|news|moving|affect|impact|invest\w*|trade|trading|sell|buy|rebalanc\w*|reallocat\w*)\b/i;

function intentOf(q: string, hasEvent: boolean, hasPrevious: boolean): Plan["intent"] {
  if (/\b(what if|what happens if|suppose|imagine|hypothetical\w*)\b/i.test(q) || (hasPrevious && /^\s*(and\s+)?(if|what about)\b/i.test(q))) return "what_if";
  if (/\b(hedg\w*|protect|rebalanc\w*|reallocat\w*|reduce (our )?(risk|exposure)|offset)\b/i.test(q)) return "hedge";
  if (/\b(scan|what.s moving|what is moving|moving our|happening today|what.s going on|headlines|top events|biggest events)\b/i.test(q)) return "news_scan";
  if (/\b(explain|why did|how does|what is a)\b/i.test(q) && !hasEvent && FINANCE_WORDS.test(q)) return "explain";
  if (hasEvent) return "event_impact";
  if (FINANCE_WORDS.test(q)) return "portfolio_risk";
  return "out_of_scope";
}

export interface RulePlanInput {
  query: string;
  mode: Mode;
  /** Replay preset or analog id, when the run was started from a preset. */
  replayEventId: string | null;
  marketEventId: string | null;
  /** The previous run of the thread, for a follow-up. */
  previousPlan: Plan | null;
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };

function categoryIn(q: string): number | null {
  const m = q.match(/\bcategory\s+(\d|one|two|three|four|five)\b/i) ?? q.match(/\bcat(?:egory)?\.?\s*(\d)\b/i);
  if (!m) return null;
  const raw = (m[1] as string).toLowerCase();
  const n = NUMBER_WORDS[raw] ?? Number(raw);
  return n >= 1 && n <= 5 ? n : null;
}

function regionIn(q: string): string {
  const lower = q.toLowerCase();
  const rules: [string, RegExp][] = [
    ["TX_SOUTH", /corpus christi|south texas/],
    ["TX_UPPER", /houston|galveston|upper texas|baytown/],
    ["LA_WEST", /port arthur|beaumont|lake charles|west(ern)? louisiana/],
    ["LA_SOUTHEAST", /new orleans|southeast louisiana|baton rouge/],
    ["MS_AL", /mississippi|alabama|pascagoula|mobile/],
    ["FL_PANHANDLE", /florida|panhandle|pensacola/],
  ];
  return rules.find(([, re]) => re.test(lower))?.[0] ?? "LA_WEST";
}

/** Keyword plan (SPEC 5.5, `planner` fallback). Picks the most likely reading of the question. */
export function rulePlan(input: RulePlanInput): Plan {
  const { query: q, mode, previousPlan } = input;
  const prev = previousPlan && previousPlan.event.source !== "none" ? previousPlan : null;
  // "What if it only reaches Category 2?" names no event of its own, apart from the category.
  const followUp = prev !== null && classifyEventByKeywords(q.replace(/\bcat(?:egory)?\.?\s*\d\b/gi, " ")) === null;
  const classification = followUp ? null : classifyEventByKeywords(q);
  const category = categoryIn(q);
  const hasEvent = classification !== null || input.marketEventId !== null || input.replayEventId !== null || followUp;
  const intent = intentOf(q, hasEvent, prev !== null);

  const isWeatherEvent =
    (classification?.type === "disaster" && WEATHER_SUBTYPES.includes((classification.subtype ?? "") as (typeof WEATHER_SUBTYPES)[number])) ||
    (prev?.event.type === "disaster" && followUp);

  let source: Plan["event"]["source"];
  if (intent === "out_of_scope" || intent === "explain" || (intent === "portfolio_risk" && !hasEvent)) source = "none";
  else if (intent === "news_scan") source = mode === "replay" ? "replay" : "live";
  else if (intent === "what_if" && !followUp) source = "hypothetical";
  else if (followUp && prev) source = prev.event.source;
  else source = mode === "replay" ? "replay" : "live";

  const base = followUp && prev ? prev.event : null;
  const type = classification?.type ?? base?.type ?? null;
  const entities = classification?.entities ?? base?.entities ?? [];
  const externalNames = classification?.externalNames ?? base?.externalNames ?? [];

  const hypotheticalEvent =
    source === "hypothetical" && classification && !isWeatherEvent
      ? { ...classification, severity: severityOf(q) }
      : null;
  const hypotheticalStorm =
    source === "hypothetical" && isWeatherEvent && category !== null
      ? { category, region: regionIn(q), hoursToLandfall: 48 }
      : null;
  if (hypotheticalStorm && !(hypotheticalStorm.region in LANDFALL_REGIONS)) hypotheticalStorm.region = "LA_WEST";

  const weather = Boolean(isWeatherEvent);
  return {
    intent,
    event: {
      source,
      type,
      subtype: classification?.subtype ?? base?.subtype ?? null,
      name: source === "none" ? null : (base?.name ?? q.replace(/[?.!]+$/, "").slice(0, 120)),
      entities,
      externalNames,
      marketEventId: input.marketEventId,
      stormId: base?.stormId ?? null,
      stormName: base?.stormName ?? null,
      hypothetical: hypotheticalEvent,
      hypotheticalStorm,
      categoryOverride: followUp && category !== null ? category : null,
    },
    focusSymbols: entities,
    focusSectors: classification?.affectedSectors ?? [],
    horizonDays: HORIZON_DAYS,
    specialists: {
      weather,
      sentiment: intent !== "out_of_scope" && intent !== "explain",
      macro: intent !== "out_of_scope" && intent !== "explain",
      analogs: source !== "none",
    },
    reallocation: /\b(rebalanc\w*|reallocat\w*|shift|rotate|trim|reduce)\b/i.test(q),
    source: "fallback",
  };
}

