import type { NodeName } from "@repo/contracts";
import type { RunContext } from "./context";
import type { RunStateValue } from "./state";

const ok = <T extends { status: string }>(o: T | null): Extract<T, { status: "ok" }> | null => (o?.status === "ok" ? (o as Extract<T, { status: "ok" }>) : null);
const status = (o: { status: string } | null) => o?.status ?? "not run";

/** A compact description of what a node read, for the drilldown (SPEC 8: inputs and outputs per step). It names
 * the question, the upstream results it used and their status; it does not repeat the upstream outputs. */
export function stepInput(node: NodeName, state: RunStateValue, ctx: RunContext): unknown {
  const plan = state.plan;
  const profile = ok(state.eventOut)?.profile;
  switch (node) {
    case "planner":
      return { question: ctx.query, mode: ctx.mode, asOf: ctx.asOf, replayPreset: ctx.replayEventId, marketEventId: ctx.marketEventId, earlierRuns: state.history.length };
    case "event":
      return { intent: plan?.intent, source: plan?.event.source, hint: { type: plan?.event.type, subtype: plan?.event.subtype, entities: plan?.event.entities, externalNames: plan?.event.externalNames }, asOf: ctx.asOf };
    case "weather":
      return { event: profile && { type: profile.type, subtype: profile.subtype, title: profile.title }, stormHint: plan?.event.stormName ?? plan?.event.stormId, hypotheticalStorm: plan?.event.hypotheticalStorm, categoryOverride: plan?.event.categoryOverride, asOf: ctx.asOf };
    case "sentiment":
      return { event: profile && { title: profile.title, entities: profile.entities, peerSymbols: profile.peerSymbols }, newsWindowHours: 72, asOf: ctx.asOf };
    case "macro":
      return { asOf: ctx.asOf, series: ["VIXCLS", "DGS10", "DFF", "DTWEXBGS", "WGTSTUS1", "WCESTUS1"] };
    case "analogs":
      return {
        event: profile && { type: profile.type, volZ: profile.volZ, toneZ: profile.toneZ, newsBasis: profile.newsBasis },
        vixZ: ok(state.macroOut)?.snapshot.vix.z ?? null,
        weatherFeatures: ok(state.weatherOut)?.features ?? null,
        upstream: { event: status(state.eventOut), weather: status(state.weatherOut), macro: status(state.macroOut) },
        excludedEvent: ctx.replayEventId,
        asOf: ctx.asOf,
      };
    case "risk":
      return {
        event: profile && { id: profile.id, entities: profile.entities, factorDirections: profile.factorDirections },
        capacityAtRiskCompanies: Object.keys(ok(state.weatherOut)?.companyCapAtRisk ?? {}),
        forecast: ok(state.analogsOut) && { variant: ok(state.analogsOut)?.forecast.variant, groups: ok(state.analogsOut)?.forecast.groupsUsed },
        asOf: ctx.asOf,
      };
    case "hedging": {
      const report = ok(state.riskOut)?.report;
      return { reallocation: plan?.reallocation, scenarioPnl: report?.scenario.pnl, var1d: report?.var1d.var95, exposedValue: report?.exposedValue, upstream: { risk: status(state.riskOut), analogs: status(state.analogsOut) } };
    }
    case "synthesizer":
      return { intent: plan?.intent, evidenceRows: ctx.ledger.all().length, upstream: Object.fromEntries(Object.entries({ event: state.eventOut, weather: state.weatherOut, sentiment: state.sentimentOut, macro: state.macroOut, analogs: state.analogsOut, risk: state.riskOut, hedging: state.hedgingOut }).map(([k, v]) => [k, status(v)])), repair: state.repairsUsed > 0 ? state.violations : null };
    case "verifier":
      return { draftSource: state.draft?.source, repairsUsed: state.repairsUsed, evidenceRows: ctx.ledger.all().length };
  }
}
