"use client";

import { formatValue } from "@repo/contracts";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent } from "~/components/ui/card";
import { humanize } from "~/lib/display";
import { signTone } from "~/lib/tone";
import { SectionLabel, Stat } from "./bits";
import { useRun } from "./run-context";

const POSITIVE = "var(--positive)";
const NEGATIVE = "var(--negative)";
const TOOLTIP_STYLE = { fontSize: 11, background: "var(--popover)", border: "1px solid var(--border)" };
const usd = (v: number) => formatValue("usd", v);

/** Scenario P&L by sector and channel, VaR, and the before/after comparison once a hedge plan exists. */
export function RiskSummary() {
  const { view } = useRun();
  const risk = view.risk;
  if (!risk) return null;
  const plan = view.hedgePlan;

  const sectors = [...risk.scenario.perSector].sort((a, b) => a.pnl - b.pnl).map((s) => ({ name: humanize(s.sector), pnl: s.pnl }));
  const compare = plan
    ? [
        { name: "Scenario P&L", before: plan.before.scenarioPnl, after: plan.after.scenarioPnl },
        { name: "1-day VaR 95%", before: plan.before.var1d.var95, after: plan.after.var1d.var95 },
        { name: "5-day VaR 95%", before: plan.before.var5d.var95, after: plan.after.var5d.var95 },
      ]
    : [];

  return (
    <Card className="gap-0 py-0">
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Risk</SectionLabel>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          <Stat label="Scenario P&L">
            <span className={signTone(risk.scenario.pnl)}>
              {usd(risk.scenario.pnl)} ({formatValue("pct_signed", risk.scenario.pctNav)})
            </span>
          </Stat>
          <Stat label="1-day VaR / CVaR 95%">
            {usd(risk.var1d.var95)} / {usd(risk.var1d.cvar95)}
          </Stat>
          <Stat label="5-day VaR / CVaR 95%">
            {usd(risk.var5d.var95)} / {usd(risk.var5d.cvar95)}
          </Stat>
          <Stat label="Analog P&L mean / worst">
            {risk.analogPnl ? `${usd(risk.analogPnl.weightedMean)} / ${usd(risk.analogPnl.worst)}` : "n/a"}
          </Stat>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {risk.exposedValue.map((e) => (
            <span key={e.channel}>
              <span className="text-muted-foreground capitalize">{e.channel}</span> <span className="font-mono">{usd(e.value)}</span>
            </span>
          ))}
        </div>

        {sectors.length > 0 && (
          <div style={{ height: 24 + sectors.length * 22 }} role="img" aria-label="Scenario P&L by sector">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sectors} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid horizontal={false} strokeOpacity={0.15} />
                <XAxis type="number" tickFormatter={usd} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={100} interval={0} tick={{ fontSize: 10 }} />
                <ReferenceLine x={0} strokeOpacity={0.4} />
                <Tooltip cursor={{ fillOpacity: 0.05 }} contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [usd(v), "Scenario P&L"]} />
                <Bar dataKey="pnl" isAnimationActive={false}>
                  {sectors.map((s) => (
                    <Cell key={s.name} fill={s.pnl >= 0 ? POSITIVE : NEGATIVE} fillOpacity={0.7} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {compare.length > 0 && (
          <div className="h-40" role="img" aria-label="Scenario P&L and VaR before and after the hedge plan">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={compare} margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid vertical={false} strokeOpacity={0.15} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={usd} tick={{ fontSize: 10 }} width={64} />
                <ReferenceLine y={0} strokeOpacity={0.4} />
                <Tooltip cursor={{ fillOpacity: 0.05 }} contentStyle={TOOLTIP_STYLE} formatter={(v: number, name) => [usd(v), humanize(String(name))]} />
                <Legend wrapperStyle={{ fontSize: 10 }} formatter={(name) => humanize(String(name))} />
                <Bar dataKey="before" fill="var(--muted-foreground)" fillOpacity={0.6} isAnimationActive={false} />
                <Bar dataKey="after" fill="var(--info)" fillOpacity={0.8} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
