import { FIXTURE_SOURCE } from "../constants";
import { renderTemplate } from "../format";
import type {
  Answer,
  AnalogsOutput,
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
  TemplateText,
  Verification,
  WeatherOutput,
} from "../schemas";
import { FIXTURE_AS_OF, FIXTURE_PRICES } from "./portfolio";
import { fixtureAtRiskRefineries, fixtureStorm } from "./storm";

// A complete, hand-built run for the Ida replay. Every value is fixture data, not a market or model result:
// evidence rows carry source "fixture". Track D builds the terminal against this sequence.

export const FIXTURE_RUN_ID = "00000000-0000-4000-8000-0000000000a1";
export const FIXTURE_THREAD_ID = "00000000-0000-4000-8000-0000000000b1";
export const FIXTURE_QUERY =
  "How will the forecasted Category 4 hurricane in the Gulf of Mexico affect our current energy holdings?";

const T0 = Date.parse("2026-10-03T08:00:00.000Z");
const at = (offsetMs: number) => new Date(T0 + offsetMs).toISOString();
const ref = "fixtures/ida-run";

function ev(
  key: string,
  kind: Evidence["kind"],
  label: string,
  value: number | null,
  unit: Evidence["unit"],
  producedBy: string,
  extra: Partial<Evidence> = {},
): Evidence {
  return {
    key,
    kind,
    label,
    value,
    textValue: null,
    unit,
    basis: "computed",
    source: FIXTURE_SOURCE,
    sourceRef: ref,
    asOf: FIXTURE_AS_OF,
    stale: false,
    producedBy,
    payload: null,
    ...extra,
  };
}

const E = {
  planner: [
    ev("E1", "assumption", "Hurricane category stated in the question", 4, "category", "planner", {
      basis: "assumption",
      source: "user",
      sourceRef: "query",
    }),
  ],
  weather: [
    ev("E2", "weather", "Storm name", null, "text", "weather", { textValue: "Ida", basis: "observed" }),
    ev("E3", "weather", "Peak forecast category", 4, "category", "weather"),
    ev("E4", "weather", "Forecast landfall", Date.parse("2021-08-29T17:00:00.000Z"), "date", "weather"),
    ev("E5", "computation", "Refineries within the impact radius", 4, "count", "weather", {
      payload: { refineries: fixtureAtRiskRefineries.map((r) => r.id) },
    }),
    ev("E6", "computation", "Gulf Coast refining capacity at risk", 0.4, "pct", "weather"),
    ev("E7", "computation", "Valero capacity at risk", 0.31, "pct", "weather"),
  ],
  sentiment: [
    ev("E8", "model", "Energy-sector news sentiment", -0.31, "score", "sentiment", { basis: "model", sourceRef: "fixture" }),
    ev("E9", "news", "GDELT tone z-score", -1.4, "z", "sentiment"),
  ],
  macro: [
    ev("E10", "macro", "Gasoline stocks vs the 5-year same-week average", -0.04, "pct_signed", "macro", { basis: "observed" }),
    ev("E11", "macro", "VIX level", 17.9, "ratio", "macro", { basis: "observed" }),
  ],
  analogs: [
    ev("E12", "model", "Forecast 5-day move, Gulf Coast gasoline", 0.081, "pct_signed", "analogs", { basis: "model" }),
    ev("E13", "model", "Forecast 5-day move, WTI crude", 0.032, "pct_signed", "analogs", { basis: "model" }),
    ev("E14", "model", "Forecast 5-day move, Henry Hub natural gas", 0.021, "pct_signed", "analogs", { basis: "model" }),
    ev("E15", "model", "Effective number of analog events", 4.3, "ratio", "analogs", { basis: "model" }),
  ],
  risk: [
    ev("E16", "portfolio", "Portfolio NAV", 10_000_000, "usd", "risk", { basis: "observed" }),
    ev("E17", "computation", "1-day 95% VaR", 182_000, "usd", "risk"),
    ev("E18", "computation", "Scenario P&L before hedges", -412_000, "usd", "risk"),
  ],
  hedging: [
    ev("E19", "computation", "Scenario P&L after hedges", -171_000, "usd", "hedging"),
    ev("E20", "computation", "Gross hedge notional", 1_910_000, "usd", "hedging"),
  ],
} as const;

export const idaEvidence: Evidence[] = Object.values(E).flat();

