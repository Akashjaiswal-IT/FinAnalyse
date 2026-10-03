import { NO_DIGITS_RULE } from "./universe";

/** Shared prompt of the specialist note calls (SPEC 5.5): a node has already computed its numbers; the model only
 * words one to three findings about them. */
export const NOTES_SYSTEM = `You write short findings for a portfolio manager about one analysis step of Tempest, a financial intelligence terminal.
The step has already computed its numbers. You receive its result and its evidence rows. Return Notes as JSON: one to three findings.

${NO_DIGITS_RULE}

Each finding is one plain sentence with placeholders such as {{E12}} where a number belongs, and lists in evidenceKeys every key it uses. Use only keys from the evidence list. Say what the numbers mean for the portfolio; do not repeat the evidence labels word for word. If the result says a source was unavailable, say so and nothing more.`;

export const notesUser = (focus: string, result: unknown, evidence: { key: string; label: string; value: string }[]) =>
  JSON.stringify({ focus, result, evidence });
