import {
  BETA_LOOKBACK_DAYS,
  FACTORS,
  HEDGE_MENU,
  UNIVERSE,
  VAR_LOOKBACK_DAYS,
  type ChannelLink,
  type ChannelReason,
  type FactorExposure,
  type FactorName,
  type RiskOutput,
  type RiskReport,
  type Sector,
} from "@repo/contracts";
import {
  analogReplayPnl,
  correlationMatrix,
  exposedValueByChannel,
  exposureChannels,
  factorExposures,
  pnlByChannel,
  pnlBySector,
  portfolioVarCvar,
  scenarioPnl,
  topFactorExposures,
} from "@repo/quant";
import type { NodeEnv, NodeImpl } from "../context";
import { loadPortfolio, loadReturns, tail } from "../data";
import { TAG } from "../tags";

const nameOf = (symbol: string) => UNIVERSE.find((u) => u.symbol === symbol)?.name ?? symbol;
const sectorOf: Record<string, Sector> = Object.fromEntries(UNIVERSE.map((u) => [u.symbol, u.sector]));

/** Why each entity counts as one (SPEC 5.14, channel 1). */
function entityReasons(planned: readonly string[], named: readonly string[], capacity: readonly string[], hypothetical: boolean) {
  const reasons: Record<string, ChannelReason> = {};
  for (const s of named) reasons[s] = hypothetical ? "named_in_plan" : "named_in_news";
  for (const s of planned) reasons[s] = "named_in_plan";
  for (const s of capacity) reasons[s] = "capacity_at_risk";
  return reasons;
}