const lookup = (key: string) => idaEvidence.find((e) => e.key === key);

function tt(template: string): TemplateText {
  const { text, missing } = renderTemplate(template, lookup);
  if (missing.length > 0) throw new Error(`fixture template has unresolved keys: ${missing.join(", ")}`);
  return { template, rendered: text };
}

const finding = (template: string, keys: string[]) => ({ text: tt(template), evidenceKeys: keys });

const plan: Plan = {
  intent: "event_impact",
  event: {
    source: "replay",
    stormId: fixtureStorm.id,
    stormName: fixtureStorm.name,
    hypothetical: null,
    categoryOverride: null,
  },
  focusSymbols: [],
  focusSectors: ["integrated", "refiner", "energy_etf"],
  horizonDays: 5,
  specialists: { weather: true, sentiment: true, macro: true, analogs: true },
  reallocation: false,
  source: "model",
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
  findings: [finding("{{E2}} is forecast to reach Category {{E3}}; {{E5}} refineries sit inside the impact radius.", ["E2", "E3", "E5"])],
};

const sentiment: SentimentOutput = {
  status: "ok",
  sector: { score: -0.31, n: 5 },
  holdings: [
    { symbol: "VLO", score: -0.5, n: 1 },
    { symbol: "XOM", score: -0.4, n: 1 },
  ],
  gdelt: { toneZ: -1.4, volZ: 2.1 },
  newsIds: ["00000000-0000-4000-8000-000000000101", "00000000-0000-4000-8000-000000000102"],
  findings: [finding("Energy news sentiment is {{E8}} and GDELT tone z-score is {{E9}}.", ["E8", "E9"])],
};

const macro: MacroOutput = {
  status: "ok",
  snapshot: {
    asOf: FIXTURE_AS_OF,
    gasolineStocks: { value: 226_000, fiveYearAvg: 235_400, deviation: -0.04, flag: "tight" },
    crudeStocks: { value: 431_000, fiveYearAvg: 440_000, deviation: -0.02, flag: "normal" },
    vix: { value: 17.9, flag: "calm" },
    yield10y: { value: 1.31, change20d: -0.05 },
    dollarIndex: { value: 114.2, change20d: 0.4 },
    fedFunds: 0.09,
  },
  findings: [finding("Gasoline stocks are {{E10}} versus the five-year average and the VIX is {{E11}}.", ["E10", "E11"])],
};

const reaction = (d1: number, d5: number, d20: number) => ({ d1, d5, d20 });

const analogs: AnalogsOutput = {
  status: "ok",
  forecast: {
    featureSet: "combined",
    bandwidth: 1,
    effectiveN: 4.3,
    targets: {
      GULF_GASOLINE: { mean: 0.081, spread: 0.03 },
      WTI: { mean: 0.032, spread: 0.02 },
      HH_NATGAS: { mean: 0.021, spread: 0.04 },
    },
    analogs: [
      {
        eventId: "hurricane-laura-2020",
        name: "Hurricane Laura",
        similarity: 0.82,
        weight: 0.9,
        realized: { GULF_GASOLINE: reaction(0.02, 0.07, 0.03), WTI: reaction(0.0, 0.02, 0.01), HH_NATGAS: reaction(-0.01, 0.0, 0.03) },
      },
      {
        eventId: "hurricane-harvey-2017",
        name: "Hurricane Harvey",
        similarity: 0.77,
        weight: 0.7,
        realized: { GULF_GASOLINE: reaction(0.04, 0.12, 0.09), WTI: reaction(0.01, 0.04, 0.02), HH_NATGAS: reaction(0.0, 0.03, 0.02) },
      },
    ],
  },
  parallels: [
    {
      eventId: "colonial-pipeline-2021",
      name: "Colonial Pipeline shutdown",
      similarity: 0.61,
      weight: 0,
      realized: { GULF_GASOLINE: reaction(0.03, 0.05, -0.01) },
    },
  ],
  findings: [finding("Historical analogs (effective sample {{E15}}) point to Gulf Coast gasoline {{E12}}.", ["E12", "E15"])],
};

const snapshot = (var1: number, cvar1: number, var5: number, cvar5: number, beta: number, pnl: number): RiskSnapshot => ({
  var1d: { var95: var1, cvar95: cvar1 },
  var5d: { var95: var5, cvar95: cvar5 },
  energyBeta: beta,
  scenarioPnl: pnl,
});

