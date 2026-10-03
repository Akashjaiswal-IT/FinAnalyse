"use client";

import type { ReactNode } from "react";
import { formatValue, type Confidence, type ExposureChannel } from "@repo/contracts";
import { cn } from "~/lib/utils";
import { signTone } from "~/lib/tone";
import { useRun } from "./run-context";

const CHANNEL_BAR: Record<ExposureChannel, string> = {
  direct: "bg-primary",
  peer: "bg-model",
  factor: "bg-info",
};

const CONFIDENCE_LEVEL: Record<Confidence, number> = { low: 1, medium: 2, high: 3 };
const CONFIDENCE_BAR: Record<Confidence, string> = { low: "bg-negative", medium: "bg-warning", high: "bg-positive" };

function Tile({ label, children, sub, className }: { label: string; children: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 rounded-lg border bg-card/60 px-3 py-2.5 backdrop-blur-md", className)}>
      <div className="text-[10px] tracking-wider text-muted-foreground uppercase">{label}</div>
      <div className="mt-1 truncate font-mono text-xl leading-tight font-semibold">{children}</div>
      {sub && <div className="mt-1 truncate text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** The run's headline numbers at a glance, all as the server computed them; the widths only draw them. */
export function ImpactStrip() {
  const { view } = useRun();
  const risk = view.risk;
  if (!risk) return null;
  const plan = view.hedgePlan;
  const exposed = risk.exposedValue.filter((e) => e.value > 0);
  const exposedTotal = exposed.reduce((a, e) => a + e.value, 0);

  return (
    <div className="grid animate-rise-in grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Impact at a glance">
      <Tile
        label="Scenario P&L"
        sub={
          plan ? (
            <>
              after hedges <span className={signTone(plan.after.scenarioPnl)}>{formatValue("usd", plan.after.scenarioPnl)}</span>
            </>
          ) : (
            `${formatValue("pct_signed", risk.scenario.pctNav)} of NAV, before hedges`
          )
        }
      >
        <span className={signTone(risk.scenario.pnl)}>{formatValue("usd", risk.scenario.pnl)}</span>
      </Tile>
      <Tile label="1-day VaR, 95%" sub={`5-day ${formatValue("usd", risk.var5d.var95)}`}>
        {formatValue("usd", risk.var1d.var95)}
        {plan && <span className="ml-1.5 text-xs font-normal text-info">→ {formatValue("usd", plan.after.var1d.var95)}</span>}
      </Tile>
      <Tile
        label="Exposed value"
        sub={
          <span className="flex flex-wrap gap-x-2">
            {exposed.map((e) => (
              <span key={e.channel} className="flex items-center gap-1">
                <span className={cn("size-1.5 rounded-full", CHANNEL_BAR[e.channel])} aria-hidden />
                {e.channel} {formatValue("usd", e.value)}
              </span>
            ))}
          </span>
        }
      >
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label="Exposed value by channel">
          {exposed.map((e) => (
            <div key={e.channel} className={cn("h-full", CHANNEL_BAR[e.channel])} style={{ width: `${(100 * e.value) / exposedTotal}%` }} />
          ))}
        </div>
      </Tile>
      <Tile
        label="Confidence"
        sub={view.forecast ? `${formatValue("ratio", view.forecast.effectiveN)} effective past events` : "waiting for the forecast"}
      >
        {view.confidence ? (
          <span className="flex items-center gap-2">
            <span className="capitalize">{view.confidence}</span>
            <span className="flex gap-0.5" aria-hidden>
              {[1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={cn("h-3 w-1.5 rounded-sm", i <= CONFIDENCE_LEVEL[view.confidence!] ? CONFIDENCE_BAR[view.confidence!] : "bg-muted")}
                />
              ))}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">…</span>
        )}
      </Tile>
    </div>
  );
}
