import type { AssetClass, Sector } from "./schemas/common";
import type { EventType, FactorName, Severity } from "./schemas/event";

export const PROJECT_NAME = "Tempest";

// Universe and demo portfolio (SPEC 11)

export interface UniverseEntry {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  sector: Sector;
  source: "tiingo" | "fred";
  sourceRef: string | null;
  tradable: boolean;
  proxyFor: string | null;
  /** Demo portfolio target weight; null when not held. */
  demoWeight: number | null;
}

const equity = (symbol: string, name: string, sector: Sector, demoWeight: number | null): UniverseEntry => ({
  symbol,
  name,
  assetClass: "equity",
  sector,
  source: "tiingo",
  sourceRef: null,
  tradable: true,
  proxyFor: null,
  demoWeight,
});

const etf = (
  symbol: string,
  name: string,
  sector: Sector,
  demoWeight: number | null,
  proxyFor: string | null = null,
): UniverseEntry => ({
  symbol,
  name,
  assetClass: "etf",
  sector,
  source: "tiingo",
  sourceRef: null,
  tradable: true,
  proxyFor,
  demoWeight,
});

const factor = (symbol: string, name: string, sourceRef: string): UniverseEntry => ({
  symbol,
  name,
  assetClass: "commodity",
  sector: "factor",
  source: "fred",
  sourceRef,
  tradable: false,
  proxyFor: null,
  demoWeight: null,
});

export const UNIVERSE: readonly UniverseEntry[] = [
  equity("XOM", "Exxon Mobil", "energy", 0.06),
  equity("CVX", "Chevron", "energy", 0.04),
  equity("OXY", "Occidental Petroleum", "energy", null),
  equity("VLO", "Valero Energy", "refiner", 0.04),
  equity("MPC", "Marathon Petroleum", "refiner", 0.03),
  equity("PSX", "Phillips 66", "refiner", null),
  etf("XLE", "Energy Select Sector SPDR", "energy", 0.04),
  etf("XOP", "SPDR S&P Oil & Gas E&P", "energy", null),
  etf("CRAK", "VanEck Oil Refiners", "refiner", null),
  etf("USO", "United States Oil Fund", "commodity_proxy", 0.02, "WTI"),
  etf("UNG", "United States Natural Gas Fund", "commodity_proxy", null, "HH_NATGAS"),
  etf("UGA", "United States Gasoline Fund", "commodity_proxy", null, "GULF_GASOLINE"),
  etf("GLD", "SPDR Gold Shares", "gold", 0.05),
  equity("NEM", "Newmont", "gold", 0.02),
  equity("AAPL", "Apple", "tech", 0.05),
  equity("MSFT", "Microsoft", "tech", 0.06),
  equity("NVDA", "NVIDIA", "semis", 0.05),
  equity("TSM", "Taiwan Semiconductor (ADR)", "semis", 0.03),
  etf("XLK", "Technology Select Sector SPDR", "tech", null),
  equity("JPM", "JPMorgan Chase", "banks", 0.05),
  equity("BAC", "Bank of America", "banks", 0.03),
  etf("XLF", "Financial Select Sector SPDR", "banks", 0.03),
  etf("KRE", "SPDR S&P Regional Banking", "banks", null),
  equity("LMT", "Lockheed Martin", "defense", 0.03),
  equity("RTX", "RTX", "defense", 0.02),
  etf("ITA", "iShares US Aerospace & Defense", "defense", null),
  equity("BA", "Boeing", "aerospace", 0.03),
  equity("DAL", "Delta Air Lines", "airlines", 0.02),
  equity("UAL", "United Airlines", "airlines", null),
  etf("JETS", "U.S. Global Jets", "airlines", null),
  equity("WMT", "Walmart", "consumer", 0.04),
  etf("XLP", "Consumer Staples Select Sector SPDR", "consumer", null),
  etf("TLT", "iShares 20+ Year Treasury Bond", "rates", 0.07),
  etf("UUP", "Invesco DB US Dollar Index Bullish", "fx", null),
  etf("FXI", "iShares China Large-Cap", "china", 0.02),
  etf("DBA", "Invesco DB Agriculture", "agriculture", null),
  etf("SPY", "SPDR S&P 500", "market", 0.12),
  factor("GULF_GASOLINE", "US Gulf Coast conventional gasoline spot", "DGASUSGULF"),
  factor("WTI", "WTI crude spot", "DCOILWTICO"),
  factor("BRENT", "Brent crude spot", "DCOILBRENTEU"),
  factor("HH_NATGAS", "Henry Hub natural gas spot", "DHHNGSP"),
];