const before = snapshot(182_000, 261_000, 392_000, 560_000, 1.05, -412_000);
const after = snapshot(151_000, 214_000, 330_000, 470_000, 0.78, -171_000);

const riskReport: RiskReport = {
  asOf: FIXTURE_AS_OF,
  nav: 10_000_000,
  var1d: before.var1d,
  var5d: before.var5d,
  exposures: [
    { holding: "VLO", factor: "GULF_GASOLINE", beta: 0.62, r2: 0.34 },
    { holding: "XOM", factor: "WTI", beta: 0.48, r2: 0.41 },
    { holding: "XLE", factor: "WTI", beta: 0.55, r2: 0.52 },
  ],
  topFactorExposures: [
    { factor: "WTI", beta: 0.52 },
    { factor: "GULF_GASOLINE", beta: 0.31 },
    { factor: "HH_NATGAS", beta: 0.04 },
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
    pnl: -412_000,
    pctNav: -0.0412,
    perHolding: [
      { symbol: "VLO", pnl: -148_000 },
      { symbol: "MPC", pnl: -96_000 },
      { symbol: "XOM", pnl: -61_000 },
    ],
  },
  analogPnl: { weightedMean: -0.031, worst: -0.054, n: 2 },
  gamma: { value: -0.18, se: 0.07, n: 12 },
};
const risk: RiskOutput = { status: "ok", report: riskReport };

const price = (s: string) => FIXTURE_PRICES[s] ?? 0;

const hedgePlan: HedgePlan = {
  source: "model",
  summary: tt("Gross hedge notional of {{E20}} lowers the scenario loss to {{E19}}."),
  grossNotional: 1_910_000,
  before,
  after,
  violations: [],
  actions: [
    {
      type: "hedge",
      symbol: "XLE",
      side: "sell",
      quantity: 20_000,
      notional: 20_000 * price("XLE"),
      timing: "before_landfall",
      orderType: "limit",
      exitTrigger: tt("Cover when the storm weakens below hurricane strength."),
      rationale: tt("Cuts broad energy beta while refiners carry the {{E6}} capacity risk."),
      evidenceKeys: ["E6", "E18"],
    },
    {
      type: "hedge",
      symbol: "CRAK",
      side: "sell",
      quantity: 15_000,
      notional: 450_000,
      timing: "now",
      orderType: "market",
      exitTrigger: tt("Cover after refinery restarts are announced."),
      rationale: tt("Refiners are most exposed to the capacity at risk of {{E6}}."),
      evidenceKeys: ["E6", "E7"],
    },
    {
      type: "hedge",
      symbol: "UNG",
      side: "buy",
      quantity: 30_000,
      notional: 510_000,
      timing: "staged",
      orderType: "limit",
      exitTrigger: tt("Sell once the forecast move of {{E14}} is realised."),
      rationale: tt("Analogs forecast natural gas {{E14}} over five trading days."),
      evidenceKeys: ["E14"],
    },
  ],
};
const hedging: HedgingOutput = { status: "ok", plan: hedgePlan };

