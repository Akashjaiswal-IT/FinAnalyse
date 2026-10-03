import {
  FORECAST_TARGETS,
  HEDGE_MENU,
  HORIZON_DAYS,
  UNIVERSE,
  type AnalogMatch,
  type AnalogsOutput,
  type EventFeatures,
  type EventProfile,
  type Forecast,
} from "@repo/contracts";
import { buildForecast, eligibleAnalogs, ols, simpleReturn, withSimilarity } from "@repo/quant";
import type { NodeImpl } from "../context";
import { loadPortfolio, loadReturns, tail } from "../data";
import { finding, writeFindings } from "../notes";
import { forecastTag, TAG } from "../tags";

const nameOf = (symbol: string) => UNIVERSE.find((u) => u.symbol === symbol)?.name ?? symbol;

/** The text Pinecone matches against analog descriptions (SPEC 5.5): built from the profile by a template. */
export function eventQueryText(p: Pick<EventProfile, "type" | "subtype" | "title" | "entities" | "externalNames" | "affectedSectors" | "factorDirections">): string {
  const parts = [
    `${p.type.replace("_", " ")}${p.subtype ? ` (${p.subtype.replace("_", " ")})` : ""} event: ${p.title}.`,
    p.entities.length > 0 ? `Companies: ${[...p.entities, ...p.externalNames].join(", ")}.` : p.externalNames.length > 0 ? `Companies: ${p.externalNames.join(", ")}.` : "",
    p.affectedSectors.length > 0 ? `Sectors: ${p.affectedSectors.join(", ")}.` : "",
    p.factorDirections.length > 0 ? `Market moves: ${p.factorDirections.map((f) => `${f.factor} ${f.direction}`).join(", ")}.` : "",
  ];
  return parts.filter(Boolean).join(" ");
}

const PARALLELS = 3;

