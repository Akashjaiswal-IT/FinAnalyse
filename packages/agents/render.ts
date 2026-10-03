import type { Answer, AnswerDraft, Confidence } from "@repo/contracts";
import type { Ledger } from "./ledger";

/** Draft templates to the stored `Answer`: each text keeps its template and its rendering (SPEC 5.6). */
export function renderAnswer(
  draft: AnswerDraft,
  caveats: string[],
  ledger: Ledger,
  meta: { confidence: Confidence; badges: Answer["badges"]; source: Answer["source"] },
): Answer {
  return {
    headline: ledger.text(draft.headline),
    summary: ledger.text(draft.summary),
    bullets: draft.bullets.map((b) => ({ text: ledger.text(b.text), evidenceKeys: b.evidenceKeys })),
    caveats: caveats.map((c) => ledger.text(c)),
    confidence: meta.confidence,
    badges: meta.badges,
    source: meta.source,
  };
}