export const UNIVERSE_SYMBOLS: readonly string[] = UNIVERSE.map((u) => u.symbol);
export const TIINGO_SYMBOLS: readonly string[] = UNIVERSE.filter((u) => u.source === "tiingo").map((u) => u.symbol);
export const FRED_FACTOR_SYMBOLS: readonly string[] = UNIVERSE.filter((u) => u.source === "fred").map((u) => u.symbol);

/** Factor name to the series that carries it (SPEC 5.10). Gold, rates and the dollar use ETFs. */
export const FACTORS: Readonly<Record<FactorName, string>> = {
  MARKET: "SPY",
  WTI: "WTI",
  HH_NATGAS: "HH_NATGAS",
  GULF_GASOLINE: "GULF_GASOLINE",
  GOLD: "GLD",
  RATES: "TLT",
  USD: "UUP",
};

/** Forecast targets (SPEC 5.9): 5-trading-day forward log returns. Every holding is forecast too. */
export const FORECAST_TARGETS = ["SPY", "WTI", "GULF_GASOLINE", "HH_NATGAS", "GLD", "TLT"] as const;

/** The macro node reads inventories only when the portfolio holds one of these sectors (SPEC 5.5). */
export const ENERGY_SECTORS: readonly Sector[] = ["energy", "refiner", "commodity_proxy"];

export const DEMO_PORTFOLIO = {
  name: "Tempest Multi-Sector Fund",
  nav: 10_000_000,
  positions: UNIVERSE.filter((u) => u.demoWeight !== null).map((u) => ({
    symbol: u.symbol,
    targetWeight: u.demoWeight as number,
  })),
} as const;

export const MACRO_SERIES = ["WGTSTUS1", "WCESTUS1", "VIXCLS", "DGS10", "DFF", "DTWEXBGS"] as const;

// Peers and names (SPEC 5.14, 11)

/** Universe-to-universe peer groups; each symbol's peers are the others in its group. */
export const PEER_GROUPS: readonly (readonly string[])[] = [
  ["XOM", "CVX", "OXY"],
  ["VLO", "MPC", "PSX"],
  ["AAPL", "MSFT"],
  ["NVDA", "TSM"],
  ["JPM", "BAC"],
  ["LMT", "RTX"],
  ["DAL", "UAL"],
];

export const PEERS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  PEER_GROUPS.flatMap((group) => group.map((s) => [s, group.filter((o) => o !== s)] as const)),
);

/** Non-universe competitors to the universe symbols they affect. Track A completes the list. */
export const EXTERNAL_PEERS: Readonly<Record<string, readonly string[]>> = {
  Shell: ["XOM", "CVX"],
  BP: ["XOM", "CVX"],
  TotalEnergies: ["XOM", "CVX"],
  ConocoPhillips: ["XOM", "CVX", "OXY"],
  "PBF Energy": ["VLO", "MPC", "PSX"],
  "HF Sinclair": ["VLO", "MPC", "PSX"],
  Airbus: ["BA"],
  "Spirit AeroSystems": ["BA"],
  AMD: ["NVDA", "TSM"],
  Intel: ["NVDA", "TSM"],
  Samsung: ["NVDA", "TSM"],
  Alphabet: ["AAPL", "MSFT"],
  Meta: ["AAPL", "MSFT"],
  Amazon: ["AAPL", "MSFT"],
  "Goldman Sachs": ["JPM", "BAC"],
  "Morgan Stanley": ["JPM", "BAC"],
  Citigroup: ["JPM", "BAC"],
  "Wells Fargo": ["JPM", "BAC"],
  "Silicon Valley Bank": ["JPM", "BAC", "KRE"],
  "Credit Suisse": ["JPM", "BAC"],
  "Northrop Grumman": ["LMT", "RTX"],
  "General Dynamics": ["LMT", "RTX"],
  "American Airlines": ["DAL", "UAL"],
  Southwest: ["DAL", "UAL"],
  "Alaska Airlines": ["DAL", "UAL"],
  Costco: ["WMT"],
  Target: ["WMT"],
  Barrick: ["NEM"],
};

/** Rule-based tagging: lower-case names matched as whole words in titles (SPEC 5.2). Tickers that are
 * also common words (SPY, BA, DAL, USO) are matched by name only. */
