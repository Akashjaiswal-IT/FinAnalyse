import type {
  Answer,
  AnalogsOutput,
  EventOutput,
  EventProfile,
  Evidence,
  HedgePlan,
  HedgingOutput,
  MacroOutput,
  Plan,
  RiskOutput,
  RiskReport,
  RiskSnapshot,
  RunEvent,
  SentimentOutput,
  Verification,
  WeatherOutput,
} from "../schemas";
import { evidenceFactory, templater, usage } from "./build";
import { FIXTURE_AS_OF_UKRAINE, FIXTURE_PRICES } from "./portfolio";

// A complete, hand-built run for the Ukraine replay (a geopolitical event; the weather node is skipped).
// Every value is fixture data, not a market or model result: evidence rows carry source "fixture".

export const FIXTURE_RUN_ID_UKRAINE = "00000000-0000-4000-8000-0000000000a2";
export const FIXTURE_THREAD_ID_UKRAINE = "00000000-0000-4000-8000-0000000000b2";
export const FIXTURE_QUERY_UKRAINE = "How will the Russian invasion of Ukraine affect our portfolio?";

const T0 = Date.parse("2026-10-03T08:10:00.000Z");
const at = (offsetMs: number) => new Date(T0 + offsetMs).toISOString();
const ev = evidenceFactory("fixtures/ukraine-run", FIXTURE_AS_OF_UKRAINE);
const GDELT_QUERY = "(invasion OR war) (Russia OR Ukraine) sourcelang:english";

const E = {
  event: [
    ev("E1", "event", "Event", null, "text", "event", { textValue: "Russia invades Ukraine", basis: "observed" }),
    ev("E2", "event", "News volume z-score", 6.8, "z", "event", { sourceRef: GDELT_QUERY }),
    ev("E3", "event", "News tone z-score", -3.1, "z", "event", { sourceRef: GDELT_QUERY }),
    ev("E4", "event", "Articles in the first day of coverage", 2_140, "count", "event", { basis: "observed" }),
  ],
  sentiment: [
    ev("E5", "model", "Defense news sentiment", 0.42, "score", "sentiment", { basis: "model" }),
    ev("E6", "model", "Airline news sentiment", -0.55, "score", "sentiment", { basis: "model" }),
  ],
  macro: [
    ev("E7", "macro", "VIX level", 30.3, "ratio", "macro", { basis: "observed" }),
    ev("E8", "macro", "VIX z-score", 2.4, "z", "macro"),
  ],
  analogs: [
    ev("E9", "model", "Forecast 5-day move, WTI crude", 0.074, "pct_signed", "analogs", { basis: "model" }),
    ev("E10", "model", "Forecast 5-day move, gold (GLD)", 0.031, "pct_signed", "analogs", { basis: "model" }),
    ev("E11", "model", "Forecast 5-day move, S&P 500 (SPY)", -0.018, "pct_signed", "analogs", { basis: "model" }),
    ev("E12", "model", "Forecast 5-day move, Lockheed Martin", 0.052, "pct_signed", "analogs", { basis: "model" }),
    ev("E13", "model", "Forecast 5-day move, Delta Air Lines", -0.061, "pct_signed", "analogs", { basis: "model" }),
    ev("E14", "model", "Effective number of analog events", 3.6, "ratio", "analogs", { basis: "model" }),
  ],
  risk: [
    ev("E15", "portfolio", "Portfolio NAV", 10_000_000, "usd", "risk", { basis: "observed" }),
    ev("E16", "computation", "1-day 95% VaR", 236_000, "usd", "risk"),
    ev("E17", "computation", "Scenario P&L before hedges", -142_000, "usd", "risk"),
    ev("E18", "computation", "Holdings with direct exposure", 500_000, "usd", "risk"),
    ev("E19", "computation", "Holdings with factor exposure", 7_600_000, "usd", "risk"),
    ev("E20", "computation", "Delta Air Lines beta to WTI", -0.6, "ratio", "risk"),
  ],
  hedging: [
    ev("E21", "computation", "Scenario P&L after hedges", -61_000, "usd", "hedging"),
    ev("E22", "computation", "Gross hedge notional", 1_434_900, "usd", "hedging"),
  ],
} as const;

