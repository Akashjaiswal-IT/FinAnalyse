"use client";

import { CircleCheck, CircleX } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import { humanize } from "~/lib/display";
import { PanelMessage } from "./bits";
import { useRun } from "./run-context";

const CHECK_LABEL: Record<string, string> = {
  placeholders: "Every evidence placeholder exists in the ledger",
  digits: "No digits outside evidence placeholders in authored text",
  hedge_limits: "Every hedge action is inside the limits and cites evidence",
  universe: "Only universe symbols appear",
  caveats: "Caveats name every unavailable or stale input",
};

/** The verifier's report: the five grounding checks, any violations, and caveats it appended. */
export function VerificationTab() {
  const { view } = useRun();
  const v = view.verification;

  if (!v) {
    return (
      <div className="p-4">
        <PanelMessage>The verifier has not run yet.</PanelMessage>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className={cn(v.passed ? "border-positive/40 bg-positive/10 text-positive" : "border-warning/40 bg-warning/10 text-warning")}
        >
          {v.passed ? "passed" : "failed"}
        </Badge>
        {v.repairAttempted && <span className="text-xs text-muted-foreground">The synthesizer was asked to repair its draft once.</span>}
        {!v.passed && (
          <span className="text-xs text-muted-foreground">The deterministic template answer was used instead of the model draft.</span>
        )}
      </div>

      <ul className="space-y-2">
        {v.checks.map((check) => (
          <li key={check.name} className="space-y-1 rounded-md border bg-card/50 p-3">
            <div className="flex items-start gap-2">
              {check.passed ? (
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-positive" aria-label="passed" />
              ) : (
                <CircleX className="mt-0.5 size-4 shrink-0 text-negative" aria-label="failed" />
              )}
              <div className="min-w-0">
                <div className="text-sm font-medium capitalize">{humanize(check.name)}</div>
                <div className="text-xs text-muted-foreground">{CHECK_LABEL[check.name] ?? ""}</div>
              </div>
            </div>
            {check.violations.length > 0 && (
              <ul className="list-inside list-disc pl-6 text-xs text-negative">
                {check.violations.map((violation, i) => (
                  <li key={i}>{violation}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {v.appendedCaveats.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">Caveats the verifier appended</h3>
          <ul className="list-inside list-disc text-xs text-muted-foreground">
            {v.appendedCaveats.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
