import type { AnswerDraft } from "@repo/contracts";
import type { Ledger } from "./ledger";
import type { RunStateValue } from "./state";
import { forecastTag, TAG } from "./tags";

const FORECAST_SENTENCES: readonly [string, string][] = [
  ["WTI", "WTI crude"],
  ["GLD", "gold"],
  ["SPY", "the S&P 500"],
  ["TLT", "long Treasuries"],
  ["GULF_GASOLINE", "Gulf Coast gasoline"],
  ["HH_NATGAS", "natural gas"],
];

/** The deterministic answer used when the model's draft cannot be repaired (SPEC 5.6). Every sentence is built
 * from rows the nodes tagged; a sentence whose rows are missing is left out, never filled with a guess. */
export function buildTemplateAnswer(state: RunStateValue, ledger: Ledger, producer: "synthesizer" | "verifier"): AnswerDraft {
  const k = (tag: string) => ledger.tagged(tag);
  const ph = (tag: string) => {
    const key = k(tag);
    return key ? `{{${key}}}` : null;
  };
  const bullets: AnswerDraft["bullets"] = [];
  const bullet = (parts: (string | null)[], build: (p: string[]) => string) => {
    if (parts.some((p) => p === null)) return;
    const resolved = parts as string[];
    const keys = resolved.map((p) => p.slice(2, -2));
    bullets.push({ text: build(resolved), evidenceKeys: keys });
  };

  const title = ph(TAG.eventTitle);
  bullet([title, ph(TAG.eventArticles), ph(TAG.eventVolZ)], ([t, a, z]) =>
    `${t} is covered by ${a} retrieved articles, a news volume z-score of ${z}.`,
  );
  bullet([ph(TAG.exposedDirect), ph(TAG.exposedPeer), ph(TAG.exposedFactor)], ([d, p, f]) =>
    `Holdings worth ${d} are directly exposed, ${p} through peers and ${f} through factors.`,
  );
  const forecasts = FORECAST_SENTENCES.flatMap(([target, label]) => {
    const p = ph(forecastTag(target));
    return p ? [`${label} ${p}`] : [];
  });
  const effN = ph(TAG.analogsEffectiveN);
  if (forecasts.length > 0 && effN) {
    const keys = [...forecasts.flatMap((f) => [...f.matchAll(/\{\{(E\d+)\}\}/g)].map((m) => m[1] as string)), effN.slice(2, -2)];
    bullets.push({
      text: `Similar past events (effective sample ${effN}) point to ${forecasts.join(", ")} over five trading days.`,
      evidenceKeys: keys,
    });
  }
  bullet([ph(TAG.macroVix)], ([v]) => `Market volatility reads ${v} on the VIX.`);
  bullet([ph(TAG.hedgeGross), ph(TAG.hedgeAfterPnl)], ([g, a]) =>
    `The proposed hedges have gross notional ${g} and put the scenario result at ${a}.`,
  );

  if (bullets.length === 0) {
    const key = ledger.add(producer, {
      kind: "computation",
      label: "Evidence rows recorded for this run",
      value: ledger.all().length,
      unit: "count",
      basis: "computed",
      source: "tempest",
      sourceRef: "ledger",
    });
    bullets.push({ text: `Only {{${key}}} evidence rows were available, so no quantitative claim is made.`, evidenceKeys: [key] });
  }

  const pnl = ph(TAG.riskScenarioPnl);
  const nav = ph(TAG.riskNav);
  const var1d = ph(TAG.riskVar1d);
  const summary =
    pnl && nav
      ? `The scenario result is ${pnl} on a ${nav} portfolio${var1d ? `, against a one-day value at risk of ${var1d}` : ""}.`
      : "Quantitative risk figures were not available for this run.";

  const unplanned = state.plan === null;
  return {
    headline: title ? `${title}: portfolio impact estimate` : "Portfolio impact estimate",
    summary: unplanned ? "The question could not be planned; no analysis was run." : summary,
    bullets,
    caveats: ["This answer was assembled from structured data without model-written text."],
  };
}