export const ukraineEvidence: Evidence[] = Object.values(E).flat();
const { tt, finding } = templater(ukraineEvidence);

const plan: Plan = {
  intent: "event_impact",
  event: {
    source: "replay",
    type: "geopolitical",
    subtype: "war",
    name: "Russian invasion of Ukraine",
    entities: [],
    externalNames: [],
    marketEventId: null,
    stormId: null,
    stormName: null,
    hypothetical: null,
    hypotheticalStorm: null,
    categoryOverride: null,
  },
  focusSymbols: [],
  focusSectors: [],
  horizonDays: 5,
  specialists: { weather: false, sentiment: true, macro: true, analogs: true },
  reallocation: false,
  source: "model",
};

export const ukraineEventProfile: EventProfile = {
  id: "geopolitical-russia-ukraine-2022",
  source: "replay",
  type: "geopolitical",
  subtype: "war",
  title: "Russia invades Ukraine",
  firstReportAt: "2022-02-24T03:00:00.000Z",
  entities: ["LMT", "RTX"],
  externalNames: [],
  peerSymbols: [],
  affectedSectors: ["defense", "energy", "airlines"],
  factorDirections: [
    { factor: "WTI", direction: "up" },
    { factor: "HH_NATGAS", direction: "up" },
    { factor: "GOLD", direction: "up" },
    { factor: "MARKET", direction: "down" },
  ],
  articleCount: 2_140,
  domainCount: 410,
  gdeltQuery: GDELT_QUERY,
  volZ: 6.8,
  toneZ: -3.1,
  newsBasis: "observed",
  severity: "high",
  topNewsIds: ["00000000-0000-4000-8000-000000000111", "00000000-0000-4000-8000-000000000112"],
};

const event: EventOutput = {
  status: "ok",
  profile: ukraineEventProfile,
  others: [],
  findings: [finding("{{E1}} dominates the news: {{E4}} articles, volume z-score {{E2}}, tone z-score {{E3}}.", ["E1", "E4", "E2", "E3"])],
};

const weather: WeatherOutput = { status: "skipped" };

const sentiment: SentimentOutput = {
  status: "ok",
  sectors: [
    { sector: "defense", score: 0.42, n: 6 },
    { sector: "airlines", score: -0.55, n: 4 },
    { sector: "energy", score: 0.12, n: 5 },
  ],
  peerGroups: [{ symbols: ["LMT", "RTX"], score: 0.42, n: 6 }],
  holdings: [
    { symbol: "LMT", score: 0.45, n: 4 },
    { symbol: "RTX", score: 0.38, n: 2 },
    { symbol: "DAL", score: -0.6, n: 2 },
  ],
  gdelt: { toneZ: -3.1, volZ: 6.8 },
  newsIds: ["00000000-0000-4000-8000-000000000111", "00000000-0000-4000-8000-000000000113"],
  findings: [finding("Defense sentiment is {{E5}} while airline sentiment is {{E6}}.", ["E5", "E6"])],
};

const macro: MacroOutput = {
  status: "ok",
  snapshot: {
    asOf: FIXTURE_AS_OF_UKRAINE,
    gasolineStocks: { value: 246_500, fiveYearAvg: 244_000, deviation: 0.01, flag: "normal" },
    crudeStocks: { value: 413_400, fiveYearAvg: 449_000, deviation: -0.08, flag: "tight" },
    vix: { value: 30.3, z: 2.4, flag: "stressed" },
    yield10y: { value: 1.96, change20d: 0.12 },
    dollarIndex: { value: 115.6, change20d: 0.6 },
    fedFunds: 0.08,
  },
  findings: [finding("Volatility is stressed: the VIX is {{E7}}, a z-score of {{E8}}.", ["E7", "E8"])],
};

const reaction = (d1: number, d5: number, d20: number) => ({ d1, d5, d20 });
const fc = (mean: number, spread: number, n: number) => ({ mean, spread, n });
const hfc = (mean: number, spread: number, n: number) => ({ mean, spread, n, fallback: false });

