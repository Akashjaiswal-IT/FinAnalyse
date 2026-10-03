import { z } from "zod";
import {
  HEDGE_MENU,
  FACTORS,
  HedgeSubmission,
  MAX_TOKENS,
  MAX_TOOL_ITERATIONS,
  Side,
  UNIVERSE,
  VAR_LOOKBACK_DAYS,
  formatEvidence,
  type FactorName,
  type HedgeAction,
  type HedgeActionDraft,
  type HedgePlan,
  type HedgingOutput,
  type LimitViolation,
  type RiskSnapshot,
} from "@repo/contracts";
import {
  checkHedgeLimits,
  exposedSleeve,
  fallbackHedge,
  historicalPnl,
  simpleReturn,
  simulateHedges,
  suggestHedges,
  type HedgeLimitContext,
  type HedgeOrder,
  type HedgeSuggestion,
  type RiskSnapshotInput,
} from "@repo/quant";
import type { ToolDef } from "@repo/services/llm";
import type { NodeImpl } from "../context";
import { loadPortfolio, loadReturns } from "../data";
import { HEDGING_SYSTEM, hedgingUser } from "../prompts/hedging";
import { TAG } from "../tags";
import { digitViolations, placeholderViolations, unknownSymbols } from "../verify";

const nameOf = (symbol: string) => UNIVERSE.find((u) => u.symbol === symbol)?.name ?? symbol;

const SimulateInput = z.object({
  actions: z.array(z.object({ symbol: z.string(), side: Side, quantity: z.number().int() })),
});

function tool<S extends z.ZodType>(name: string, description: string, inputSchema: S, run: (input: z.infer<S>) => string): ToolDef {
  return { name, description, inputSchema, run: run as ToolDef["run"] };
}

interface Accepted {
  actions: HedgeActionDraft[];
  summary: string;
  before: RiskSnapshot;
  after: RiskSnapshot;
  grossNotional: number;
}
type Token = "AFTER_PNL" | "GROSS" | "AFTER_VAR";

/** Replaces the plan-result tokens with the evidence keys created for them. */
function resolveTokens(text: string, keys: Record<Token, string>): string {
  return text.replace(/\{\{(AFTER_PNL|GROSS|AFTER_VAR)\}\}/g, (_, t: Token) => `{{${keys[t]}}}`);
}