const answer: Answer = {
  headline: tt("{{E2}} is forecast to reach Category {{E3}} and make landfall on {{E4}}, putting {{E6}} of Gulf Coast refining capacity at risk."),
  summary: tt("The model forecasts Gulf Coast gasoline {{E12}}, WTI {{E13}} and Henry Hub natural gas {{E14}} over five trading days. The scenario loss is {{E18}} on a {{E16}} portfolio; the proposed hedges cut it to {{E19}}."),
  bullets: [
    { text: tt("{{E5}} refineries lie within the impact radius, including Valero exposure of {{E7}} of its capacity."), evidenceKeys: ["E5", "E7"] },
    { text: tt("Energy news sentiment is {{E8}} and the GDELT tone z-score is {{E9}}."), evidenceKeys: ["E8", "E9"] },
    { text: tt("Gasoline stocks are {{E10}} versus the five-year average, so supply has less buffer."), evidenceKeys: ["E10"] },
    { text: tt("Historical analogs (effective sample {{E15}}) point to gasoline {{E12}}."), evidenceKeys: ["E12", "E15"] },
    { text: tt("Sell XLE and CRAK, buy UNG: gross hedge notional {{E20}} cuts the scenario loss to {{E19}}."), evidenceKeys: ["E19", "E20"] },
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
export const idaNodeOutputs = { planner: plan, weather, sentiment, macro, analogs, risk, hedging, synthesizer: answer, verifier: verification };

const usd = (model: string, tokensIn: number, tokensOut: number, costUsd: number) => ({ model, tokensIn, tokensOut, costUsd });

export const idaRunEvents: RunEvent[] = [
  { type: "run.started", runId: FIXTURE_RUN_ID, mode: "replay", asOf: FIXTURE_AS_OF, query: FIXTURE_QUERY },

  { type: "step.started", node: "planner", at: at(100) },
  {
    type: "step.completed", node: "planner", status: "done", durationMs: 1800,
    summary: "Event impact on a replayed storm; all four specialists needed.",
    output: plan,
    usage: usd("claude-sonnet-5-5", 2400, 310, 0.0079),
    thinkingSummary: "The question names a Category 4 Gulf hurricane and asks about current holdings; replay mode supplies Ida.",
  },
  { type: "evidence.added", evidence: [...E.planner] },

  { type: "step.started", node: "weather", at: at(1_950) },
  { type: "step.started", node: "sentiment", at: at(1_960) },
  { type: "step.started", node: "macro", at: at(1_970) },
  { type: "step.progress", node: "weather", message: "Building the Ida track and intersecting refineries" },
  {
    type: "step.completed", node: "weather", status: "done", durationMs: 2_400,
    summary: "Ida: 4 refineries within 100 km of the hurricane-force track.",
    output: weather,
    usage: usd("claude-haiku-4-5", 900, 140, 0.0016),
  },
  { type: "evidence.added", evidence: [...E.weather] },
  {
    type: "step.completed", node: "sentiment", status: "done", durationMs: 3_100,
    summary: "Energy-sector sentiment is negative.",
    output: sentiment,
    usage: usd("claude-haiku-4-5", 1_300, 120, 0.0019),
  },
  { type: "evidence.added", evidence: [...E.sentiment] },
  {
    type: "step.completed", node: "macro", status: "done", durationMs: 900,
    summary: "Gasoline inventories are tight; volatility is calm.",
    output: macro,
    usage: usd("claude-haiku-4-5", 600, 90, 0.0011),
  },
  { type: "evidence.added", evidence: [...E.macro] },

  { type: "step.started", node: "analogs", at: at(5_200) },
  {
    type: "step.completed", node: "analogs", status: "done", durationMs: 1_700,
    summary: "Two close hurricane analogs; gasoline forecast up.",
    output: analogs,
    usage: usd("claude-haiku-4-5", 1_100, 100, 0.0016),
  },
  { type: "evidence.added", evidence: [...E.analogs] },

  { type: "step.started", node: "risk", at: at(7_000) },
  { type: "step.completed", node: "risk", status: "done", durationMs: 400, summary: "Scenario loss on the portfolio computed.", output: risk },
  { type: "evidence.added", evidence: [...E.risk] },

  { type: "step.started", node: "hedging", at: at(7_500) },
  { type: "step.progress", node: "hedging", message: "Simulating three hedge actions" },
  {
    type: "step.completed", node: "hedging", status: "done", durationMs: 9_200,
    summary: "Three hedges within limits cut the scenario loss.",
    output: hedging,
    usage: usd("claude-sonnet-5-5", 5_800, 1_400, 0.0256),
    thinkingSummary: "Refiners carry the capacity risk, so reduce broad energy and refiner exposure and add natural gas.",
  },
  { type: "evidence.added", evidence: [...E.hedging] },

  { type: "step.started", node: "synthesizer", at: at(16_800) },
  {
    type: "step.completed", node: "synthesizer", status: "done", durationMs: 6_100,
    summary: "Answer drafted with evidence placeholders.",
    output: answer,
    usage: usd("claude-sonnet-5-5", 7_200, 1_100, 0.0254),
  },
  { type: "step.started", node: "verifier", at: at(22_950) },
  { type: "step.completed", node: "verifier", status: "done", durationMs: 30, summary: "All grounding checks passed.", output: verification },

  {
    type: "run.completed",
    status: "succeeded",
    answer,
    hedgePlan,
    risk: riskReport,
    forecast: analogs.status === "ok" ? analogs.forecast : null,
    confidence: "medium",
    warnings: [],
    totals: { tokensIn: 19_300, tokensOut: 3_260, costUsd: 0.0635, durationMs: 23_000 },
  },
];