export const TICKER_ALIASES: Readonly<Record<string, readonly string[]>> = {
  XOM: ["exxon", "exxonmobil"],
  CVX: ["chevron"],
  OXY: ["occidental petroleum", "occidental"],
  VLO: ["valero"],
  MPC: ["marathon petroleum"],
  PSX: ["phillips 66"],
  XLE: ["xle", "energy select sector"],
  XOP: ["xop"],
  CRAK: ["crak"],
  USO: ["united states oil fund"],
  UNG: ["united states natural gas fund"],
  UGA: ["united states gasoline fund"],
  GLD: ["spdr gold"],
  NEM: ["newmont"],
  AAPL: ["apple"],
  MSFT: ["microsoft"],
  NVDA: ["nvidia"],
  TSM: ["tsmc", "taiwan semiconductor"],
  XLK: ["xlk"],
  JPM: ["jpmorgan", "jp morgan"],
  BAC: ["bank of america"],
  XLF: ["xlf"],
  KRE: ["regional bank etf"],
  LMT: ["lockheed martin", "lockheed"],
  RTX: ["raytheon", "rtx corp"],
  ITA: ["ita etf"],
  BA: ["boeing"],
  DAL: ["delta air lines", "delta airlines"],
  UAL: ["united airlines"],
  JETS: ["jets etf"],
  WMT: ["walmart"],
  XLP: ["xlp"],
  TLT: ["tlt"],
  UUP: ["uup"],
  FXI: ["fxi"],
  DBA: ["dba"],
  SPY: ["s&p 500"],
};

// Events (SPEC 5.14)

export const EVENT_SUBTYPES: Readonly<Record<EventType, readonly string[]>> = {
  geopolitical: ["war", "attack", "sanctions", "unrest"],
  policy: ["tariff", "tax", "regulation", "legislation"],
  macro: ["rates", "inflation", "growth", "pandemic", "credit"],
  statement: ["central_bank", "government", "opec", "ceo"],
  accident: ["industrial", "cyber", "transport", "recall"],
  disaster: ["hurricane", "tropical_storm", "winter_storm", "flood", "earthquake", "wildfire"],
  corporate: ["earnings", "m&a", "failure", "legal", "leadership"],
  supply_shock: ["production_cut", "disruption", "export_ban"],
};

/** Weather disasters run the weather node (SPEC 5.5). */
export const WEATHER_SUBTYPES = ["hurricane", "tropical_storm", "winter_storm"] as const;

/** Lower-case words for the prefilter (SPEC 5.2) and `buildEventQuery` (SPEC 5.9). */
export const EVENT_KEYWORDS: Readonly<Record<EventType, readonly string[]>> = {
  geopolitical: ["war", "invasion", "airstrike", "missile", "sanctions", "blockade", "troops", "ceasefire", "coup"],
  policy: ["tariff", "tariffs", "tax increase", "new law", "regulation", "legislation", "executive order", "subsidy"],
  macro: ["federal reserve", "interest rate", "rate hike", "rate cut", "inflation", "recession", "central bank", "jobs report", "pandemic"],
  statement: ["fed chair", "treasury secretary", "energy minister", "white house", "kremlin", "prime minister", "press conference", "testimony"],
  accident: ["explosion", "fire", "outage", "cyberattack", "recall", "spill", "crash", "derailment", "blowout"],
  disaster: ["hurricane", "tropical storm", "earthquake", "flood", "wildfire", "winter storm", "typhoon"],
  corporate: ["earnings", "guidance", "merger", "acquisition", "takeover", "bankruptcy", "lawsuit", "chief executive", "layoffs"],
  supply_shock: ["opec", "production cut", "supply disruption", "export ban", "shortage", "pipeline shutdown"],
};

function quoteTerm(t: string): string {
  return t.includes(" ") ? `"${t}"` : t;
}

/** GDELT terms are OR'd inside parentheses; multi-word names are quoted. Two-letter names (BP) are left
 * out because GDELT rejects very short keywords. */
export function gdeltOrQuery(terms: readonly string[]): string {
  return `(${terms.filter((t) => t.length > 2).map(quoteTerm).join(" OR ")}) sourcelang:english`;
}

/** GDELT collection queries (SPEC 11): one per event type, plus company-name chunks for `corporate` news.
 * Tone and volume features never use these; each event has its own `gdeltQuery` (SPEC 5.9). */
