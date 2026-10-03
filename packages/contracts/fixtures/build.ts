import { FIXTURE_SOURCE } from "../constants";
import { renderTemplate } from "../format";
import type { Evidence, TemplateText, Usage } from "../schemas";

// Helpers shared by the fixture runs. Every value they produce is fixture data, not a market or model result.

export function evidenceFactory(sourceRef: string, asOf: string) {
  return function ev(
    key: string,
    kind: Evidence["kind"],
    label: string,
    value: number | null,
    unit: Evidence["unit"],
    producedBy: string,
    extra: Partial<Evidence> = {},
  ): Evidence {
    return {
      key,
      kind,
      label,
      value,
      textValue: null,
      unit,
      basis: "computed",
      source: FIXTURE_SOURCE,
      sourceRef,
      asOf,
      stale: false,
      producedBy,
      payload: null,
      ...extra,
    };
  };
}

export function templater(evidence: readonly Evidence[]) {
  const lookup = (key: string) => evidence.find((e) => e.key === key);
  const tt = (template: string): TemplateText => {
    const { text, missing } = renderTemplate(template, lookup);
    if (missing.length > 0) throw new Error(`fixture template has unresolved keys: ${missing.join(", ")}`);
    return { template, rendered: text };
  };
  const finding = (template: string, keys: string[]) => ({ text: tt(template), evidenceKeys: keys });
  return { tt, finding };
}

export const usage = (model: string, tokensIn: number, tokensOut: number, costUsd: number): Usage => ({
  model,
  tokensIn,
  tokensOut,
  costUsd,
});
