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
import { FIXTURE_AS_OF, FIXTURE_PRICES } from "./portfolio";
import { fixtureAtRiskRefineries, fixtureStorm } from "./storm";

// A complete, hand-built run for the Ida replay (a disaster event). Every value is fixture data, not a
// market or model result: evidence rows carry source "fixture". Track D builds the terminal against it.

export const FIXTURE_RUN_ID = "00000000-0000-4000-8000-0000000000a1";
export const FIXTURE_THREAD_ID = "00000000-0000-4000-8000-0000000000b1";
export const FIXTURE_QUERY =
  "How will the forecasted Category 4 hurricane in the Gulf of Mexico affect our current energy holdings?";

const T0 = Date.parse("2026-10-03T08:00:00.000Z");
const at = (offsetMs: number) => new Date(T0 + offsetMs).toISOString();
const ev = evidenceFactory("fixtures/ida-run", FIXTURE_AS_OF);
const GDELT_QUERY = '("Hurricane Ida" OR "Tropical Storm Ida") sourcelang:english';

const E = {
  planner: [
    ev("E1", "assumption", "Hurricane category stated in the question", 4, "category", "planner", {
      basis: "assumption",
      source: "user",
      sourceRef: "query",
    }),
  ],
  event: [
    ev("E2", "event", "Event", null, "text", "event", { textValue: "Hurricane Ida", basis: "observed" }),
    ev("E3", "event", "News volume z-score", 2.1, "z", "event", { sourceRef: GDELT_QUERY }),
    ev("E4", "event", "News tone z-score", -1.4, "z", "event", { sourceRef: GDELT_QUERY }),
  ],
  weather: [
    ev("E5", "weather", "Peak forecast category", 4, "category", "weather"),
    ev("E6", "weather", "Forecast landfall", Date.parse("2021-08-29T17:00:00.000Z"), "date", "weather"),
    ev("E7", "computation", "Refineries within the impact radius", 4, "count", "weather", {
      payload: { refineries: fixtureAtRiskRefineries.map((r) => r.id) },
    }),
    ev("E8", "computation", "Gulf Coast refining capacity at risk", 0.4, "pct", "weather"),
    ev("E9", "computation", "Valero capacity at risk", 0.31, "pct", "weather"),
  ],
  sentiment: [ev("E10", "model", "Energy-sector news sentiment", -0.31, "score", "sentiment", { basis: "model" })],
  macro: [
    ev("E11", "macro", "Gasoline stocks vs the 5-year same-week average", -0.04, "pct_signed", "macro", { basis: "observed" }),
    ev("E12", "macro", "VIX level", 17.9, "ratio", "macro", { basis: "observed" }),
  ],
  analogs: [
    ev("E13", "model", "Forecast 5-day move, Gulf Coast gasoline", 0.081, "pct_signed", "analogs", { basis: "model" }),
    ev("E14", "model", "Forecast 5-day move, WTI crude", 0.032, "pct_signed", "analogs", { basis: "model" }),
    ev("E15", "model", "Forecast 5-day move, Henry Hub natural gas", 0.021, "pct_signed", "analogs", { basis: "model" }),
    ev("E16", "model", "Effective number of analog events", 4.3, "ratio", "analogs", { basis: "model" }),
  ],
  risk: [
    ev("E17", "portfolio", "Portfolio NAV", 10_000_000, "usd", "risk", { basis: "observed" }),
    ev("E18", "computation", "1-day 95% VaR", 168_000, "usd", "risk"),
    ev("E19", "computation", "Scenario P&L before hedges", -58_000, "usd", "risk"),
    ev("E20", "computation", "Holdings with direct exposure", 1_300_000, "usd", "risk"),
    ev("E21", "computation", "Delta Air Lines beta to WTI", -0.6, "ratio", "risk"),
  ],
  hedging: [
    ev("E22", "computation", "Scenario P&L after hedges", -21_000, "usd", "hedging"),
    ev("E23", "computation", "Gross hedge notional", 501_900, "usd", "hedging"),
  ],
} as const;

export const idaEvidence: Evidence[] = Object.values(E).flat();
const { tt, finding } = templater(idaEvidence);

const plan: Plan = {
  intent: "event_impact",
  event: {
    source: "replay",
    type: "disaster",
    subtype: "hurricane",
    name: "Hurricane Ida",
    entities: [],
    externalNames: [],
    marketEventId: null,
    stormId: fixtureStorm.id,
    stormName: fixtureStorm.name,
    hypothetical: null,
    hypotheticalStorm: null,
    categoryOverride: null,
  },
  focusSymbols: [],
  focusSectors: ["energy", "refiner"],
  horizonDays: 5,
  specialists: { weather: true, sentiment: true, macro: true, analogs: true },
  reallocation: false,
  source: "model",
};

