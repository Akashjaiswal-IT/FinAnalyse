import {
  DEMO_PORTFOLIO,
  EXTERNAL_PEERS,
  LANDFALL_REGIONS,
  MAX_TOKENS,
  Plan,
  UNIVERSE,
  UNIVERSE_SYMBOLS,
  WEATHER_SUBTYPES,
  type Mode,
} from "@repo/contracts";
import type { NodeEnv, NodeImpl, NodeOutcome, Recover } from "../context";
import { rulePlan } from "../fallbacks";
import { PLANNER_SYSTEM, plannerUser, type PlannerContext } from "../prompts/planner";
import type { RunStateUpdate, RunStateValue } from "../state";

/** Per-run keys the planner clears so a follow-up on the same thread starts clean (SPEC 5.5, rule 1). */
export const RESET: RunStateUpdate = {
  eventOut: null,
  weatherOut: null,
  sentimentOut: null,
  macroOut: null,
  analogsOut: null,
  riskOut: null,
  hedgingOut: null,
  draft: null,
  answer: null,
  verification: null,
  repairsUsed: 0,
  violations: [],
};

const universe = new Set<string>(UNIVERSE_SYMBOLS);
const externalByLower = new Map(Object.keys(EXTERNAL_PEERS).map((n) => [n.toLowerCase(), n]));

/** Guardrails on the model's plan: only universe symbols and known external names survive, the run mode wins over
 * the model's idea of the source, and the weather specialist follows the event type. */
export function normalizePlan(plan: Plan, mode: Mode, marketEventId: string | null): Plan {
  const keepSymbols = (list: string[]) => [...new Set(list.map((s) => s.trim().toUpperCase()).filter((s) => universe.has(s)))];
  const keepExternal = (list: string[]) => [...new Set(list.flatMap((n) => externalByLower.get(n.trim().toLowerCase()) ?? []))];
  const event = { ...plan.event };
  event.entities = keepSymbols(event.entities);
  event.externalNames = keepExternal(event.externalNames);
  event.marketEventId = marketEventId ?? event.marketEventId;
  if (event.hypothetical) {
    event.hypothetical = {
      ...event.hypothetical,
      entities: keepSymbols(event.hypothetical.entities),
      externalNames: keepExternal(event.hypothetical.externalNames),
    };
  }
  if (event.hypotheticalStorm && !(event.hypotheticalStorm.region in LANDFALL_REGIONS)) {
    event.hypotheticalStorm = { ...event.hypotheticalStorm, region: "LA_WEST" };
  }
  if (event.source === "live" && mode === "replay") event.source = "replay";
  if (event.source === "replay" && mode === "live") event.source = "live";

  const outOfScope = plan.intent === "out_of_scope";
  if (outOfScope) event.source = "none";
  const weatherEvent =
    event.type === "disaster" && WEATHER_SUBTYPES.includes((event.subtype ?? "") as (typeof WEATHER_SUBTYPES)[number]);
  const specialists = outOfScope
    ? { weather: false, sentiment: false, macro: false, analogs: false }
    : { ...plan.specialists, weather: plan.specialists.weather || weatherEvent || event.hypotheticalStorm !== null };
  return {
    ...plan,
    event,
    focusSymbols: keepSymbols(plan.focusSymbols),
    specialists,
    horizonDays: plan.horizonDays > 0 ? plan.horizonDays : 5,
    source: "model",
  };
}

/** Market events and storms the planner may mention. Either read failing just leaves it out. */
async function activeContext(env: NodeEnv): Promise<{ events: unknown[]; storms: unknown[] }> {
  const { deps, asOf } = env.ctx;
  const when = new Date(asOf);
  const [events, storms] = await Promise.all([
    deps.events.active(when).catch(() => []),
    deps.weather.stormsAt(when).catch(() => []),
  ]);
  return {
    events: events.slice(0, 5).map((e) => ({ id: e.id, type: e.type, title: e.title, entities: e.entities })),
    storms: storms.map((s) => ({ id: s.id, name: s.name })),
  };
}