const abqaiq = {
  eventId: "geopolitical-abqaiq-attack-2019",
  name: "Abqaiq attack",
  type: "geopolitical" as const,
  similarity: 0.79,
  weight: 0.85,
  realized: { WTI: reaction(0.13, 0.07, -0.02), GLD: reaction(0.0, 0.01, 0.02), SPY: reaction(-0.003, -0.01, 0.01) },
};
const soleimani = {
  eventId: "geopolitical-soleimani-strike-2020",
  name: "Soleimani strike",
  type: "geopolitical" as const,
  similarity: 0.74,
  weight: 0.7,
  realized: { WTI: reaction(0.03, -0.05, -0.12), GLD: reaction(0.01, 0.02, 0.01), SPY: reaction(-0.007, 0.01, 0.02) },
};
const colonial = {
  eventId: "accident-colonial-pipeline-2021",
  name: "Colonial Pipeline cyberattack",
  type: "accident" as const,
  similarity: 0.52,
  weight: 0.25,
  realized: { WTI: reaction(0.0, 0.01, 0.02) },
};
const covid = {
  eventId: "macro-covid-demand-collapse-2020",
  name: "COVID-19 demand collapse",
  type: "macro" as const,
  similarity: 0.48,
  weight: 0.2,
  realized: { WTI: reaction(-0.25, -0.2, -0.4), GLD: reaction(-0.01, -0.02, 0.01), SPY: reaction(-0.08, -0.1, -0.2) },
};

const analogs: AnalogsOutput = {
  status: "ok",
  forecast: {
    variant: "combined",
    groupsUsed: ["type", "news", "regime"],
    newsBasis: "observed",
    bandwidth: 1,
    typeWeight: 1.5,
    effectiveN: 3.6,
    targets: {
      WTI: fc(0.074, 0.05, 5),
      GULF_GASOLINE: fc(0.066, 0.05, 5),
      HH_NATGAS: fc(0.045, 0.07, 5),
      GLD: fc(0.031, 0.02, 5),
      SPY: fc(-0.018, 0.025, 5),
      TLT: fc(0.006, 0.015, 5),
    },
    holdings: {
      LMT: hfc(0.052, 0.03, 4),
      RTX: hfc(0.04, 0.03, 4),
      DAL: hfc(-0.061, 0.04, 4),
      XOM: hfc(0.035, 0.03, 5),
      CVX: hfc(0.03, 0.03, 5),
      USO: hfc(0.07, 0.05, 5),
      GLD: hfc(0.031, 0.02, 5),
      NEM: hfc(0.028, 0.03, 5),
      SPY: hfc(-0.018, 0.025, 5),
    },
    analogs: [abqaiq, soleimani, colonial, covid],
  },
  parallels: { sameType: [abqaiq, soleimani], otherType: [colonial, covid] },
  findings: [finding("Similar past shocks (effective sample {{E14}}) point to WTI {{E9}} and gold {{E10}}.", ["E14", "E9", "E10"])],
};

const snapshot = (var1: number, cvar1: number, var5: number, cvar5: number, beta: number, pnl: number): RiskSnapshot => ({
  var1d: { var95: var1, cvar95: cvar1 },
  var5d: { var95: var5, cvar95: cvar5 },
  sleeveBeta: beta,
  scenarioPnl: pnl,
});

const before = snapshot(236_000, 331_000, 528_000, 742_000, 0.97, -142_000);
const after = snapshot(205_000, 288_000, 459_000, 645_000, 0.88, -61_000);

const factorLink = (detail: string, keys: string[]) => [
  { channel: "factor" as const, reason: "factor_beta" as const, detail, evidenceKeys: keys },
];
const marketDown = (symbol: string) => ({ symbol, channels: factorLink("MARKET", ["E11"]), expectedSign: "down" as const });