export const idaEventProfile: EventProfile = {
  id: "disaster-hurricane-ida-2021",
  source: "replay",
  type: "disaster",
  subtype: "hurricane",
  title: "Hurricane Ida",
  firstReportAt: "2021-08-26T18:00:00.000Z",
  entities: ["VLO", "MPC", "XOM"],
  externalNames: [],
  peerSymbols: ["CVX", "OXY", "PSX"],
  affectedSectors: ["energy", "refiner", "commodity_proxy"],
  factorDirections: [
    { factor: "GULF_GASOLINE", direction: "up" },
    { factor: "WTI", direction: "up" },
    { factor: "HH_NATGAS", direction: "up" },
  ],
  articleCount: 118,
  domainCount: 64,
  gdeltQuery: GDELT_QUERY,
  volZ: 2.1,
  toneZ: -1.4,
  newsBasis: "observed",
  severity: "medium",
  topNewsIds: ["00000000-0000-4000-8000-000000000101", "00000000-0000-4000-8000-000000000102"],
};

const event: EventOutput = {
  status: "ok",
  profile: idaEventProfile,
  others: [],
  findings: [finding("{{E2}} draws heavy coverage: news volume z-score {{E3}}, tone z-score {{E4}}.", ["E2", "E3", "E4"])],
};

const weather: WeatherOutput = {
  status: "ok",
  storm: fixtureStorm,
  forecastLabel: "perfect_forecast_replay",
  currentCategory: 1,
  peakCategory: 4,
  landfallAt: "2021-08-29T17:00:00.000Z",
  landfallRegion: "LA_SOUTHEAST",
  refineriesAtRisk: 4,
  gulfCapAtRisk: 0.4,
  companyCapAtRisk: { VLO: 0.31, MPC: 0.22, PSX: 0.12, XOM: 0.05 },
  atRisk: fixtureAtRiskRefineries,
  hubs: null,
  findings: [finding("{{E2}} is forecast to reach Category {{E5}}; {{E7}} refineries sit inside the impact radius.", ["E2", "E5", "E7"])],
};

const sentiment: SentimentOutput = {
  status: "ok",
  sectors: [
    { sector: "refiner", score: -0.45, n: 3 },
    { sector: "energy", score: -0.2, n: 4 },
  ],
  peerGroups: [{ symbols: ["VLO", "MPC", "PSX"], score: -0.45, n: 3 }],
  holdings: [
    { symbol: "VLO", score: -0.5, n: 1 },
    { symbol: "XOM", score: -0.4, n: 1 },
  ],
  gdelt: { toneZ: -1.4, volZ: 2.1 },
  newsIds: ["00000000-0000-4000-8000-000000000101", "00000000-0000-4000-8000-000000000102"],
  findings: [finding("Energy news sentiment is {{E10}} while coverage surges (volume z-score {{E3}}).", ["E10", "E3"])],
};

const macro: MacroOutput = {
  status: "ok",
  snapshot: {
    asOf: FIXTURE_AS_OF,
    gasolineStocks: { value: 226_000, fiveYearAvg: 235_400, deviation: -0.04, flag: "tight" },
    crudeStocks: { value: 431_000, fiveYearAvg: 440_000, deviation: -0.02, flag: "normal" },
    vix: { value: 17.9, z: -0.4, flag: "calm" },
    yield10y: { value: 1.31, change20d: -0.05 },
    dollarIndex: { value: 114.2, change20d: 0.4 },
    fedFunds: 0.09,
  },
  findings: [finding("Gasoline stocks are {{E11}} versus the five-year average and the VIX is {{E12}}.", ["E11", "E12"])],
};

const reaction = (d1: number, d5: number, d20: number) => ({ d1, d5, d20 });
const fc = (mean: number, spread: number, n: number) => ({ mean, spread, n });
const hfc = (mean: number, spread: number, n: number) => ({ mean, spread, n, fallback: false });

const laura = {
  eventId: "disaster-hurricane-laura-2020",
  name: "Hurricane Laura",
  type: "disaster" as const,
  similarity: 0.82,
  weight: 0.9,
  realized: { GULF_GASOLINE: reaction(0.02, 0.07, 0.03), WTI: reaction(0.0, 0.02, 0.01), HH_NATGAS: reaction(-0.01, 0.0, 0.03) },
};
const harvey = {
  eventId: "disaster-hurricane-harvey-2017",
  name: "Hurricane Harvey",
  type: "disaster" as const,
  similarity: 0.77,
  weight: 0.7,
  realized: { GULF_GASOLINE: reaction(0.04, 0.12, 0.09), WTI: reaction(0.01, 0.04, 0.02), HH_NATGAS: reaction(0.0, 0.03, 0.02) },
};
const colonial = {
  eventId: "accident-colonial-pipeline-2021",
  name: "Colonial Pipeline cyberattack",
  type: "accident" as const,
  similarity: 0.61,
  weight: 0.3,
  realized: { GULF_GASOLINE: reaction(0.03, 0.05, -0.01) },
};