export const hedgingNode: NodeImpl = async (state, env) => {
  const { ctx } = env;
  const plan = state.plan;
  if (!plan || plan.event.source === "none" || plan.intent === "explain") {
    const output: HedgingOutput = { status: "skipped" };
    return { update: { hedgingOut: output }, status: "skipped", summary: "No hedge needed.", output };
  }
  const unavailable = (reason: string) => {
    const output: HedgingOutput = { status: "unavailable", reason };
    return { update: { hedgingOut: output }, status: "degraded" as const, summary: `Unavailable: ${reason}`, output };
  };
  if (state.riskOut?.status !== "ok") return unavailable("no risk report to hedge against");
  const report = state.riskOut.report;
  const forecast = state.analogsOut?.status === "ok" ? state.analogsOut.forecast : null;
  if (!forecast) return unavailable("no forecast to simulate hedges with");

  const when = new Date(ctx.asOf);
  const portfolio = await loadPortfolio(ctx);
  const nav = portfolio.nav;
  const symbols = portfolio.positions.map((p) => p.symbol);
  const traded = [...new Set([...symbols, ...HEDGE_MENU])];
  const factorSymbols = [...new Set(Object.values(FACTORS))];
  const returns = await loadReturns(ctx, [...symbols, ...factorSymbols, ...HEDGE_MENU], VAR_LOOKBACK_DAYS);

  const closes = await ctx.deps.market.closesAt(traded, when);
  const prices = Object.fromEntries(closes.map((c) => [c.symbol, c.close]));
  const advEntries = await Promise.all(traded.map(async (s) => [s, await ctx.deps.market.adv(s, when).catch(() => null)] as const));
  const adv = Object.fromEntries(advEntries.filter((e): e is readonly [string, number] => e[1] !== null));
  const quantities = Object.fromEntries(portfolio.positions.map((p) => [p.symbol, p.quantity]));
  const limits: HedgeLimitContext = { nav, prices, adv, holdings: quantities };

  const values: Record<string, number> = Object.fromEntries(portfolio.positions.map((p) => [p.symbol, p.value]));
  const sleeve = exposedSleeve(report.channels, symbols);
  const sleeveValues = Object.fromEntries(sleeve.map((s) => [s, values[s] as number]));
  const factor: FactorName = report.topFactorExposures[0]?.factor ?? "MARKET";
  const factorReturns = Object.fromEntries(
    (Object.entries(FACTORS) as [FactorName, string][]).flatMap(([f, series]) => (returns[series] ? [[f, returns[series]]] : [])),
  ) as Partial<Record<FactorName, number[]>>;
  const forecastMap = Object.fromEntries(traded.flatMap((s) => (forecast.holdings[s] ? [[s, forecast.holdings[s].mean]] : [])));
  const book: RiskSnapshotInput = {
    nav, values: Object.fromEntries(symbols.filter((s) => returns[s]).map((s) => [s, values[s] as number])),
    returns, factorReturns, factor, sleeve: sleeve.filter((s) => returns[s]), forecast: forecastMap,
  };

  const sleevePnl = historicalPnl(Object.fromEntries(Object.entries(sleeveValues).filter(([s]) => returns[s])), returns, 1);
  const etfSimple = Object.fromEntries(HEDGE_MENU.filter((s) => returns[s]).map((s) => [s, (returns[s] as number[]).map(simpleReturn)]));
  const suggestions: HedgeSuggestion[] = suggestHedges(sleevePnl, etfSimple, limits);

  const simulate = (orders: HedgeOrder[]) => simulateHedges({ book, prices, orders, limits });
  const ordersOf = (actions: { symbol: string; side: "buy" | "sell"; quantity: number }[]): HedgeOrder[] =>
    actions.map(({ symbol, side, quantity }) => ({ symbol, side, quantity }));

  // Evidence for the accepted plan, and the rest of the template check, shared by submit and fallback.
  const recordAfter = (sim: { after: RiskSnapshot; grossNotional: number }) => {
    const common = { kind: "computation" as const, basis: "computed" as const, source: "tempest", asOf: ctx.asOf, sourceRef: "simulate_hedges" };
    return {
      AFTER_PNL: env.evidence({ ...common, label: "Scenario P&L after hedges", value: sim.after.scenarioPnl, unit: "usd", tag: TAG.hedgeAfterPnl }),
      GROSS: env.evidence({ ...common, label: "Gross hedge notional", value: sim.grossNotional, unit: "usd", tag: TAG.hedgeGross }),
      AFTER_VAR: env.evidence({ ...common, label: "1-day 95% value at risk after hedges", value: sim.after.var1d.var95, unit: "usd" }),
    };
  };

  const templateProblems = (a: HedgeActionDraft | { rationale: string; exitTrigger: string; evidenceKeys: string[]; symbol: string }) => {
    const out: string[] = [];
    for (const [field, text] of [["rationale", a.rationale], ["exitTrigger", a.exitTrigger]] as const) {
      const masked = text.replace(/\{\{(AFTER_PNL|GROSS|AFTER_VAR)\}\}/g, "");
      out.push(...placeholderViolations(masked, ctx.ledger).map((v) => `${a.symbol} ${field}: ${v}`));
      out.push(...digitViolations(masked).map((d) => `${a.symbol} ${field}: digit outside a placeholder "${d}"`));
      out.push(...unknownSymbols(masked).map((s) => `${a.symbol} ${field}: symbol ${s} is not in the universe`));
    }
    if (a.evidenceKeys.length === 0) out.push(`${a.symbol}: cite at least one evidence key`);
    for (const k of a.evidenceKeys) if (!ctx.ledger.has(k)) out.push(`${a.symbol}: unknown evidence key ${k}`);
    return out;
  };

  let accepted: Accepted | null = null;
  const tools: ToolDef[] = [
    tool("simulate_hedges", "Risk before and after a set of hedge or reallocation orders, with limit violations. Creates no evidence.", SimulateInput, ({ actions }) => {
      const orders = ordersOf(actions);
      try {
        const sim = simulate(orders);
        return JSON.stringify({ before: sim.before, after: sim.after, grossNotional: sim.grossNotional, violations: sim.violations.map((v) => v.message) });
      } catch (err) {
        return JSON.stringify({ error: err instanceof Error ? err.message : "simulation failed" });
      }
    }),
    tool("submit_plan", "Submit the final plan. Returns violations if the plan breaks a limit or a template rule; fix them and submit again.", HedgeSubmission, (input) => {
      const orders = ordersOf(input.actions);
      const violations: string[] = [
        ...checkHedgeLimits(orders, limits).map((v) => v.message),
        ...input.actions.flatMap(templateProblems),
        ...[input.summary].flatMap((t) => [...placeholderViolations(t.replace(/\{\{(AFTER_PNL|GROSS|AFTER_VAR)\}\}/g, ""), ctx.ledger), ...digitViolations(t.replace(/\{\{(AFTER_PNL|GROSS|AFTER_VAR)\}\}/g, "")).map((d) => `summary: digit outside a placeholder "${d}"`)]),
        ...(input.actions.length === 0 ? ["submit at least one action"] : []),
      ];
      if (violations.length > 0) return JSON.stringify({ accepted: false, violations });
      const sim = simulate(orders);
      accepted = { actions: input.actions, summary: input.summary, before: sim.before, after: sim.after, grossNotional: sim.grossNotional };
      return JSON.stringify({ accepted: true, scenarioPnlBefore: sim.before.scenarioPnl, scenarioPnlAfter: sim.after.scenarioPnl });
    }),
  ];

  const context = hedgingUser({
    event: state.eventOut?.status === "ok" ? { type: state.eventOut.profile.type, title: state.eventOut.profile.title, factorDirections: state.eventOut.profile.factorDirections } : null,
    reallocation: plan.reallocation,
    nav,
    risk: { var1d: report.var1d, scenarioPnl: report.scenario.pnl, topFactorExposures: report.topFactorExposures, exposedValue: report.exposedValue },
    sleeve: sleeve.map((s) => ({ symbol: s, value: values[s] as number, price: prices[s] ?? 0, quantity: quantities[s] ?? 0 })),
    suggestions: suggestions.slice(0, 6).map((s) => ({ symbol: s.symbol, side: s.side, maxQuantity: s.quantity, fit: s.r2 })),
    evidence: ctx.ledger.all().map((e) => ({ key: e.key, label: e.label, value: formatEvidence(e) })),
  });
  const run = await env.llm.runTools({
    label: "hedging", tier: "reasoning", effort: "medium", system: HEDGING_SYSTEM, user: context, tools,
    maxTokens: MAX_TOKENS.hedging, maxIterations: MAX_TOOL_ITERATIONS,
  });

  const toAction = (a: HedgeActionDraft | FallbackDraft, keys: Record<Token, string>): HedgeAction => ({
    type: a.type, symbol: a.symbol, side: a.side, quantity: a.quantity, timing: a.timing, orderType: a.orderType,
    notional: a.quantity * (prices[a.symbol] ?? 0),
    exitTrigger: ctx.ledger.text(resolveTokens(a.exitTrigger, keys)),
    rationale: ctx.ledger.text(resolveTokens(a.rationale, keys)),
    evidenceKeys: a.evidenceKeys,
  });

  let hedge: HedgePlan;
  let degraded = false;
  const final = accepted as Accepted | null;
  if (run.ok && final) {
    const keys = recordAfter(final);
    hedge = {
      source: "model",
      actions: final.actions.map((a) => toAction(a, keys)),
      summary: ctx.ledger.text(resolveTokens(final.summary, keys)),
      grossNotional: final.grossNotional,
      before: final.before,
      after: final.after,
      violations: [],
    };
  } else {
    degraded = true;
    if (!run.ok) ctx.warnings.push(`hedging: fallback hedge used (${run.reason})`);
    else ctx.warnings.push("hedging: no plan was submitted; fallback hedge used");
    const order = fallbackHedge(suggestions);
    const orders: HedgeOrder[] = order ? [order] : [];
    const sim = simulate(orders);
    const keys = recordAfter(sim);
    const beforeKey = ctx.ledger.tagged(TAG.riskScenarioPnl) ?? keys.AFTER_PNL;
    const violations: LimitViolation[] = [];
    hedge = {
      source: "fallback",
      actions: order
        ? [toAction({
            type: "hedge", symbol: order.symbol, side: order.side, quantity: order.quantity, timing: "now", orderType: "market",
            exitTrigger: `Unwind when the event risk to the exposed holdings fades.`,
            rationale: `${order.side === "sell" ? "Selling" : "Buying"} ${nameOf(order.symbol)} is the closest minimum-variance offset to the exposed holdings; it moves the scenario result to {{AFTER_PNL}}.`,
            evidenceKeys: [beforeKey, keys.AFTER_PNL],
          }, keys)]
        : [],
      summary: ctx.ledger.text(order ? `One fallback order, gross notional {{${keys.GROSS}}}, moves the scenario result to {{${keys.AFTER_PNL}}}.` : `No order within the limits offsets the exposed holdings; the scenario result stays at {{${keys.AFTER_PNL}}}.`),
      grossNotional: sim.grossNotional,
      before: sim.before,
      after: sim.after,
      violations,
    };
  }

  const output: HedgingOutput = { status: "ok", plan: hedge };
  return {
    update: { hedgingOut: output },
    status: degraded ? "degraded" : "done",
    summary: `${hedge.source === "model" ? "Model" : "Fallback"} plan: ${hedge.actions.length} actions, scenario result moves from ${Math.round(hedge.before.scenarioPnl)} to ${Math.round(hedge.after.scenarioPnl)}`,
    output,
  };
};

type FallbackDraft = Omit<HedgeActionDraft, "rationale" | "exitTrigger"> & { rationale: string; exitTrigger: string };