export const riskNode: NodeImpl = async (state, env) => {
  const { ctx } = env;
  const plan = state.plan;
  if (!plan) throw new Error("the risk node received no plan");
  const profile = state.eventOut?.status === "ok" ? state.eventOut.profile : null;
  const weather = state.weatherOut?.status === "ok" ? state.weatherOut : null;
  const forecast = state.analogsOut?.status === "ok" ? state.analogsOut.forecast : null;
  const unavailable = (reason: string) => {
    const output: RiskOutput = { status: "unavailable", reason };
    return { update: { riskOut: output }, status: "degraded" as const, summary: `Unavailable: ${reason}`, output };
  };
  if (plan.event.source !== "none" && !forecast) return unavailable("no forecast, so the scenario P&L cannot be computed");

  const portfolio = await loadPortfolio(ctx);
  const nav = portfolio.nav;
  const symbols = portfolio.positions.map((p) => p.symbol);
  const values: Record<string, number> = Object.fromEntries(portfolio.positions.map((p) => [p.symbol, p.value]));
  const factorSymbols = [...new Set(Object.values(FACTORS))];
  const all = await loadReturns(ctx, [...symbols, ...factorSymbols, ...HEDGE_MENU], VAR_LOOKBACK_DAYS);
  const withReturns = symbols.filter((s) => all[s] && all[s].length > 0);
  if (withReturns.length < symbols.length) {
    ctx.warnings.push(`risk: no return history for ${symbols.filter((s) => !withReturns.includes(s)).join(", ")}; left out of VaR`);
  }
  const lastYear = tail(all, BETA_LOOKBACK_DAYS);
  const factorReturns = Object.fromEntries(
    (Object.entries(FACTORS) as [FactorName, string][]).flatMap(([factor, series]) => (lastYear[series] ? [[factor, lastYear[series]]] : [])),
  ) as Partial<Record<FactorName, number[]>>;
  const betas: FactorExposure[] = factorExposures(Object.fromEntries(withReturns.map((s) => [s, lastYear[s] as number[]])), factorReturns);

  // Exposure channels (SPEC 5.14): every assignment is an evidence row with its reason in the payload.
  const capacity = weather ? Object.keys(weather.companyCapAtRisk) : [];
  const exposures = profile
    ? exposureChannels({
        holdings: symbols,
        event: { ...profile, entities: [...new Set([...profile.entities, ...capacity])] },
        sectorOf,
        betas,
        entityReasons: entityReasons(plan.event.entities, profile.entities, capacity, profile.source === "hypothetical"),
        evidenceKeys: (symbol, link) => [recordLink(env, symbol, link, betas, profile.factorDirections)],
      })
    : [];

  const nonzero = Object.fromEntries(withReturns.map((s) => [s, values[s] as number]));
  const var1d = portfolioVarCvar(nonzero, all, 1);
  const var5d = portfolioVarCvar(nonzero, all, 5);
  const topFactors = topFactorExposures(values, nav, betas, 3);
  const exposedValue = exposedValueByChannel(exposures, values);

  let scenario: RiskReport["scenario"] = { pnl: 0, pctNav: 0, perHolding: [], perSector: [], perChannel: [] };
  let analogPnl: RiskReport["analogPnl"] = null;
  if (forecast) {
    const covered = symbols.filter((s) => forecast.holdings[s]);
    if (covered.length < symbols.length) {
      ctx.warnings.push(`risk: no forecast for ${symbols.filter((s) => !covered.includes(s)).join(", ")}; left out of the scenario P&L`);
    }
    const coveredValues = Object.fromEntries(covered.map((s) => [s, values[s] as number]));
    const result = scenarioPnl(coveredValues, Object.fromEntries(covered.map((s) => [s, (forecast.holdings[s] as { mean: number }).mean])));
    scenario = {
      pnl: result.total,
      pctNav: result.total / nav,
      perHolding: result.perHolding,
      perSector: pnlBySector(result.perHolding, sectorOf),
      perChannel: pnlByChannel(result.perHolding, exposures),
    };
    analogPnl = analogReplayPnl(
      values,
      forecast.analogs.map((a) => ({ weight: a.weight, returns: Object.fromEntries(Object.entries(a.realized).map(([s, r]) => [s, r.d5])) })),
    );
  }

  const corrSymbols = [...new Set([...exposures.map((e) => e.symbol), ...factorSymbols])].filter((s) => lastYear[s]);
  const report: RiskReport = {
    asOf: ctx.asOf,
    nav,
    var1d,
    var5d,
    exposures: betas,
    topFactorExposures: topFactors,
    channels: exposures,
    exposedValue,
    correlations: { symbols: corrSymbols, matrix: correlationMatrix(lastYear, corrSymbols) },
    scenario,
    analogPnl,
  };

  // Evidence (SPEC 5.10 output).
  const common = { asOf: ctx.asOf, source: "tempest" } as const;
  env.evidence({ ...common, kind: "portfolio", label: "Portfolio NAV", value: nav, unit: "usd", basis: "observed", source: "portfolio", sourceRef: portfolio.portfolioId, tag: TAG.riskNav });
  env.evidence({ ...common, kind: "computation", label: "1-day 95% value at risk", value: var1d.var95, unit: "usd", basis: "computed", sourceRef: `historical simulation, ${VAR_LOOKBACK_DAYS} days`, tag: TAG.riskVar1d });
  env.evidence({ ...common, kind: "computation", label: "1-day 95% expected shortfall", value: var1d.cvar95, unit: "usd", basis: "computed", sourceRef: `historical simulation, ${VAR_LOOKBACK_DAYS} days` });
  env.evidence({ ...common, kind: "computation", label: "5-day 95% value at risk", value: var5d.var95, unit: "usd", basis: "computed", sourceRef: "overlapping 5-day sums" });
  for (const f of topFactors) {
    env.evidence({ ...common, kind: "computation", label: `Portfolio beta to ${f.factor}`, value: f.beta, unit: "ratio", basis: "computed", sourceRef: `OLS, ${BETA_LOOKBACK_DAYS} days` });
  }
  if (profile) {
    for (const v of exposedValue) {
      env.evidence({
        ...common, kind: "computation", label: `Holdings with ${v.channel} exposure`, value: v.value, unit: "usd", basis: "computed", sourceRef: "exposure channels",
        tag: v.channel === "direct" ? TAG.exposedDirect : v.channel === "peer" ? TAG.exposedPeer : TAG.exposedFactor,
      });
    }
  }
  if (forecast) {
    env.evidence({ ...common, kind: "computation", label: "Scenario P&L before hedges", value: scenario.pnl, unit: "usd", basis: "model", sourceRef: "sum of position value times forecast move", tag: TAG.riskScenarioPnl });
    if (analogPnl) {
      env.evidence({ ...common, kind: "computation", label: "Analog replay P&L, weighted mean", value: analogPnl.weightedMean, unit: "usd", basis: "model", sourceRef: `${analogPnl.n} analogs`, tag: TAG.riskAnalogPnl });
      env.evidence({ ...common, kind: "computation", label: "Analog replay P&L, worst case", value: analogPnl.worst, unit: "usd", basis: "model", sourceRef: `${analogPnl.n} analogs` });
    }
  }

  const output: RiskOutput = { status: "ok", report };
  const touched = exposures.length;
  return {
    update: { riskOut: output },
    status: "done",
    summary: profile ? `${touched} holdings with an exposure channel; scenario P&L computed` : "Portfolio VaR and betas; no event, so no scenario",
    output,
  };
};

function recordLink(env: NodeEnv, symbol: string, link: Omit<ChannelLink, "evidenceKeys">, betas: readonly FactorExposure[], directions: readonly { factor: FactorName; direction: string }[]): string {
  const base = { asOf: env.ctx.asOf, source: "tempest", kind: "computation" as const, basis: "computed" as const };
  if (link.channel === "factor") {
    const fit = betas.find((b) => b.holding === symbol && b.factor === link.detail);
    return env.evidence({
      ...base, label: `${nameOf(symbol)} beta to ${link.detail}`, value: fit?.beta ?? null, unit: "ratio", sourceRef: link.reason,
      payload: { channel: link.channel, reason: link.reason, factor: link.detail, beta: fit?.beta ?? null, r2: fit?.r2 ?? null, direction: directions.find((d) => d.factor === link.detail)?.direction ?? null },
    });
  }
  return env.evidence({
    ...base, label: `${nameOf(symbol)}: ${link.channel} exposure`, textValue: link.detail, unit: "text", sourceRef: link.reason,
    payload: { channel: link.channel, reason: link.reason, detail: link.detail },
  });
}