const analogs: AnalogsOutput = {
  status: "ok",
  forecast: {
    variant: "combined",
    groupsUsed: ["type", "news", "regime", "weather"],
    newsBasis: "observed",
    bandwidth: 1,
    typeWeight: 1.5,
    effectiveN: 4.3,
    targets: {
      GULF_GASOLINE: fc(0.081, 0.03, 6),
      WTI: fc(0.032, 0.02, 6),
      HH_NATGAS: fc(0.021, 0.04, 6),
      SPY: fc(0.002, 0.01, 6),
      GLD: fc(0.001, 0.008, 6),
      TLT: fc(-0.002, 0.009, 6),
    },
    holdings: {
      VLO: hfc(-0.075, 0.04, 5),
      MPC: hfc(-0.065, 0.04, 5),
      XOM: hfc(-0.015, 0.02, 6),
      CVX: hfc(0.003, 0.02, 6),
      XLE: hfc(0.005, 0.02, 6),
      USO: hfc(0.015, 0.02, 6),
      DAL: hfc(-0.03, 0.03, 6),
    },
    analogs: [laura, harvey, colonial],
  },
  parallels: { sameType: [laura, harvey], otherType: [colonial] },
  findings: [finding("Historical analogs (effective sample {{E16}}) point to Gulf Coast gasoline {{E13}}.", ["E16", "E13"])],
};

const snapshot = (var1: number, cvar1: number, var5: number, cvar5: number, beta: number, pnl: number): RiskSnapshot => ({
  var1d: { var95: var1, cvar95: cvar1 },
  var5d: { var95: var5, cvar95: cvar5 },
  sleeveBeta: beta,
  scenarioPnl: pnl,
});

const before = snapshot(168_000, 236_000, 371_000, 520_000, 1.02, -58_000);
const after = snapshot(161_000, 226_000, 356_000, 499_000, 0.81, -21_000);

const riskReport: RiskReport = {
  asOf: FIXTURE_AS_OF,
  nav: 10_000_000,
  var1d: before.var1d,
  var5d: before.var5d,
  exposures: [
    { holding: "VLO", factor: "GULF_GASOLINE", beta: 0.62, r2: 0.34 },
    { holding: "XOM", factor: "WTI", beta: 0.48, r2: 0.41 },
    { holding: "XLE", factor: "WTI", beta: 0.55, r2: 0.52 },
    { holding: "USO", factor: "WTI", beta: 0.95, r2: 0.88 },
    { holding: "DAL", factor: "WTI", beta: -0.6, r2: 0.18 },
  ],
  topFactorExposures: [
    { factor: "MARKET", beta: 0.98 },
    { factor: "WTI", beta: 0.21 },
    { factor: "RATES", beta: -0.12 },
  ],
  channels: [
    { symbol: "VLO", channels: [{ channel: "direct", reason: "capacity_at_risk", detail: "Valero refineries in the impact radius", evidenceKeys: ["E9"] }], expectedSign: "down" },
    { symbol: "MPC", channels: [{ channel: "direct", reason: "capacity_at_risk", detail: "Marathon refineries in the impact radius", evidenceKeys: ["E8"] }], expectedSign: "down" },
    { symbol: "XOM", channels: [{ channel: "direct", reason: "capacity_at_risk", detail: "Exxon refinery in the impact radius", evidenceKeys: ["E8"] }], expectedSign: "unclear" },
    { symbol: "CVX", channels: [{ channel: "peer", reason: "peer_group", detail: "XOM", evidenceKeys: [] }], expectedSign: "unclear" },
    { symbol: "USO", channels: [{ channel: "factor", reason: "factor_beta", detail: "WTI", evidenceKeys: ["E14"] }], expectedSign: "up" },
    { symbol: "XLE", channels: [{ channel: "factor", reason: "factor_beta", detail: "WTI", evidenceKeys: ["E14"] }], expectedSign: "up" },
    { symbol: "DAL", channels: [{ channel: "factor", reason: "factor_beta", detail: "WTI", evidenceKeys: ["E21", "E14"] }], expectedSign: "down" },
  ],
  exposedValue: [
    { channel: "direct", value: 1_300_000 },
    { channel: "peer", value: 400_000 },
    { channel: "factor", value: 800_000 },
  ],
  correlations: {
    symbols: ["VLO", "XOM", "XLE"],
    matrix: [
      [1, 0.58, 0.66],
      [0.58, 1, 0.9],
      [0.66, 0.9, 1],
    ],
  },
  scenario: {
    pnl: -58_000,
    pctNav: -0.0058,
    perHolding: [
      { symbol: "VLO", pnl: -30_000 },
      { symbol: "MPC", pnl: -19_000 },
      { symbol: "XOM", pnl: -9_000 },
      { symbol: "DAL", pnl: -6_000 },
      { symbol: "USO", pnl: 3_000 },
      { symbol: "XLE", pnl: 2_000 },
      { symbol: "CVX", pnl: 1_000 },
    ],
    perSector: [
      { sector: "refiner", pnl: -49_000 },
      { sector: "energy", pnl: -6_000 },
      { sector: "airlines", pnl: -6_000 },
      { sector: "commodity_proxy", pnl: 3_000 },
    ],
    perChannel: [
      { channel: "direct", pnl: -58_000 },
      { channel: "peer", pnl: 1_000 },
      { channel: "factor", pnl: -1_000 },
    ],
  },
  analogPnl: { weightedMean: -47_000, worst: -96_000, n: 2 },
};
const risk: RiskOutput = { status: "ok", report: riskReport };

