import type { AssetClass, Sector } from "./schemas/common";

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

const equity = (
  symbol: string,
  name: string,
  sector: Sector,
  demoWeight: number | null,
): UniverseEntry => ({
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
  equity("XOM", "Exxon Mobil", "integrated", 0.14),
  equity("CVX", "Chevron", "integrated", 0.1),
  equity("OXY", "Occidental Petroleum", "e&p", null),
  equity("MUR", "Murphy Oil", "e&p", 0.05),
  equity("VLO", "Valero Energy", "refiner", 0.12),
  equity("MPC", "Marathon Petroleum", "refiner", 0.1),
  equity("PSX", "Phillips 66", "refiner", 0.08),
  equity("PBF", "PBF Energy", "refiner", 0.04),
  etf("XLE", "Energy Select Sector SPDR", "energy_etf", 0.12),
  etf("XOP", "SPDR S&P Oil & Gas E&P", "energy_etf", null),
  etf("CRAK", "VanEck Oil Refiners", "energy_etf", null),
  etf("USO", "United States Oil Fund", "commodity_proxy", 0.05, "WTI"),
  etf("BNO", "United States Brent Oil Fund", "commodity_proxy", null, "BRENT"),
  etf("UNG", "United States Natural Gas Fund", "commodity_proxy", null, "HH_NATGAS"),
  etf("UGA", "United States Gasoline Fund", "commodity_proxy", null, "GULF_GASOLINE"),
  etf("JETS", "U.S. Global Jets", "airlines", 0.05),
  etf("SPY", "SPDR S&P 500", "market", 0.1),
  factor("GULF_GASOLINE", "US Gulf Coast conventional gasoline spot", "DGASUSGULF"),
  factor("WTI", "WTI crude spot", "DCOILWTICO"),
  factor("BRENT", "Brent crude spot", "DCOILBRENTEU"),
  factor("HH_NATGAS", "Henry Hub natural gas spot", "DHHNGSP"),
];

export const UNIVERSE_SYMBOLS: readonly string[] = UNIVERSE.map((u) => u.symbol);
export const FACTOR_SYMBOLS: readonly string[] = UNIVERSE.filter((u) => u.sector === "factor").map(
  (u) => u.symbol,
);
/** Forecast targets (SPEC 5.9): 5-trading-day forward log returns. */
export const FORECAST_TARGETS = ["GULF_GASOLINE", "WTI", "HH_NATGAS"] as const;
/** Regression factors for betas (SPEC 5.10). */
export const BETA_FACTORS = ["SPY", "GULF_GASOLINE", "WTI", "HH_NATGAS"] as const;

export const ENERGY_SLEEVE_SECTORS: readonly Sector[] = [
  "integrated",
  "e&p",
  "refiner",
  "energy_etf",
  "commodity_proxy",
];
export const REFINER_SYMBOLS = ["VLO", "MPC", "PSX", "PBF"] as const;

export const DEMO_PORTFOLIO = {
  name: "Gulf Coast Energy Fund",
  nav: 10_000_000,
  positions: UNIVERSE.filter((u) => u.demoWeight !== null).map((u) => ({
    symbol: u.symbol,
    targetWeight: u.demoWeight as number,
  })),
} as const;

export const MACRO_SERIES = [
  "WGTSTUS1",
  "WCESTUS1",
  "VIXCLS",
  "DGS10",
  "DFF",
  "DTWEXBGS",
] as const;

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

// Quant (SPEC 5.9, 5.10)

export const KNN_BANDWIDTH = 1.0;
export const BETA_LOOKBACK_DAYS = 252;
export const VAR_LOOKBACK_DAYS = 504;
export const VAR_CONFIDENCE = 0.95;
export const MIN_COMMODITY_R2 = 0.1;
export const MIN_GAMMA_EVENTS = 10;
export const DIRECTION_EPSILON = 0.0025;
export const LOOSE_TIGHT_INVENTORY = 0.03;
export const VIX_ELEVATED = 18;
export const VIX_STRESSED = 25;

// Hedging (SPEC 5.11)

export const HEDGE_MENU = ["XLE", "XOP", "CRAK", "USO", "BNO", "UNG", "UGA", "SPY", "JETS"] as const;

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
  ["planner", "weather"],
  ["planner", "sentiment"],
  ["planner", "macro"],
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
  notes: 2_000,
  scoring: 4_000,
  hedging: 16_000,
  synthesizer: 16_000,
} as const;

/** Strings allowed to contain digits in LLM-authored text (SPEC 5.6). */
export const NUMERIC_ALLOWLIST = ["S&P 500"] as const;

export const FIXTURE_SOURCE = "fixture";

// Replay (SPEC 5.12)

export interface ReplayPreset {
  /** Same id as the analog event. */
  id: string;
  name: string;
  season: number;
  asOf: string;
}

export const REPLAY_PRESETS: readonly ReplayPreset[] = [
  { id: "hurricane-ida-2021", name: "Hurricane Ida", season: 2021, asOf: "2021-08-27T21:00:00.000Z" },
  { id: "hurricane-laura-2020", name: "Hurricane Laura", season: 2020, asOf: "2020-08-25T21:00:00.000Z" },
  { id: "hurricane-harvey-2017", name: "Hurricane Harvey", season: 2017, asOf: "2017-08-24T21:00:00.000Z" },
  { id: "hurricane-francine-2024", name: "Hurricane Francine", season: 2024, asOf: "2024-09-10T21:00:00.000Z" },
];
export const DEFAULT_REPLAY_PRESET_ID = "hurricane-ida-2021";

export const EXAMPLE_QUERIES = [
  "How will the forecasted Category 4 hurricane in the Gulf of Mexico affect our current energy holdings?",
  "What if a Category 4 hits Port Arthur in 48 hours?",
  "What if it only reaches Category 2?",
] as const;

// Ingestion (SPEC 5.2, 5.3)

/** GDELT queries for live ingestion and replay news. Teams may refine these; log changes in DECISIONS.md. */
export const NEWS_QUERIES = [
  '(hurricane OR "tropical storm") (refinery OR refineries) sourcelang:english',
  '(hurricane OR "tropical storm") (oil OR gasoline OR "crude oil") sourcelang:english',
  '(hurricane OR "tropical storm") ("natural gas" OR LNG) sourcelang:english',
] as const;

export const SENTIMENT_QUERY =
  '(hurricane OR "tropical storm") (oil OR refinery OR gasoline OR "natural gas") sourcelang:english';

export const PINECONE_UPSERT_BATCH = 96;
export const ENRICH_BATCH = 20;
export const NEWS_SUMMARY_MAX_CHARS = 1_500;

/** Rule-based ticker tagging: lower-case aliases matched in the title (SPEC 5.2). */
export const TICKER_ALIASES: Readonly<Record<string, readonly string[]>> = {
  XOM: ["exxon", "exxonmobil", "xom"],
  CVX: ["chevron", "cvx"],
  OXY: ["occidental", "oxy"],
  MUR: ["murphy oil", "mur"],
  VLO: ["valero", "vlo"],
  MPC: ["marathon petroleum", "mpc"],
  PSX: ["phillips 66", "psx"],
  PBF: ["pbf energy", "pbf"],
  XLE: ["xle", "energy select sector"],
  XOP: ["xop"],
  CRAK: ["crak"],
  USO: ["uso"],
  BNO: ["bno"],
  UNG: ["ung"],
  UGA: ["uga"],
  JETS: ["jets etf"],
  SPY: ["spy", "s&p 500"],
};
