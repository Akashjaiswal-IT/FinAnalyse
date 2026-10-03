"use client";

import { useEffect, useRef } from "react";
import { NODE_ORDER, type NodeName } from "@repo/contracts";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import { formatCost, formatDuration, formatTokens } from "~/lib/display";
import { NODE_TONE } from "~/lib/tone";
import type { NodeView } from "~/lib/run-state";
import { JsonBlock } from "./bits";
import { useRun } from "./run-context";

/** Every step of the run in graph order: what it did, the model and cost, the thinking summary, its output. */
export function StepsTab({ focusNode }: { focusNode: NodeName | null }) {
  const { view } = useRun();
  return (
    <ol className="space-y-3 p-4">
      {NODE_ORDER.map((node) => (
        <StepItem key={node} step={view.nodes[node]} focused={focusNode === node} />
      ))}
    </ol>
  );
}

function StepItem({ step, focused }: { step: NodeView; focused: boolean }) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "center" });
  }, [focused]);

  const tone = NODE_TONE[step.status];

  return (
    <li
      ref={ref}
      className={cn("space-y-2 rounded-md border bg-card/50 p-3", focused && "ring-2 ring-primary/60")}
      aria-current={focused ? "true" : undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold">{step.node}</span>
        <Badge variant="outline" className={cn("capitalize", tone.text, tone.border)}>
          {step.status}
        </Badge>
        {step.durationMs !== null && (
          <span className="font-mono text-xs text-muted-foreground">{formatDuration(step.durationMs)}</span>
        )}
        {step.starts > 1 && <span className="text-xs text-muted-foreground">ran {step.starts} times (verifier repair)</span>}
      </div>

      {step.status === "pending" && <p className="text-xs text-muted-foreground">Not started.</p>}
      {step.summary && <p className="text-sm leading-relaxed">{step.summary}</p>}

      {step.thinkingSummary && (
        <blockquote className="border-l-2 border-model/50 pl-3 text-xs leading-relaxed text-muted-foreground italic">
          <span className="mb-0.5 block text-[10px] tracking-wider text-model uppercase not-italic">Thinking summary</span>
          {step.thinkingSummary}
        </blockquote>
      )}

      {step.usage ? (
        <p className="font-mono text-[11px] text-muted-foreground">
          {step.usage.model} · {formatTokens(step.usage.tokensIn)} in / {formatTokens(step.usage.tokensOut)} out ·{" "}
          {formatCost(step.usage.costUsd)}
        </p>
      ) : (
        step.status !== "pending" &&
        step.status !== "running" && <p className="text-[11px] text-muted-foreground">No LLM call in this step.</p>
      )}

      {step.progress.length > 0 && (
        <ul className="list-inside list-disc text-xs text-muted-foreground">
          {step.progress.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}

      {step.error && <p className="text-xs text-negative">{step.error}</p>}

      {step.output !== null && <JsonBlock value={step.output} label="Output" defaultOpen={focused} />}
    </li>
  );
}