export const analogsNode: NodeImpl = async (state, env) => {
  const { ctx } = env;
  if (!state.plan?.specialists.analogs) {
    const output: AnalogsOutput = { status: "skipped" };
    return { update: { analogsOut: output }, status: "skipped", summary: "Analogs not needed.", output };
  }
  const unavailable = (reason: string) => {
    const output: AnalogsOutput = { status: "unavailable", reason };
    return { update: { analogsOut: output }, status: "degraded" as const, summary: `Unavailable: ${reason}`, output };
  };
  if (state.eventOut?.status !== "ok") return unavailable("no event profile to match against");
  const profile = state.eventOut.profile;
  const asOf = new Date(ctx.asOf);

  const all = await ctx.deps.analogs.list();
  const pool = eligibleAnalogs(all, ctx.asOf, ctx.replayEventId ?? undefined);
  if (pool.length === 0) return unavailable("no historical event is fully realized before as-of");

  const features: EventFeatures = {
    volZ: profile.volZ,
    toneZ: profile.toneZ,
    vixZ: state.macroOut?.status === "ok" ? state.macroOut.snapshot.vix.z : null,
    windKt: state.weatherOut?.status === "ok" ? (state.weatherOut.features?.windKt ?? null) : null,
    capAtRisk: state.weatherOut?.status === "ok" ? (state.weatherOut.features?.capAtRisk ?? null) : null,
    offshoreExposure: state.weatherOut?.status === "ok" ? (state.weatherOut.features?.offshoreExposure ?? null) : null,
  };

  const portfolio = await loadPortfolio(ctx);
  const held = portfolio.positions.map((p) => p.symbol);
  const forecastHoldings = [...new Set([...held, ...HEDGE_MENU])];
  const returns = tail(await loadReturns(ctx, [...forecastHoldings, "SPY"], 252), 252);
  const spy = returns["SPY"];
  const betaToSpy: Record<string, number> = {};
  if (spy) {
    for (const symbol of forecastHoldings) {
      const col = returns[symbol];
      const fit = col && col.length === spy.length ? ols(col, spy) : null;
      if (fit) betaToSpy[symbol] = fit.beta;
    }
  }

  const raw = buildForecast({ type: profile.type, features }, pool, { holdings: forecastHoldings, betaToSpy, topAnalogs: PARALLELS * 4 });
  let similarity: Record<string, number> = {};
  try {
    const hits = await ctx.deps.analogs.search(eventQueryText(profile), { asOf, topK: 20 });
    similarity = Object.fromEntries(hits.map((h) => [h.event.id, h.similarity]));
  } catch (err) {
    ctx.warnings.push(`analogs: similarity scores missing (${err instanceof Error ? err.message : "search failed"})`);
  }
  const full = withSimilarity(raw, similarity, profile.newsBasis);
  const sameType = full.analogs.filter((a) => a.type === profile.type).slice(0, PARALLELS);
  const otherType = full.analogs.filter((a) => a.type !== profile.type).slice(0, PARALLELS);
  const forecast: Forecast = { ...full, analogs: [...sameType, ...otherType].sort((a, b) => b.weight - a.weight) };

  // Evidence: targets, the holdings that matter most, and the sample size behind them.
  const keys: string[] = [];
  const row = (symbol: string, label: string, mean: number) => {
    const key = env.evidence({
      kind: "model", label, value: simpleReturn(mean), unit: "pct_signed", basis: "model", source: "analogs",
      sourceRef: `grouped kernel kNN, ${forecast.variant}, ${forecast.groupsUsed.join("+")}`, asOf: ctx.asOf, tag: forecastTag(symbol),
    });
    keys.push(key);
    return key;
  };
  const targetKeys: Record<string, string> = {};
  for (const target of FORECAST_TARGETS) {
    const t = forecast.targets[target];
    if (t) targetKeys[target] = row(target, `Forecast ${HORIZON_DAYS}-day move, ${nameOf(target)}`, t.mean);
  }
  const valueOf = new Map(portfolio.positions.map((p) => [p.symbol, p.value]));
  const ranked = held
    .filter((s) => forecast.holdings[s] && !(s in targetKeys))
    .sort((a, b) => Math.abs((valueOf.get(b) ?? 0) * (forecast.holdings[b]?.mean ?? 0)) - Math.abs((valueOf.get(a) ?? 0) * (forecast.holdings[a]?.mean ?? 0)));
  const chosen = [...new Set([...profile.entities.filter((s) => forecast.holdings[s]), ...ranked])].slice(0, 8);
  const holdingKeys: Record<string, string> = {};
  for (const symbol of chosen) {
    const f = forecast.holdings[symbol];
    if (f) holdingKeys[symbol] = row(symbol, `Forecast ${HORIZON_DAYS}-day move, ${nameOf(symbol)}`, f.mean);
  }
  const effKey = env.evidence({ kind: "model", label: "Effective number of analog events", value: forecast.effectiveN, unit: "ratio", basis: "model", source: "analogs", sourceRef: "(sum w)^2 / sum w^2", asOf: ctx.asOf, tag: TAG.analogsEffectiveN });
  const typeCount = pool.filter((e) => e.type === profile.type).length;
  const typeKey = env.evidence({ kind: "analog", label: `Past ${profile.type.replace("_", " ")} events available`, value: typeCount, unit: "count", basis: "observed", source: "analog_events", asOf: ctx.asOf, tag: TAG.analogsTypeEvents });
  keys.push(effKey, typeKey);

  const fallbackPhrases = FORECAST_TARGETS.flatMap((t) => (targetKeys[t] ? [`${nameOf(t)} {{${targetKeys[t]}}}`] : [])).slice(0, 3);
  const fallback = fallbackPhrases.length > 0
    ? [finding(env, `Similar past events (effective sample {{${effKey}}}) point to ${fallbackPhrases.join(", ")} over five trading days.`, [effKey, ...FORECAST_TARGETS.flatMap((t) => (targetKeys[t] && fallbackPhrases.some((p) => p.includes(`{{${targetKeys[t]}}}`)) ? [targetKeys[t] as string] : []))])]
    : [finding(env, `Only {{${typeKey}}} comparable past events are available, so no forecast move is stated.`, [typeKey])];
  const findings = await writeFindings(env, "notes:analogs", "Forecast from similar past events, five trading days ahead", {
    variant: forecast.variant, groupsUsed: forecast.groupsUsed, newsBasis: forecast.newsBasis,
    targets: targetKeys, holdings: Object.fromEntries(Object.entries(holdingKeys).map(([s, k]) => [nameOf(s), k])),
    effectiveNKey: effKey, typeEventsKey: typeKey, analogs: forecast.analogs.map((a: AnalogMatch) => ({ name: a.name, type: a.type })),
  }, keys, fallback);

  const output: AnalogsOutput = { status: "ok", forecast, parallels: { sameType, otherType }, findings };
  return {
    update: { analogsOut: output },
    status: "done",
    summary: `${pool.length} eligible events, effective sample ${forecast.effectiveN.toFixed(1)}; groups ${forecast.groupsUsed.join(", ")}`,
    output,
  };
};
