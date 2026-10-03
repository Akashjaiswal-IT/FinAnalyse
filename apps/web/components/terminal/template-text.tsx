"use client";

import { Fragment, useMemo } from "react";
import type { TemplateText as TemplateTextData } from "@repo/contracts";
import { splitTemplate } from "~/lib/template";
import { EvidenceChip } from "./evidence-chip";

/**
 * Renders an authored template with each `{{E12}}` as an evidence chip. The UI never types a number: what it
 * shows is the server's text between placeholders and values formatted from the ledger by @repo/contracts.
 */
export function TemplateText({ text }: { text: TemplateTextData }) {
  const segments = useMemo(() => splitTemplate(text.template), [text.template]);
  return (
    <>
      {segments.map((segment, i) =>
        segment.kind === "text" ? (
          <Fragment key={i}>{segment.text}</Fragment>
        ) : (
          <EvidenceChip key={i} evidenceKey={segment.key} />
        ),
      )}
    </>
  );
}
