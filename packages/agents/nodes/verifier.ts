import type { Verification } from "@repo/contracts";
import type { NodeImpl, NodeOutcome, Recover } from "../context";
import { buildTemplateAnswer } from "../fallbacks";
import { confidenceFor, requiredCaveats } from "../inputs";
import type { Ledger } from "../ledger";
import { renderAnswer } from "../render";
import type { Draft, RunStateUpdate, RunStateValue } from "../state";
import { verifyAnswer } from "../verify";

function check(state: RunStateValue, ledger: Ledger, draft: Draft) {
  return verifyAnswer({
    draft: draft.draft,
    hedgePlan: state.hedgingOut?.status === "ok" ? state.hedgingOut.plan : null,
    ledger,
    needs: requiredCaveats(state, ledger),
    nav: state.riskOut?.status === "ok" ? state.riskOut.report.nav : null,
  });
}

function finish(state: RunStateValue, ledger: Ledger, query: string, draft: Draft, verification: Verification, caveats: string[]): NodeOutcome {
  const answer = renderAnswer(draft.draft, caveats, ledger, {
    confidence: draft.confidence,
    badges: { replay: state.plan?.event.source === "replay", hypothetical: state.plan?.event.source === "hypothetical" },
    source: draft.source,
  });
  const update: RunStateUpdate = {
    answer,
    verification,
    history: { runId: state.runId, query, headline: answer.headline.rendered },
  };
  return {
    update,
    status: draft.source === "template" && !verification.passed ? "degraded" : "done",
    summary: verification.passed ? "All grounding checks passed." : "Model draft failed verification; template answer used.",
    output: verification,
  };
}

/** Grounding and constraint checks (SPEC 5.6). The first failed draft goes back to the synthesizer once; a second
 * failure ships the deterministic template answer. */
export const verifierNode: NodeImpl = (state, env) => {
  const { ledger } = env.ctx;
  const draft = state.draft;
  if (!draft) throw new Error("the verifier received no draft");
  const result = check(state, ledger, draft);
  const repairAttempted = state.repairsUsed > 0;
  const verification: Verification = {
    passed: result.passed,
    repairAttempted,
    checks: result.checks,
    appendedCaveats: result.appendedCaveats,
  };

  if (result.passed) {
    return finish(state, ledger, env.ctx.query, draft, verification, result.caveats);
  }

  if (!repairAttempted && draft.source === "model") {
    return {
      update: { repairsUsed: 1, violations: result.violations },
      status: "done",
      summary: `Verification found ${result.violations.length} violations; asking for one repair.`,
      output: verification,
    };
  }

  const fallback: Draft = { draft: buildTemplateAnswer(state, ledger, "verifier"), source: "template", confidence: confidenceFor(state, ledger) };
  const templated = check(state, ledger, fallback);
  env.ctx.warnings.push("verifier: template answer used after a failed repair");
  return finish(state, ledger, env.ctx.query, fallback, { ...verification, appendedCaveats: templated.appendedCaveats }, templated.caveats);
};

/** A verifier crash must not ship an unchecked model draft: fall back to the template answer. */
export const verifierRecover: Recover = (state, env) => {
  const fallback: Draft = { draft: buildTemplateAnswer(state, env.ctx.ledger, "verifier"), source: "template", confidence: confidenceFor(state, env.ctx.ledger) };
  return finish(
    state,
    env.ctx.ledger,
    env.ctx.query,
    fallback,
    { passed: false, repairAttempted: state.repairsUsed > 0, checks: [], appendedCaveats: [] },
    fallback.draft.caveats,
  );
};