export const NEWS_QUERIES: Readonly<Record<string, string>> = {
  geopolitical: "(war OR invasion OR airstrike OR missile OR sanctions OR blockade) sourcelang:english",
  policy: '(tariff OR tariffs OR "tax increase" OR "new law" OR regulation OR "executive order") sourcelang:english',
  macro: '("Federal Reserve" OR "interest rate" OR inflation OR recession OR "central bank") sourcelang:english',
  statement:
    '("Fed chair" OR "Treasury Secretary" OR OPEC OR "White House" OR Kremlin OR "prime minister") (markets OR oil OR tariffs OR rates) sourcelang:english',
  accident:
    "(explosion OR outage OR cyberattack OR recall OR spill OR crash) (refinery OR pipeline OR airline OR plant OR bank OR chip) sourcelang:english",
  disaster: '(hurricane OR "tropical storm" OR earthquake OR flood OR wildfire OR "winter storm") sourcelang:english',
  supply_shock: '(OPEC OR "production cut" OR "supply disruption" OR "export ban" OR shortage) sourcelang:english',
  company_energy: gdeltOrQuery(["Exxon", "Chevron", "Occidental", "Valero", "Marathon Petroleum", "Phillips 66", "Shell", "TotalEnergies"]),
  company_tech: gdeltOrQuery(["Apple", "Microsoft", "Nvidia", "TSMC", "AMD", "Intel", "Samsung", "Alphabet", "Meta", "Amazon"]),
  company_finance: gdeltOrQuery(["JPMorgan", "Bank of America", "Goldman Sachs", "Morgan Stanley", "Citigroup", "Wells Fargo"]),
  company_industrial: gdeltOrQuery(["Boeing", "Lockheed Martin", "Raytheon", "Airbus", "Delta Air Lines", "United Airlines", "Walmart", "Newmont", "Northrop Grumman"]),
};

export type AvRotationEntry = { kind: "topics"; value: string } | { kind: "tickers"; value: string };

/** Alpha Vantage, one entry per hourly call (SPEC 5.2). Several tickers in one call means AND, so ticker
 * entries hold a single ticker. */
export const AV_ROTATION: readonly AvRotationEntry[] = [
  { kind: "topics", value: "economy_fiscal" },
  { kind: "topics", value: "economy_monetary" },
  { kind: "topics", value: "economy_macro" },
  { kind: "topics", value: "mergers_and_acquisitions" },
  { kind: "topics", value: "earnings" },
  { kind: "topics", value: "energy_transportation" },
  { kind: "topics", value: "financial_markets" },
  { kind: "topics", value: "technology" },
  { kind: "tickers", value: "MSFT" },
  { kind: "tickers", value: "AAPL" },
  { kind: "tickers", value: "NVDA" },
  { kind: "tickers", value: "JPM" },
];

/** Hypothetical events: the plan's severity sets the news features (SPEC 5.12). */
export const SEVERITY_VOLZ: Readonly<Record<Severity, number>> = { low: 0.5, medium: 2, high: 4 };
/** Severity from `volZ`: low below `medium`, high at `high` or above (SPEC 5.14). */
export const SEVERITY_BOUNDS = { medium: 1, high: 3 } as const;

export const DETECT_JACCARD = 0.3;
export const DETECT_MIN_ARTICLES = 5;
export const DETECT_MIN_DOMAINS = 3;
export const DETECT_MIN_RELEVANCE = 0.5;
export const DETECT_WINDOW_HOURS = 24;
export const EVENT_FADE_HOURS = 6;
export const TYPE_BASELINE_DAYS = 7;
export const EVENT_FEATURE_WINDOW_HOURS = 24;
export const NEWS_BASELINE_DAYS = 28;
export const NEWS_SCAN_MAX_EVENTS = 3;
/** `first_report_at` time for sources that give only a date (SPEC 10.5). */
export const DATE_ONLY_REPORT_TIME_UTC = "23:59:00.000Z";

// Geography (SPEC 5.8, 5.12, 11)

export interface Hub {
  name: string;
  lat: number;
  lon: number;
}

export const HUBS: readonly Hub[] = [
  { name: "Corpus Christi", lat: 27.81, lon: -97.4 },
  { name: "Houston/Baytown", lat: 29.73, lon: -95.02 },
  { name: "Port Arthur/Beaumont", lat: 29.9, lon: -93.93 },
  { name: "Lake Charles", lat: 30.22, lon: -93.25 },
  { name: "Baton Rouge", lat: 30.48, lon: -91.17 },
  { name: "New Orleans/St. Charles", lat: 29.95, lon: -90.37 },
  { name: "Pascagoula", lat: 30.35, lon: -88.53 },
];