const riskReport: RiskReport = {
  asOf: FIXTURE_AS_OF_UKRAINE,
  nav: 10_000_000,
  var1d: before.var1d,
  var5d: before.var5d,
  exposures: [
    { holding: "LMT", factor: "MARKET", beta: 0.62, r2: 0.21 },
    { holding: "DAL", factor: "WTI", beta: -0.6, r2: 0.18 },
    { holding: "XOM", factor: "WTI", beta: 0.48, r2: 0.41 },
    { holding: "NEM", factor: "GOLD", beta: 1.1, r2: 0.55 },
    { holding: "NVDA", factor: "MARKET", beta: 1.6, r2: 0.48 },
  ],
  topFactorExposures: [
    { factor: "MARKET", beta: 0.97 },
    { factor: "WTI", beta: 0.18 },
    { factor: "GOLD", beta: 0.09 },
  ],
  channels: [
    { symbol: "LMT", channels: [{ channel: "direct", reason: "named_in_news", detail: "Lockheed Martin", evidenceKeys: ["E18"] }], expectedSign: "up" },
    { symbol: "RTX", channels: [{ channel: "direct", reason: "named_in_news", detail: "RTX", evidenceKeys: ["E18"] }], expectedSign: "up" },
    { symbol: "XOM", channels: factorLink("WTI", ["E9"]), expectedSign: "up" },
    { symbol: "CVX", channels: factorLink("WTI", ["E9"]), expectedSign: "up" },
    { symbol: "USO", channels: factorLink("WTI", ["E9"]), expectedSign: "up" },
    { symbol: "DAL", channels: factorLink("WTI", ["E20", "E9"]), expectedSign: "down" },
    { symbol: "GLD", channels: factorLink("GOLD", ["E10"]), expectedSign: "up" },
    { symbol: "NEM", channels: factorLink("GOLD", ["E10"]), expectedSign: "up" },
    ...["SPY", "MSFT", "AAPL", "NVDA", "TSM", "JPM", "BAC", "BA"].map(marketDown),
  ],
  exposedValue: [
    { channel: "direct", value: 500_000 },
    { channel: "peer", value: 0 },
    { channel: "factor", value: 7_600_000 },
  ],
  correlations: {
    symbols: ["LMT", "DAL", "SPY"],
    matrix: [
      [1, 0.21, 0.48],
      [0.21, 1, 0.55],
      [0.48, 0.55, 1],
    ],
  },
  scenario: {
    pnl: -142_000,
    pctNav: -0.0142,
    perHolding: [
      { symbol: "LMT", pnl: 16_000 },
      { symbol: "RTX", pnl: 8_000 },
      { symbol: "XOM", pnl: 14_000 },
      { symbol: "CVX", pnl: 9_000 },
      { symbol: "USO", pnl: 14_000 },
      { symbol: "GLD", pnl: 15_000 },
      { symbol: "NEM", pnl: 6_000 },
      { symbol: "DAL", pnl: -12_000 },
      { symbol: "SPY", pnl: -22_000 },
      { symbol: "MSFT", pnl: -34_000 },
      { symbol: "AAPL", pnl: -28_000 },
      { symbol: "NVDA", pnl: -40_000 },
      { symbol: "TSM", pnl: -22_000 },
      { symbol: "JPM", pnl: -30_000 },
      { symbol: "BAC", pnl: -20_000 },
      { symbol: "BA", pnl: -16_000 },
    ],
    perSector: [
      { sector: "defense", pnl: 24_000 },
      { sector: "energy", pnl: 23_000 },
      { sector: "commodity_proxy", pnl: 14_000 },
      { sector: "gold", pnl: 21_000 },
      { sector: "airlines", pnl: -12_000 },
      { sector: "market", pnl: -22_000 },
      { sector: "tech", pnl: -62_000 },
      { sector: "semis", pnl: -62_000 },
      { sector: "banks", pnl: -50_000 },
      { sector: "aerospace", pnl: -16_000 },
    ],
    perChannel: [
      { channel: "direct", pnl: 24_000 },
      { channel: "peer", pnl: 0 },
      { channel: "factor", pnl: -166_000 },
    ],
  },
  analogPnl: { weightedMean: -118_000, worst: -265_000, n: 3 },
};
const risk: RiskOutput = { status: "ok", report: riskReport };

const price = (s: string) => FIXTURE_PRICES[s] ?? 0;

