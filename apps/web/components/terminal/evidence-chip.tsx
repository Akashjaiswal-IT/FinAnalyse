"use client";

import { useRef, useState } from "react";
import { formatEvidence } from "@repo/contracts";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "~/components/ui/hover-card";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import { formatDateTime, isHttpUrl } from "~/lib/display";
import { BASIS_TONE } from "~/lib/tone";
import { evidenceLinks } from "~/lib/evidence-links";
import { trpc } from "~/trpc/client";
import { EvidenceLinks } from "./drilldown-evidence";
import { useRun } from "./run-context";

/** Longer than the hover card's open delay, so every timer started before a click has fired by then. */
const AFTER_CLICK_QUIET_MS = 400;

/**
 * One number from the run's evidence ledger. Shows the formatted value; hover shows label, source and as-of;
 * click opens the row in the drilldown. Colour is the evidence basis (observed, computed, model, assumption).
 */
export function EvidenceChip({ evidenceKey }: { evidenceKey: string }) {
  const { view, openDrilldown } = useRun();
  const evidence = view.evidenceByKey[evidenceKey];
  const analogs = trpc.analogs.list.useQuery({}, { staleTime: Infinity, enabled: evidence?.source === "analog_events" });
  const links = evidence ? evidenceLinks(evidence, analogs.data) : [];
  const [cardOpen, setCardOpen] = useState(false);
  // A click opens the drilldown over the page. Radix keeps the open timers that pointer-enter and focus start
  // (closing clears only the latest), so one can fire after the click and put a hover card above the sheet,
  // where it takes the first Escape. Opens that land just after a click are ignored.
  const lastClick = useRef(0);

  if (!evidence) {
    // The ledger has no such key (yet). Never guess a value.
    return (
      <span
        title={`Evidence ${evidenceKey} is not in this run's ledger`}
        className="mx-0.5 inline-block rounded border border-dashed border-negative/60 px-1.5 font-mono text-[0.9em] text-negative"
      >
        {evidenceKey}?
      </span>
    );
  }

  const value = formatEvidence(evidence);

  return (
    <HoverCard open={cardOpen} onOpenChange={(next) => setCardOpen(next && Date.now() - lastClick.current > AFTER_CLICK_QUIET_MS)} openDelay={120} closeDelay={60}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          aria-label={`${evidence.label}: ${value}. Open evidence ${evidence.key}`}
          onClick={() => {
            lastClick.current = Date.now();
            setCardOpen(false);
            openDrilldown({ kind: "evidence", key: evidence.key });
          }}
          className={cn(
            "mx-0.5 inline-flex cursor-pointer items-baseline rounded border px-1.5 py-px align-baseline font-mono text-[0.92em] leading-snug transition hover:brightness-125 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            BASIS_TONE[evidence.basis],
            evidence.stale && "border-dashed",
          )}
        >
          {value}
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="top" className="w-80 space-y-2 text-xs">
        <div className="flex items-start justify-between gap-2">
          <span className="font-medium text-foreground">{evidence.label}</span>
          <span className="shrink-0 font-mono text-muted-foreground">{evidence.key}</span>
        </div>
        <div className="font-mono text-base text-foreground">{value}</div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={cn("capitalize", BASIS_TONE[evidence.basis])}>
            {evidence.basis}
          </Badge>
          <Badge variant="outline">{evidence.kind}</Badge>
          {evidence.stale && (
            <Badge variant="outline" className="border-warning/40 text-warning">
              stale
            </Badge>
          )}
        </div>
        <dl className="grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1 text-muted-foreground">
          <dt>Source</dt>
          <dd className="wrap-break-word text-foreground">{evidence.source}</dd>
          {evidence.sourceRef && (
            <>
              <dt>Reference</dt>
              <dd className="wrap-break-word text-foreground">
                {isHttpUrl(evidence.sourceRef) ? "link in the drilldown" : evidence.sourceRef}
              </dd>
            </>
          )}
          <dt>As of</dt>
          <dd className="text-foreground">{evidence.asOf ? formatDateTime(evidence.asOf) : "n/a"}</dd>
          <dt>Produced by</dt>
          <dd className="text-foreground">{evidence.producedBy}</dd>
        </dl>
        <EvidenceLinks links={links} />
        <p className="text-[11px] text-muted-foreground">Click the number for the full evidence row.</p>
      </HoverCardContent>
    </HoverCard>
  );
}
