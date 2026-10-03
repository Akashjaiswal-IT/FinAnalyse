"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowUpRight, Newspaper } from "lucide-react";
import { formatEvidence, type Evidence } from "@repo/contracts";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import { formatDateTime, isHttpUrl } from "~/lib/display";
import { evidenceLinks, type EvidenceLink } from "~/lib/evidence-links";
import { trpc } from "~/trpc/client";
import { BASIS_TONE } from "~/lib/tone";
import { JsonBlock, PanelMessage } from "./bits";
import { useRun } from "./run-context";

/** The run's evidence ledger: every number an answer can cite, with its source, basis and as-of time. */
export function EvidenceTab({ focusKey }: { focusKey: string | null }) {
  const { view } = useRun();
  const analogs = trpc.analogs.list.useQuery({}, { staleTime: Infinity });
  if (view.evidence.length === 0) {
    return (
      <div className="p-4">
        <PanelMessage>No evidence yet. Rows appear as each step reads or computes a value.</PanelMessage>
      </div>
    );
  }
  return (
    <ul className="space-y-2 p-4">
      {view.evidence.map((e) => (
        <EvidenceRow key={e.key} evidence={e} focused={e.key === focusKey} links={evidenceLinks(e, analogs.data)} />
      ))}
    </ul>
  );
}

/** "Check it at the source": data series, storm archive, news query, the past event's references or the code. */
export function EvidenceLinks({ links }: { links: EvidenceLink[] }) {
  const { showNews } = useRun();
  if (links.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {links.map((l) =>
        "action" in l ? (
          showNews && (
            <button
              key={l.label}
              type="button"
              onClick={showNews}
              className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-[11px] text-info transition-colors hover:bg-info/10"
            >
              <Newspaper className="size-3" aria-hidden /> {l.label}
            </button>
          )
        ) : l.href.startsWith("/") ? (
          <Link key={l.href} href={l.href} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] text-info transition-colors hover:bg-info/10">
            {l.label}
          </Link>
        ) : (
          <a
            key={l.href}
            href={l.href}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] text-info transition-colors hover:bg-info/10"
          >
            {l.label} <ArrowUpRight className="size-3" aria-hidden />
          </a>
        ),
      )}
    </div>
  );
}

function EvidenceRow({ evidence, focused, links }: { evidence: Evidence; focused: boolean; links: EvidenceLink[] }) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "center" });
  }, [focused]);

  return (
    <li
      ref={ref}
      aria-current={focused ? "true" : undefined}
      className={cn("space-y-2 rounded-md border bg-card/50 p-3", focused && "ring-2 ring-primary/60")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs font-semibold text-primary">{evidence.key}</span>
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
          <p className="mt-1 text-sm">{evidence.label}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-base">{formatEvidence(evidence)}</div>
          <div className="font-mono text-[10px] text-muted-foreground">
            {evidence.value === null ? "no value" : `raw ${evidence.value}`}
            {evidence.unit ? ` · ${evidence.unit}` : ""}
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Source</dt>
        <dd>{evidence.source}</dd>
        {evidence.sourceRef && (
          <>
            <dt className="text-muted-foreground">Reference</dt>
            <dd className="wrap-break-word">
              {isHttpUrl(evidence.sourceRef) ? (
                <a href={evidence.sourceRef} target="_blank" rel="noreferrer noopener" className="text-info underline">
                  {evidence.sourceRef}
                </a>
              ) : (
                <span className="font-mono">{evidence.sourceRef}</span>
              )}
            </dd>
          </>
        )}
        <dt className="text-muted-foreground">As of</dt>
        <dd>{evidence.asOf ? formatDateTime(evidence.asOf) : "n/a"}</dd>
        <dt className="text-muted-foreground">Produced by</dt>
        <dd className="font-mono">{evidence.producedBy}</dd>
      </dl>

      <EvidenceLinks links={links} />
      {evidence.payload !== null && <JsonBlock value={evidence.payload} label="Inputs (payload)" />}
    </li>
  );
}