const hedgePlan: HedgePlan = {
  source: "model",
  summary: tt("Gross hedge notional of {{E22}} lowers the scenario loss to {{E21}}."),
  grossNotional: 1_434_900,
  before,
  after,
  violations: [],
  actions: [
    {
      type: "reallocation",
      symbol: "DAL",
      side: "sell",
      quantity: 2_500,
      notional: 2_500 * price("DAL"),
      timing: "now",
      orderType: "market",
      exitTrigger: tt("Rebuild when oil retraces below its pre-invasion level."),
      rationale: tt("Airlines are forecast {{E13}} as oil rises {{E9}}."),
      evidenceKeys: ["E13", "E9"],
    },
    {
      type: "hedge",
      symbol: "USO",
      side: "buy",
      quantity: 10_000,
      notional: 10_000 * price("USO"),
      timing: "staged",
      orderType: "limit",
      exitTrigger: tt("Sell after five trading days or once the forecast move is realised."),
      rationale: tt("Analogs forecast WTI {{E9}}; long oil offsets fuel-cost pressure on airlines."),
      evidenceKeys: ["E9"],
    },
    {
      type: "hedge",
      symbol: "SPY",
      side: "sell",
      quantity: 1_900,
      notional: 1_900 * price("SPY"),
      timing: "now",
      orderType: "market",
      exitTrigger: tt("Cover when the VIX falls back below its long-run average."),
      rationale: tt("The S&P 500 forecast is {{E11}} with volatility stressed (VIX {{E7}})."),
      evidenceKeys: ["E11", "E7"],
    },
  ],
};
const hedging: HedgingOutput = { status: "ok", plan: hedgePlan };

const answer: Answer = {
  headline: tt("{{E1}} is the dominant geopolitical shock in the news (volume z-score {{E2}}), with oil forecast {{E9}} over five trading days."),
  summary: tt(
    "Defense names are directly exposed, and oil, gold and the broad market reach the portfolio through factor channels touching holdings worth {{E19}}. The scenario loss is {{E17}} on a {{E15}} portfolio; the proposed hedges cut it to {{E21}}.",
  ),
  bullets: [
    {
      text: tt("Lockheed Martin and RTX are named in the coverage: holdings worth {{E18}} carry direct exposure, defense sentiment is {{E5}} and Lockheed Martin is forecast {{E12}}."),
      evidenceKeys: ["E18", "E5", "E12"],
    },
    { text: tt("Similar past shocks (effective sample {{E14}}) point to WTI {{E9}}, gold {{E10}} and the S&P 500 {{E11}}."), evidenceKeys: ["E14", "E9", "E10", "E11"] },
    { text: tt("Delta Air Lines moves against oil (beta {{E20}}) and is forecast {{E13}}; airline sentiment is {{E6}}."), evidenceKeys: ["E20", "E13", "E6"] },
    { text: tt("Volatility is stressed: the VIX is {{E7}}, a z-score of {{E8}}."), evidenceKeys: ["E7", "E8"] },
    { text: tt("Trim Delta, buy USO and sell SPY: gross hedge notional {{E22}} cuts the scenario loss to {{E21}}."), evidenceKeys: ["E21", "E22"] },
  ],
  caveats: [
    tt("The forecast starts after the first day of coverage, so it describes the move after the initial reaction."),
    tt("The weather agent did not run: this is not a weather event."),
    tt("Fixture data: values in this run are hand-built for interface development and are not market data."),
  ],
  confidence: "medium",
  badges: { replay: true, hypothetical: false },
  source: "model",
};

const verification: Verification = {
  passed: true,
  repairAttempted: false,
  checks: [
    { name: "placeholders", passed: true, violations: [] },
    { name: "digits", passed: true, violations: [] },
    { name: "hedge_limits", passed: true, violations: [] },
    { name: "universe", passed: true, violations: [] },
    { name: "caveats", passed: true, violations: [] },
  ],
  appendedCaveats: [],
};

/** Node output per node, as carried by `step.completed`. */
export const ukraineNodeOutputs = {
  planner: plan,
  event,
  weather,
  sentiment,
  macro,
  analogs,
  risk,
  hedging,
  synthesizer: answer,
  verifier: verification,
};