export const LANDFALL_REGIONS = {
  TX_SOUTH: { lat: 27.8, lon: -97.4 },
  TX_UPPER: { lat: 29.5, lon: -94.5 },
  LA_WEST: { lat: 29.8, lon: -93.3 },
  LA_SOUTHEAST: { lat: 29.2, lon: -90.1 },
  MS_AL: { lat: 30.3, lon: -88.5 },
  FL_PANHANDLE: { lat: 30.1, lon: -85.7 },
} as const;
export type LandfallRegion = keyof typeof LANDFALL_REGIONS;

export interface Box {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

export const GULF_BOX: Box = { latMin: 18, latMax: 31, lonMin: -98, lonMax: -80 };
export const OFFSHORE_BOX: Box = { latMin: 26, latMax: 29.5, lonMin: -95, lonMax: -88 };
/** US Gulf coast window used to find the HURDAT2 landfall record (SPEC 10.5). */
export const GULF_COAST_BOX: Box = { latMin: 25, latMax: 31, lonMin: -98, lonMax: -81 };
/** Start point of a hypothetical storm track (SPEC 5.12). */
export const HYPOTHETICAL_START = { lat: 24.5, lon: -89.0 } as const;
/** Hypothetical storm wind by Saffir-Simpson category 1 to 5, in knots. */
export const HYPOTHETICAL_WIND_KT = [75, 90, 105, 125, 145] as const;

export const IMPACT_RADIUS_KM = 100;
export const IMPACT_WIND_KT = 64;
export const COAST_ANCHOR_RADIUS_KM = 50;
export const RECENT_OBSERVED_HOURS = 12;
export const REPLAY_FORECAST_HOURS = 72;
export const LIVE_PERSISTENCE_HOURS = 48;
export const HUB_FORECAST_HOURS = 120;

/** Lower bounds of Saffir-Simpson categories 1 to 5, in knots. */
export const SAFFIR_SIMPSON_KT = [64, 83, 96, 113, 137] as const;

// Time and horizons

export const NEWS_WINDOW_HOURS = 72;
export const HORIZON_DAYS = 5;
export const BAR_AVAILABLE_HOUR_UTC = 21;
export const WEEKLY_SERIES_LAG_DAYS = 5;
export const NEWS_HALF_LIFE_HOURS = 24;
export const EARLIEST_REPLAY_AS_OF = "2017-01-01T00:00:00.000Z";

// Quant (SPEC 5.9, 5.10, 5.14)

export const KNN_BANDWIDTH = 1.0;
/** A type mismatch adds TYPE_WEIGHT² to the type group's squared distance. Fixed, never tuned. */
export const TYPE_WEIGHT = 1.5;
export const MIN_TYPE_EVENTS = 5;
export const MIN_ANALOGS_PER_HOLDING = 3;
export const FACTOR_BETA_MIN = 0.5;
export const MIN_FACTOR_R2 = 0.1;
export const BETA_LOOKBACK_DAYS = 252;
export const VAR_LOOKBACK_DAYS = 504;
export const VIX_Z_LOOKBACK_DAYS = 252;
export const VAR_CONFIDENCE = 0.95;
export const DIRECTION_EPSILON = 0.0025;
export const LOOSE_TIGHT_INVENTORY = 0.03;
export const VIX_ELEVATED = 18;
export const VIX_STRESSED = 25;

// Hedging (SPEC 5.11)

export const HEDGE_MENU = [
  "SPY", "XLE", "XOP", "CRAK", "USO", "UNG", "UGA", "GLD", "TLT",
  "UUP", "XLK", "XLF", "KRE", "ITA", "JETS", "XLP", "FXI", "DBA",
] as const;

export const HEDGE_LIMITS = {
  grossNotionalMaxPctNav: 0.3,
  singleActionMaxPctNav: 0.1,
  advMaxFraction: 0.01,
} as const;

export const MAX_TOOL_ITERATIONS = 6;

// Agents and API (SPEC 5.5, 5.7, 7)

export const MAX_QUERY_LENGTH = 500;
export const MAX_CONCURRENT_RUNS = 2;

export const NODE_ORDER = [
  "planner",
  "event",
  "weather",
  "sentiment",
  "macro",
  "analogs",
  "risk",
  "hedging",
  "synthesizer",
  "verifier",
] as const;

/** Edges of the fixed agent graph, for the UI. The verifier loops back to the synthesizer once. */
export const GRAPH_EDGES = [
  ["planner", "event"],
  ["event", "weather"],
  ["event", "sentiment"],
  ["event", "macro"],
  ["weather", "analogs"],
  ["sentiment", "analogs"],
  ["macro", "analogs"],
  ["analogs", "risk"],
  ["risk", "hedging"],
  ["hedging", "synthesizer"],
  ["synthesizer", "verifier"],
] as const;

/** USD per million tokens (SPEC 5.7). */
export const MODEL_PRICES: Readonly<Record<string, { in: number; out: number }>> = {
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};

export const DEFAULT_MODEL_REASONING = "claude-sonnet-5-5";
export const DEFAULT_MODEL_FAST = "claude-haiku-4-5";

export const MAX_TOKENS = {
  planner: 4_000,
  eventClassification: 2_000,
  notes: 2_000,
  scoring: 4_000,
  hedging: 16_000,
  synthesizer: 16_000,
} as const;

/** Strings allowed to contain digits in LLM-authored text (SPEC 5.6). Longer entries first: the verifier
 * strips them in order. */
export const NUMERIC_ALLOWLIST = ["20+ Year Treasury", "Phillips 66", "S&P 500", "737 MAX 9", "737 MAX", "COVID-19", "G20", "G7"] as const;

export const FIXTURE_SOURCE = "fixture";

// Replay (SPEC 5.12)

export interface ReplayPreset {
  /** Same id as the analog event. */
  id: string;
  type: EventType;
  name: string;
  year: number;
  /** null for hurricanes, which use the landfall rule instead. */
  firstReportAt: string | null;
  asOf: string;
  /** false until Track A confirms `firstReportAt` against a source (ROADMAP section 2, check 15). */
  confirmed: boolean;
}

// Curated presets: asOf = firstReportAt + 24 hours (`feature_at`). The times below are provisional
// starting points; Track A replaces each with the sourced value and sets `confirmed`.
export const REPLAY_PRESETS: readonly ReplayPreset[] = [
  {
    id: "geopolitical-russia-ukraine-2022",
    type: "geopolitical",
    name: "Russia invades Ukraine",
    year: 2022,
    firstReportAt: "2022-02-24T03:00:00.000Z",
    asOf: "2022-02-25T03:00:00.000Z",
    confirmed: false,
  },
  {
    id: "disaster-hurricane-ida-2021",
    type: "disaster",
    name: "Hurricane Ida",
    year: 2021,
    firstReportAt: null,
    asOf: "2021-08-27T21:00:00.000Z",
    confirmed: true,
  },
  {
    id: "supply-opec-cut-2023",
    type: "supply_shock",
    name: "OPEC+ surprise production cut",
    year: 2023,
    firstReportAt: "2023-04-02T13:00:00.000Z",
    asOf: "2023-04-03T13:00:00.000Z",
    confirmed: false,
  },
  {
    id: "policy-us-tariffs-2025",
    type: "policy",
    name: 'US "Liberation Day" tariffs',
    year: 2025,
    firstReportAt: "2025-04-02T20:00:00.000Z",
    asOf: "2025-04-03T20:00:00.000Z",
    confirmed: false,
  },
  {
    id: "corporate-svb-2023",
    type: "corporate",
    name: "Silicon Valley Bank collapse",
    year: 2023,
    firstReportAt: "2023-03-08T21:30:00.000Z",
    asOf: "2023-03-09T21:30:00.000Z",
    confirmed: false,
  },
  {
    id: "accident-boeing-door-2024",
    type: "accident",
    name: "Alaska Airlines 737 MAX 9 door-plug blowout",
    year: 2024,
    firstReportAt: "2024-01-06T01:30:00.000Z",
    asOf: "2024-01-07T01:30:00.000Z",
    confirmed: false,
  },
];
export const DEFAULT_REPLAY_PRESET_ID = "geopolitical-russia-ukraine-2022";

export const EXAMPLE_QUERIES = [
  "How will the Russian invasion of Ukraine affect our portfolio?",
  "How will the forecasted Category 4 hurricane in the Gulf of Mexico affect our current energy holdings?",
  "Our competitor just had a refinery explosion: what is our exposure?",
  "What if China blockades Taiwan?",
  "What is moving our portfolio today?",
  "What if it only reaches Category 2?",
] as const;

// Ingestion (SPEC 5.2, 5.3)

export const PINECONE_UPSERT_BATCH = 96;
export const ENRICH_BATCH = 20;
export const ENRICH_DAILY_MAX = 2_000;
export const AV_DAILY_MAX = 24;
export const NEWS_SUMMARY_MAX_CHARS = 1_500;
