import { MAX_TOKENS, Notes, formatEvidence, type Finding } from "@repo/contracts";
import type { NodeEnv } from "./context";
import { NOTES_SYSTEM, notesUser } from "./prompts/notes";
import { digitViolations, placeholderViolations, unknownSymbols } from "./verify";

export type NoteLabel = "notes:weather" | "notes:sentiment" | "notes:macro" | "notes:analogs";

/** Haiku words one to three findings from a node's own evidence (SPEC 5.5). A finding that cites a key the node
 * did not produce, or carries a digit or an unknown symbol, is dropped; if none survives the deterministic
 * findings are used. The numbers never come from here. */
export async function writeFindings(
  env: NodeEnv,
  label: NoteLabel,
  focus: string,
  result: unknown,
  keys: string[],
  fallback: Finding[],
): Promise<Finding[]> {
  const { ledger } = env.ctx;
  const allowed = new Set(keys);
  const evidence = keys.flatMap((k) => {
    const row = ledger.get(k);
    return row ? [{ key: k, label: row.label, value: formatEvidence(row) }] : [];
  });
  if (evidence.length === 0) return fallback;
  const reply = await env.llm.parseStructured({
    label,
    tier: "fast",
    system: NOTES_SYSTEM,
    user: notesUser(focus, result, evidence),
    schema: Notes,
    maxTokens: MAX_TOKENS.notes,
  });
  if (!reply.ok) return fallback;
  const good = reply.data.findings.filter(
    (f) =>
      f.evidenceKeys.every((k) => allowed.has(k)) &&
      placeholderViolations(f.template, ledger).length === 0 &&
      digitViolations(f.template).length === 0 &&
      unknownSymbols(f.template).length === 0,
  );
  return good.length > 0 ? good.map((f) => ({ text: ledger.text(f.template), evidenceKeys: f.evidenceKeys })) : fallback;
}

/** A deterministic finding from a template, for when the model is unavailable. */
export const finding = (env: NodeEnv, template: string, keys: string[]): Finding => ({
  text: env.ctx.ledger.text(template),
  evidenceKeys: keys,
});
