import { AnswerDraft, MAX_TOKENS, formatEvidence, type Finding } from "@repo/contracts";
import type { NodeImpl, NodeOutcome, Recover } from "../context";
import { buildTemplateAnswer } from "../fallbacks";
import { confidenceFor, weatherRequired } from "../inputs";
import { SYNTHESIZER_SYSTEM, synthesizerUser, type SynthesizerContext } from "../prompts/synthesizer";
import type { Draft, RunStateValue } from "../state";
import type { Ledger } from "../ledger";

function findingsOf(state: RunStateValue): SynthesizerContext["findings"] {
  const outputs = { event: state.eventOut, weather: state.weatherOut, sentiment: state.sentimentOut, macro: state.macroOut, analogs: state.analogsOut };
  return Object.entries(outputs).flatMap(([node, out]) =>
    out?.status === "ok"
      ? (out.findings as Finding[]).map((f) => ({ node, template: f.text.template, evidenceKeys: f.evidenceKeys }))
      : [],
  );
}

function unavailableOf(state: RunStateValue): SynthesizerContext["unavailable"] {
  const outputs = { event: state.eventOut, weather: weatherRequired(state) ? state.weatherOut : null, sentiment: state.sentimentOut, macro: state.macroOut, analogs: state.analogsOut, risk: state.riskOut, hedging: state.hedgingOut };
  return Object.entries(outputs).flatMap(([node, out]) => (out?.status === "unavailable" ? [{ node, reason: out.reason }] : []));
}

export function synthesizerContext(state: RunStateValue, query: string, mode: string, ledger: Ledger): SynthesizerContext {
  const event = state.eventOut?.status === "ok" ? state.eventOut.profile : null;
  const risk = state.riskOut?.status === "ok" ? state.riskOut.report : null;
  const hedge = state.hedgingOut?.status === "ok" ? state.hedgingOut.plan : null;
  const repairing = state.repairsUsed > 0;
  return {
    question: query,
    mode,
    intent: state.plan?.intent ?? "event_impact",
    flags: {
      replay: mode === "replay",
      hypothetical: state.plan?.event.source === "hypothetical",
      perfectForecastReplay: state.weatherOut?.status === "ok" && state.weatherOut.forecastLabel === "perfect_forecast_replay",
    },
    event: event && {
      type: event.type,
      subtype: event.subtype,
      source: event.source,
      title: event.title,
      entities: event.entities,
      externalNames: event.externalNames,
      peerSymbols: event.peerSymbols,
      affectedSectors: event.affectedSectors,
      factorDirections: event.factorDirections,
      severity: event.severity,
    },
    channels: risk?.channels.map((c) => ({
      symbol: c.symbol,
      channels: c.channels.map((l) => ({ channel: l.channel, reason: l.reason, detail: l.detail, evidenceKeys: l.evidenceKeys })),
      expectedSign: c.expectedSign,
    })),
    hedgeActions: hedge?.actions.map((a) => ({
      type: a.type,
      side: a.side,
      symbol: a.symbol,
      timing: a.timing,
      rationale: a.rationale.template,
      evidenceKeys: a.evidenceKeys,
    })),
    findings: findingsOf(state),
    unavailable: unavailableOf(state),
    evidence: ledger.all().map((e) => ({ key: e.key, label: e.label, value: formatEvidence(e), basis: e.basis, producedBy: e.producedBy })),
    repair: repairing ? { violations: state.violations, previousDraft: state.draft?.draft ?? null } : null,
  };
}

function templateOutcome(state: RunStateValue, ledger: Ledger, summary: string): NodeOutcome {
  const draft: Draft = { draft: buildTemplateAnswer(state, ledger, "synthesizer"), source: "template", confidence: confidenceFor(state, ledger) };
  return { update: { draft }, status: "degraded", summary, output: draft.draft };
}

export const synthesizerNode: NodeImpl = async (state, env) => {
  const { ctx } = env;
  const result = await env.llm.parseStructured({
    label: "synthesizer",
    tier: "reasoning",
    effort: "medium",
    system: SYNTHESIZER_SYSTEM,
    user: synthesizerUser(synthesizerContext(state, ctx.query, ctx.mode, ctx.ledger)),
    schema: AnswerDraft,
    maxTokens: MAX_TOKENS.synthesizer,
  });
  if (!result.ok) {
    ctx.warnings.push(`synthesizer: template answer used (${result.reason})`);
    return templateOutcome(state, ctx.ledger, `Template answer (${result.reason})`);
  }
  const draft: Draft = { draft: result.data, source: "model", confidence: confidenceFor(state, ctx.ledger) };
  return {
    update: { draft },
    status: "done",
    summary: state.repairsUsed > 0 ? "Answer redrafted after verification." : "Answer drafted with evidence placeholders.",
    output: draft.draft,
  };
};

export const synthesizerRecover: Recover = (state, env) => templateOutcome(state, env.ctx.ledger, "Template answer (synthesizer failed)");