const price = (s: string) => FIXTURE_PRICES[s] ?? 0;

const hedgePlan: HedgePlan = {
  source: "model",
  summary: tt("Gross hedge notional of {{E23}} lowers the scenario loss to {{E22}}."),
  grossNotional: 501_900,
  before,
  after,
  violations: [],
  actions: [
    {
      type: "reallocation",
      symbol: "VLO",
      side: "sell",
      quantity: 1_350,
      notional: 1_350 * price("VLO"),
      timing: "before_event",
      orderType: "limit",
      exitTrigger: tt("Rebuild the position after refinery restarts are announced."),
      rationale: tt("Valero has {{E9}} of its capacity inside the impact radius."),
      evidenceKeys: ["E9"],
    },
    {
      type: "hedge",
      symbol: "CRAK",
      side: "sell",
      quantity: 10_000,
      notional: 10_000 * price("CRAK"),
      timing: "now",
      orderType: "market",
      exitTrigger: tt("Cover when the storm weakens below hurricane strength."),
      rationale: tt("Refiners carry the {{E8}} Gulf Coast capacity at risk."),
      evidenceKeys: ["E8", "E19"],
    },
    {
      type: "hedge",
      symbol: "UNG",
      side: "buy",
      quantity: 6_000,
      notional: 6_000 * price("UNG"),
      timing: "staged",
      orderType: "limit",
      exitTrigger: tt("Sell once the forecast move of {{E15}} is realised."),
      rationale: tt("Analogs forecast natural gas {{E15}} over five trading days."),
      evidenceKeys: ["E15"],
    },
  ],
};
const hedging: HedgingOutput = { status: "ok", plan: hedgePlan };

