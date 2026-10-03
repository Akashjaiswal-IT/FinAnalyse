"use client";

import { useEffect, useRef } from "react";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";
import { formatCost, formatDuration, formatTokens } from "~/lib/display";
import { CONFIDENCE_TONE } from "~/lib/tone";
import { PanelMessage, SectionLabel } from "./bits";
import { useRun } from "./run-context";
import { TemplateText } from "./template-text";

/** The verified answer. It reads `run.completed` only, so nothing the verifier could still reject is shown. */
export function AnswerCard() {
  const { view, openDrilldown } = useRun();
  const { answer } = view;
  const ref = useRef<HTMLDivElement>(null);

  // Bring the answer into view when it first arrives.
  const hasAnswer = answer !== null;
  useEffect(() => {
    if (hasAnswer) ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hasAnswer]);

  if (!answer) {
    if (view.phase === "failed") {
      return <PanelMessage tone="negative">The run failed{view.error ? `: ${view.error}` : "."}</PanelMessage>;
    }
    if (view.phase === "running") {
      return (
        <Card className="gap-0 py-0" aria-busy="true">
          <CardContent className="space-y-2 p-4">
            <SectionLabel>Answer</SectionLabel>
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <p className="text-xs text-muted-foreground">
              The answer appears after the verifier has checked every number against the evidence.
            </p>
          </CardContent>
        </Card>
      );
    }
    return <PanelMessage>Ask a question to get an evidence-backed answer.</PanelMessage>;
  }

  const verification = view.verification;
  const digits = verification?.checks.find((c) => c.name === "digits");
  const forecastLabel = view.weather?.status === "ok" ? view.weather.forecastLabel : null;
  const totals = view.totals;

  return (
    <div ref={ref} className="scroll-mt-2">
      <Card className="gap-0 py-0">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <SectionLabel className="mr-1">Answer</SectionLabel>
            <Badge variant="outline" className={cn("capitalize", CONFIDENCE_TONE[answer.confidence])}>
              {answer.confidence} confidence
            </Badge>
            {answer.badges.replay && <Badge variant="outline">replay</Badge>}
            {forecastLabel === "perfect_forecast_replay" && (
              <Badge variant="outline" className="border-warning/50 bg-warning/10 text-warning">
                perfect-forecast replay
              </Badge>
            )}
            {answer.badges.hypothetical && (
              <Badge variant="outline" className="border-warning/50 bg-warning/10 text-warning">
                hypothetical
              </Badge>
            )}
            {answer.source === "template" && (
              <Badge variant="outline" className="border-warning/50 bg-warning/10 text-warning">
                template answer
              </Badge>
            )}
            {view.phase === "partial" && (
              <Badge variant="outline" className="border-warning/50 bg-warning/10 text-warning">
                partial run
              </Badge>
            )}
          </div>

          <h2 className="text-[17px] leading-snug font-semibold">
            <TemplateText text={answer.headline} />
          </h2>
          <p className="text-sm leading-relaxed text-foreground/90">
            <TemplateText text={answer.summary} />
          </p>

          <ul className="space-y-2.5">
            {answer.bullets.map((bullet, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-primary" aria-hidden />
                <span>
                  <TemplateText text={bullet.text} />
                </span>
              </li>
            ))}
          </ul>

          {answer.caveats.length > 0 && (
            <div className="space-y-1 border-t pt-3">
              <SectionLabel>Caveats</SectionLabel>
              <ul className="space-y-1 text-xs leading-relaxed text-muted-foreground">
                {answer.caveats.map((caveat, i) => (
                  <li key={i}>
                    <TemplateText text={caveat} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {view.warnings.length > 0 && (
            <ul className="space-y-1 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning" role="status">
              {view.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {verification && (
                <button
                  type="button"
                  onClick={() => openDrilldown({ kind: "verification" })}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1 rounded hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    verification.passed ? "text-positive" : "text-warning",
                  )}
                >
                  {verification.passed ? <ShieldCheck className="size-3.5" aria-hidden /> : <ShieldAlert className="size-3.5" aria-hidden />}
                  {verification.passed ? "Verified" : "Verification failed"}
                  {digits && ` · ${digits.violations.length} ungrounded ${digits.violations.length === 1 ? "number" : "numbers"}`}
                  {verification.repairAttempted && " · repaired once"}
                </button>
              )}
              {totals && (
                <span className="font-mono">
                  {formatTokens(totals.tokensIn)} in / {formatTokens(totals.tokensOut)} out · {formatCost(totals.costUsd)} ·{" "}
                  {formatDuration(totals.durationMs)}
                </span>
              )}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => openDrilldown({ kind: "run" })}>
              Audit this run
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