export const ukraineRunEvents: RunEvent[] = [
  { type: "run.started", runId: FIXTURE_RUN_ID_UKRAINE, mode: "replay", asOf: FIXTURE_AS_OF_UKRAINE, query: FIXTURE_QUERY_UKRAINE },

  { type: "step.started", node: "planner", at: at(100) },
  {
    type: "step.completed", node: "planner", status: "done", durationMs: 1_600,
    summary: "Geopolitical event impact on the whole portfolio; weather not needed.",
    output: plan,
    usage: usage("claude-sonnet-5-5", 2_300, 290, 0.0075),
    thinkingSummary: "The question names the invasion and the whole portfolio; replay mode supplies the Ukraine preset.",
  },

  { type: "step.started", node: "event", at: at(1_750) },
  {
    type: "step.completed", node: "event", status: "done", durationMs: 800,
    summary: "Geopolitical event from the Ukraine preset; severity high.",
    output: event,
  },
  { type: "evidence.added", evidence: [...E.event] },

  { type: "step.started", node: "weather", at: at(2_600) },
  { type: "step.started", node: "sentiment", at: at(2_610) },
  { type: "step.started", node: "macro", at: at(2_620) },
  { type: "step.completed", node: "weather", status: "skipped", durationMs: 0, summary: "Not a weather event.", output: weather },
  {
    type: "step.completed", node: "sentiment", status: "done", durationMs: 3_300,
    summary: "Defense sentiment positive, airlines negative.",
    output: sentiment,
    usage: usage("claude-haiku-4-5", 1_400, 130, 0.0021),
  },
  { type: "evidence.added", evidence: [...E.sentiment] },
  {
    type: "step.completed", node: "macro", status: "done", durationMs: 1_000,
    summary: "Volatility is stressed.",
    output: macro,
    usage: usage("claude-haiku-4-5", 650, 90, 0.0011),
  },
  { type: "evidence.added", evidence: [...E.macro] },

  { type: "step.started", node: "analogs", at: at(6_000) },
  {
    type: "step.completed", node: "analogs", status: "done", durationMs: 1_900,
    summary: "Two geopolitical analogs; oil and gold forecast up, market down.",
    output: analogs,
    usage: usage("claude-haiku-4-5", 1_200, 110, 0.0018),
  },
  { type: "evidence.added", evidence: [...E.analogs] },

  { type: "step.started", node: "risk", at: at(8_000) },
  { type: "step.completed", node: "risk", status: "done", durationMs: 500, summary: "Direct and factor channels; scenario loss computed.", output: risk },
  { type: "evidence.added", evidence: [...E.risk] },

  { type: "step.started", node: "hedging", at: at(8_600) },
  { type: "step.progress", node: "hedging", message: "Simulating three actions" },
  {
    type: "step.completed", node: "hedging", status: "done", durationMs: 9_800,
    summary: "Three actions within limits cut the scenario loss.",
    output: hedging,
    usage: usage("claude-sonnet-5-5", 6_100, 1_450, 0.0267),
    thinkingSummary: "Airlines carry the oil risk and the market leg dominates, so trim Delta, add oil and hedge the index.",
  },
  { type: "evidence.added", evidence: [...E.hedging] },

  { type: "step.started", node: "synthesizer", at: at(18_500) },
  {
    type: "step.completed", node: "synthesizer", status: "done", durationMs: 6_300,
    summary: "Answer drafted with evidence placeholders.",
    output: answer,
    usage: usage("claude-sonnet-5-5", 7_400, 1_150, 0.0263),
  },
  { type: "step.started", node: "verifier", at: at(24_850) },
  { type: "step.completed", node: "verifier", status: "done", durationMs: 30, summary: "All grounding checks passed.", output: verification },

  {
    type: "run.completed",
    status: "succeeded",
    answer,
    eventProfile: ukraineEventProfile,
    hedgePlan,
    risk: riskReport,
    forecast: analogs.status === "ok" ? analogs.forecast : null,
    confidence: "medium",
    warnings: [],
    totals: { tokensIn: 19_050, tokensOut: 3_220, costUsd: 0.0655, durationMs: 24_900 },
  },
];
