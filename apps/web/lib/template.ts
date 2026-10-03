import { PLACEHOLDER_RE } from "@repo/contracts";

export type TemplateSegment = { kind: "text"; text: string } | { kind: "evidence"; key: string };

/**
 * Splits an LLM-authored template at its `{{E12}}` placeholders so each one can render as an evidence chip.
 * The text between placeholders is shown as written; every number on screen is a chip or server text.
 */
export function splitTemplate(template: string): TemplateSegment[] {
  const segments: TemplateSegment[] = [];
  let last = 0;
  for (const match of template.matchAll(PLACEHOLDER_RE)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ kind: "text", text: template.slice(last, index) });
    segments.push({ kind: "evidence", key: match[1] as string });
    last = index + match[0].length;
  }
  if (last < template.length) segments.push({ kind: "text", text: template.slice(last) });
  return segments;
}