const answer: Answer = {
  headline: tt("{{E2}} is forecast to reach Category {{E5}} and make landfall on {{E6}}, putting {{E8}} of Gulf Coast refining capacity at risk."),
  summary: tt(
    "The model forecasts Gulf Coast gasoline {{E13}}, WTI {{E14}} and Henry Hub natural gas {{E15}} over five trading days. Holdings worth {{E20}} are directly exposed; the scenario loss is {{E19}} on a {{E17}} portfolio and the proposed hedges cut it to {{E22}}.",
  ),
  bullets: [
    { text: tt("{{E7}} refineries lie within the impact radius, including Valero exposure of {{E9}} of its capacity."), evidenceKeys: ["E7", "E9"] },
    { text: tt("Coverage is surging (news volume z-score {{E3}}) and energy news sentiment is {{E10}}."), evidenceKeys: ["E3", "E10"] },
    { text: tt("Gasoline stocks are {{E11}} versus the five-year average, so supply has less buffer."), evidenceKeys: ["E11"] },
    { text: tt("Historical analogs (effective sample {{E16}}) point to gasoline {{E13}}."), evidenceKeys: ["E13", "E16"] },
    { text: tt("Delta Air Lines moves against oil (beta {{E21}}), so higher fuel prices weigh on it."), evidenceKeys: ["E21"] },
    { text: tt("Trim Valero, sell CRAK and buy UNG: gross hedge notional {{E23}} cuts the scenario loss to {{E22}}."), evidenceKeys: ["E22", "E23"] },
  ],
  caveats: [
    tt("Replay uses the best track as the forecast (perfect-forecast replay), which is more accurate than the forecast available at the time."),
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
export const idaNodeOutputs = {
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

export const idaRunEvents: RunEvent[] = [
  { type: "run.started", runId: FIXTURE_RUN_ID, mode: "replay", asOf: FIXTURE_AS_OF, query: FIXTURE_QUERY },

  { type: "step.started", node: "planner", at: at(100) },
  {
    type: "step.completed", node: "planner", status: "done", durationMs: 1_800,
    summary: "Event impact on a replayed storm; all four specialists needed.",
    output: plan,
    usage: usage("claude-sonnet-5-5", 2_400, 310, 0.0079),
    thinkingSummary: "The question names a Category 4 Gulf hurricane and asks about current holdings; replay mode supplies Ida.",
  },
  { type: "evidence.added", evidence: [...E.planner] },

  { type: "step.started", node: "event", at: at(1_950) },
  {
    type: "step.completed", node: "event", status: "done", durationMs: 700,
    summary: "Disaster event from the Ida preset; severity medium.",
    output: event,
  },
  { type: "evidence.added", evidence: [...E.event] },

  { type: "step.started", node: "weather", at: at(2_700) },
  { type: "step.started", node: "sentiment", at: at(2_710) },
  { type: "step.started", node: "macro", at: at(2_720) },
  { type: "step.progress", node: "weather", message: "Building the Ida track and intersecting refineries" },
  {
    type: "step.completed", node: "weather", status: "done", durationMs: 2_400,
    summary: "Ida: 4 refineries within 100 km of the hurricane-force track.",
    output: weather,
    usage: usage("claude-haiku-4-5", 900, 140, 0.0016),
  },
  { type: "evidence.added", evidence: [...E.weather] },
  {
    type: "step.completed", node: "sentiment", status: "done", durationMs: 3_100,
    summary: "Energy and refiner sentiment is negative.",
    output: sentiment,
    usage: usage("claude-haiku-4-5", 1_300, 120, 0.0019),
  },
  { type: "evidence.added", evidence: [...E.sentiment] },
  {
    type: "step.completed", node: "macro", status: "done", durationMs: 900,
    summary: "Gasoline inventories are tight; volatility is calm.",
    output: macro,
    usage: usage("claude-haiku-4-5", 600, 90, 0.0011),
  },
  { type: "evidence.added", evidence: [...E.macro] },

  { type: "step.started", node: "analogs", at: at(5_900) },
  {
    type: "step.completed", node: "analogs", status: "done", durationMs: 1_700,
    summary: "Two close hurricane analogs; gasoline forecast up.",
    output: analogs,
    usage: usage("claude-haiku-4-5", 1_100, 100, 0.0016),
  },
  { type: "evidence.added", evidence: [...E.analogs] },

  { type: "step.started", node: "risk", at: at(7_700) },
  { type: "step.completed", node: "risk", status: "done", durationMs: 400, summary: "Exposure channels and scenario loss computed.", output: risk },
  { type: "evidence.added", evidence: [...E.risk] },

  { type: "step.started", node: "hedging", at: at(8_200) },
  { type: "step.progress", node: "hedging", message: "Simulating three actions" },
  {
    type: "step.completed", node: "hedging", status: "done", durationMs: 9_200,
    summary: "Three actions within limits cut the scenario loss.",
    output: hedging,
    usage: usage("claude-sonnet-5-5", 5_800, 1_400, 0.0256),
    thinkingSummary: "Refiners carry the capacity risk, so trim Valero, hedge the refiner sleeve and add natural gas.",
  },
  { type: "evidence.added", evidence: [...E.hedging] },

  { type: "step.started", node: "synthesizer", at: at(17_500) },
  {
    type: "step.completed", node: "synthesizer", status: "done", durationMs: 6_100,
    summary: "Answer drafted with evidence placeholders.",
    output: answer,
    usage: usage("claude-sonnet-5-5", 7_200, 1_100, 0.0254),
  },
  { type: "step.started", node: "verifier", at: at(23_650) },
  { type: "step.completed", node: "verifier", status: "done", durationMs: 30, summary: "All grounding checks passed.", output: verification },

  {
    type: "run.completed",
    status: "succeeded",
    answer,
    eventProfile: idaEventProfile,
    hedgePlan,
    risk: riskReport,
    forecast: analogs.status === "ok" ? analogs.forecast : null,
    confidence: "medium",
    warnings: [],
    totals: { tokensIn: 19_300, tokensOut: 3_260, costUsd: 0.0635, durationMs: 23_700 },
  },
];
