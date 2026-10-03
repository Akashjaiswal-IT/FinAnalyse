"use client";

import { useEffect, useMemo, useRef } from "react";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import { formatCost, formatDateTime, formatDuration, formatOffset, formatTokens, humanize } from "~/lib/display";
import type { StampedEvent } from "~/hooks/use-run-stream";
import { PanelMessage, SectionLabel } from "./bits";
import { useRun, type DrilldownTarget } from "./run-context";

interface LogLine {
  key: string;
  offsetMs: number;
  tag: string;
  tone: string;
  node: string | null;
  text: string;
  detail: string | null;
  target: DrilldownTarget | null;
}

const TONE = {
  neutral: "border-border text-muted-foreground",
  running: "border-info/40 bg-info/10 text-info",
  done: "border-positive/40 bg-positive/10 text-positive",
  warn: "border-warning/40 bg-warning/10 text-warning",
  bad: "border-negative/40 bg-negative/10 text-negative",
  evidence: "border-model/40 bg-model/10 text-model",
} as const;

function toLine(stamped: StampedEvent, startedAt: number): LogLine {
  const { event, seq, receivedAt } = stamped;
  const base = { key: String(seq), offsetMs: receivedAt - startedAt, node: null, detail: null, target: null };

  switch (event.type) {
    case "run.started":
      return {
        ...base,
        tag: "run",
        tone: TONE.neutral,
        text: `Run started · ${event.mode} · ${formatDateTime(event.asOf)}`,
        target: { kind: "run" },
      };
    case "step.started":
      return { ...base, tag: "start", tone: TONE.running, node: event.node, text: "started", target: { kind: "node", node: event.node } };
    case "step.progress":
      return { ...base, tag: "progress", tone: TONE.neutral, node: event.node, text: event.message, target: { kind: "node", node: event.node } };
    case "step.completed": {
      const usage = event.usage
        ? `${event.usage.model} · ${formatTokens(event.usage.tokensIn)} in / ${formatTokens(event.usage.tokensOut)} out · ${formatCost(event.usage.costUsd)}`
        : null;
      return {
        ...base,
        tag: event.status,
        tone: event.status === "done" ? TONE.done : event.status === "degraded" ? TONE.warn : TONE.neutral,
        node: event.node,
        text: `${event.summary} · ${formatDuration(event.durationMs)}`,
        detail: usage,
        target: { kind: "node", node: event.node },
      };
    }
    case "step.failed":
      return {
        ...base,
        tag: "failed",
        tone: TONE.bad,
        node: event.node,
        text: `${event.error} · ${formatDuration(event.durationMs)}`,
        target: { kind: "node", node: event.node },
      };
    case "evidence.added": {
      const first = event.evidence[0]?.key;
      const last = event.evidence.at(-1)?.key;
      const rows = event.evidence.length;
      return {
        ...base,
        tag: "evidence",
        tone: TONE.evidence,
        text: `${rows} ${rows === 1 ? "row" : "rows"}${first && last && first !== last ? ` (${first} to ${last})` : first ? ` (${first})` : ""}`,
        target: first ? { kind: "evidence", key: first } : null,
      };
    }
    case "run.completed": {
      const totals = event.totals;
      return {
        ...base,
        tag: event.status,
        tone: event.status === "succeeded" ? TONE.done : event.status === "partial" ? TONE.warn : TONE.bad,
        text: `Run ${event.status}${event.confidence ? ` · ${event.confidence} confidence` : ""} · ${formatDuration(totals.durationMs)} · ${formatCost(totals.costUsd)}`,
        target: { kind: "run" },
      };
    }
    case "run.failed":
      return { ...base, tag: "failed", tone: TONE.bad, text: event.error, target: { kind: "run" } };
  }
}

/** The run's `RunEvent`s in order, each stamped with the time since the run started. Click a line to audit it. */
export function StepLog({ events }: { events: readonly StampedEvent[] }) {
  const { view, openDrilldown } = useRun();
  const scroller = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => {
    const first = events[0]?.receivedAt ?? 0;
    return events.map((e) => toLine(e, first));
  }, [events]);

  // Follow the log while it grows.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Step log">
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <SectionLabel>Step log</SectionLabel>
        {view.phase !== "idle" && (
          <Badge
            variant="outline"
            className={cn(
              "capitalize",
              view.phase === "running" && TONE.running,
              view.phase === "succeeded" && TONE.done,
              view.phase === "partial" && TONE.warn,
              view.phase === "failed" && TONE.bad,
            )}
          >
            {view.phase}
          </Badge>
        )}
      </header>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto p-2">
        {lines.length === 0 ? (
          <PanelMessage>No run yet. Each step the agents take appears here as it happens.</PanelMessage>
        ) : (
          <ol className="space-y-0.5">
            {lines.map((line) => (
              <li key={line.key}>
                <button
                  type="button"
                  disabled={line.target === null}
                  onClick={() => line.target && openDrilldown(line.target)}
                  className="grid w-full cursor-pointer grid-cols-[3.4rem_1fr] gap-x-2 rounded px-1.5 py-1 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <span className="pt-px font-mono text-[10px] text-muted-foreground">{formatOffset(line.offsetMs)}</span>
                  <span className="min-w-0 space-y-0.5">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className={cn("px-1.5 py-0 text-[10px] capitalize", line.tone)}>
                        {humanize(line.tag)}
                      </Badge>
                      {line.node && <span className="font-mono text-[11px] font-medium">{line.node}</span>}
                    </span>
                    <span className="block text-xs leading-snug text-foreground/90">{line.text}</span>
                    {line.detail && <span className="block font-mono text-[10px] text-muted-foreground">{line.detail}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