function plannerContext(state: RunStateValue, env: NodeEnv, extra: { events: unknown[]; storms: unknown[] }): PlannerContext {
  const { ctx } = env;
  const names = new Map(UNIVERSE.map((u) => [u.symbol, u]));
  return {
    question: ctx.query,
    mode: ctx.mode,
    asOf: ctx.asOf,
    replayPresetId: ctx.replayEventId,
    marketEventId: ctx.marketEventId,
    portfolio: DEMO_PORTFOLIO.positions.map((p) => ({
      symbol: p.symbol,
      name: names.get(p.symbol)?.name ?? p.symbol,
      sector: names.get(p.symbol)?.sector ?? null,
      weight: p.targetWeight,
    })),
    history: state.history.slice(-5).map(({ query, headline }) => ({ query, headline })),
    previousPlan: state.plan,
    activeMarketEvents: extra.events,
    activeStorms: extra.storms,
  };
}

/** Numbers the manager typed become evidence with basis `assumption` (SPEC 5.6). */
function recordAssumptions(query: string, env: NodeEnv): void {
  for (const m of query.matchAll(/\bcategory\s+([1-5])\b/gi)) {
    env.evidence({
      kind: "assumption",
      label: "Hurricane category stated in the question",
      value: Number(m[1]),
      unit: "category",
      basis: "assumption",
      source: "user",
      sourceRef: "query",
    });
  }
  for (const m of query.matchAll(/(\d+(?:\.\d+)?)\s*%/g)) {
    env.evidence({
      kind: "assumption",
      label: `Percentage stated in the question (${m[0]})`,
      value: Number(m[1]) / 100,
      unit: "pct",
      basis: "assumption",
      source: "user",
      sourceRef: "query",
    });
  }
}

function outcome(state: RunStateValue, plan: Plan, env: NodeEnv, status: NodeOutcome["status"], summary: string): NodeOutcome {
  recordAssumptions(env.ctx.query, env);
  return {
    update: {
      ...RESET,
      runId: env.ctx.runId,
      plan,
      previous: { plan: state.plan, event: state.eventOut, weather: state.weatherOut },
    },
    status,
    summary,
    output: plan,
  };
}

function summarize(plan: Plan): string {
  const where = plan.event.source === "none" ? "no event" : `${plan.event.source} ${plan.event.type ?? "event"}`;
  return `${plan.intent.replace("_", " ")}: ${where}`;
}

export const plannerNode: NodeImpl = async (state, env) => {
  const { ctx } = env;
  const extra = await activeContext(env);
  const result = await env.llm.parseStructured({
    label: "planner",
    tier: "reasoning",
    effort: "low",
    system: PLANNER_SYSTEM,
    user: plannerUser(plannerContext(state, env, extra)),
    schema: Plan,
    maxTokens: MAX_TOKENS.planner,
  });
  if (result.ok) {
    const plan = normalizePlan(result.data, ctx.mode, ctx.marketEventId);
    return outcome(state, plan, env, "done", summarize(plan));
  }
  const plan = rulePlan({
    query: ctx.query,
    mode: ctx.mode,
    replayEventId: ctx.replayEventId,
    marketEventId: ctx.marketEventId,
    previousPlan: state.plan,
  });
  ctx.warnings.push(`planner: rule-based plan used (${result.reason})`);
  return outcome(state, plan, env, "degraded", `Rule-based plan (${result.reason}): ${summarize(plan)}`);
};

/** If even the rule-based path throws, the run still needs a plan; analyse nothing rather than guess. */
export const plannerRecover: Recover = (state, env, error) =>
  outcome(
    state,
    {
      intent: "out_of_scope",
      event: {
        source: "none", type: null, subtype: null, name: null, entities: [], externalNames: [], marketEventId: null,
        stormId: null, stormName: null, hypothetical: null, hypotheticalStorm: null, categoryOverride: null,
      },
      focusSymbols: [],
      focusSectors: [],
      horizonDays: 5,
      specialists: { weather: false, sentiment: false, macro: false, analogs: false },
      reallocation: false,
      source: "fallback",
    },
    env,
    "degraded",
    `Planning failed: ${error.message}`,
  );
