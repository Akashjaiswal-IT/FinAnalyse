"use client";

import { FACTOR_BETA_MIN, MIN_FACTOR_R2, formatValue, type RiskSnapshot } from "@repo/contracts";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import { humanize, signed } from "~/lib/display";
import { CHANNEL_TONE, DIRECTION_GLYPH, signTone } from "~/lib/tone";
import { PanelMessage, SectionLabel, Stat } from "./bits";
import { EvidenceChip } from "./evidence-chip";
import { useRun } from "./run-context";
import { TemplateText } from "./template-text";

/** Why one holding is exposed: each channel with its reason and evidence, the betas, and the scenario P&L. */
export function ExposureDetail({ symbol }: { symbol: string }) {
  const { view } = useRun();
  const exposure = view.risk?.channels.find((h) => h.symbol === symbol);

  if (!view.risk || !exposure) {
    return (
      <div className="p-4">
        <PanelMessage>{symbol} has no exposure channel in this run.</PanelMessage>
      </div>
    );
  }

  const direction = DIRECTION_GLYPH[exposure.expectedSign];
  const betas = view.risk.exposures.filter((e) => e.holding === symbol);
  const pnl = view.risk.scenario.perHolding.find((h) => h.symbol === symbol);
  const sentiment = view.sentiment?.status === "ok" ? view.sentiment.holdings.find((h) => h.symbol === symbol) : undefined;

  return (
    <div className="space-y-5 p-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Expected direction">
          <span className={direction.tone}>
            {direction.glyph} {direction.label}
          </span>
        </Stat>
        <Stat label="Scenario P&L">
          {pnl ? <span className={signTone(pnl.pnl)}>{formatValue("usd", pnl.pnl)}</span> : "n/a"}
        </Stat>
        <Stat label="News sentiment">
          {sentiment ? (
            <span className={signTone(sentiment.score)}>
              {signed(formatValue("score", sentiment.score), sentiment.score)}
              <span className="ml-1 text-[10px] text-muted-foreground">({sentiment.n} articles)</span>
            </span>
          ) : (
            "n/a"
          )}
        </Stat>
      </div>
      <p className="-mt-3 text-[11px] text-muted-foreground">
        The direction is a sign only. The size of every move comes from the forecast, never from the direction.
      </p>

      <div className="space-y-2">
        <SectionLabel>Exposure channels</SectionLabel>
        <ul className="space-y-2">
          {exposure.channels.map((link, i) => (
            <li key={i} className="space-y-1.5 rounded-md border bg-card/50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={cn(CHANNEL_TONE[link.channel])}>
                  {link.channel}
                </Badge>
                <span className="text-sm capitalize">{humanize(link.reason)}</span>
                <span className="font-mono text-xs text-muted-foreground">{link.detail}</span>
              </div>
              {link.evidenceKeys.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  Evidence
                  {link.evidenceKeys.map((key) => (
                    <EvidenceChip key={key} evidenceKey={key} />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <SectionLabel>Factor betas</SectionLabel>
        {betas.length === 0 ? (
          <p className="text-xs text-muted-foreground">No factor beta was computed for {symbol} in this run.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] tracking-wider text-muted-foreground uppercase">
                <th className="py-1 font-medium">Factor</th>
                <th className="py-1 text-right font-medium">Beta</th>
                <th className="py-1 text-right font-medium">R²</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {betas.map((b) => (
                <tr key={b.factor} className="border-t">
                  <td className="py-1">{b.factor}</td>
                  <td className="py-1 text-right">{formatValue("ratio", b.beta)}</td>
                  <td className="py-1 text-right">{formatValue("ratio", b.r2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-[11px] text-muted-foreground">
          A factor channel needs a beta of at least {formatValue("ratio", FACTOR_BETA_MIN)} in size and an R² of at least{" "}
          {formatValue("ratio", MIN_FACTOR_R2)}.
        </p>
      </div>
    </div>
  );
}

function snapshotRows(before: RiskSnapshot, after: RiskSnapshot) {
  return [
    { label: "1-day VaR", before: formatValue("usd", before.var1d.var95), after: formatValue("usd", after.var1d.var95) },
    { label: "1-day CVaR", before: formatValue("usd", before.var1d.cvar95), after: formatValue("usd", after.var1d.cvar95) },
    { label: "5-day VaR", before: formatValue("usd", before.var5d.var95), after: formatValue("usd", after.var5d.var95) },
    { label: "5-day CVaR", before: formatValue("usd", before.var5d.cvar95), after: formatValue("usd", after.var5d.cvar95) },
    { label: "Sleeve beta", before: formatValue("ratio", before.sleeveBeta), after: formatValue("ratio", after.sleeveBeta) },
    { label: "Scenario P&L", before: formatValue("usd", before.scenarioPnl), after: formatValue("usd", after.scenarioPnl) },
  ];
}

/** One hedge action in full: its rationale and exit, the evidence it cites, and the plan's before and after. */
export function HedgeDetail({ index }: { index: number }) {
  const { view } = useRun();
  const plan = view.hedgePlan;
  const action = plan?.actions[index];

  if (!plan || !action) {
    return (
      <div className="p-4">
        <PanelMessage>This hedge action is not in the run.</PanelMessage>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded border px-1.5 py-px font-mono text-xs font-semibold uppercase",
            action.side === "buy" ? "border-positive/40 bg-positive/10 text-positive" : "border-negative/40 bg-negative/10 text-negative",
          )}
        >
          {action.side}
        </span>
        <span className="font-mono text-base font-semibold">
          {formatValue("count", action.quantity)} {action.symbol}
        </span>
        <Badge variant="outline">{action.type}</Badge>
        <Badge variant="outline" className="capitalize">
          {plan.source === "model" ? "model plan" : "fallback plan"}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Notional">{formatValue("usd", action.notional)}</Stat>
        <Stat label="Timing">{humanize(action.timing)}</Stat>
        <Stat label="Order">{action.orderType}</Stat>
      </div>

      <div className="space-y-1">
        <SectionLabel>Why</SectionLabel>
        <p className="text-sm leading-relaxed">
          <TemplateText text={action.rationale} />
        </p>
      </div>
      <div className="space-y-1">
        <SectionLabel>Exit trigger</SectionLabel>
        <p className="text-sm leading-relaxed">
          <TemplateText text={action.exitTrigger} />
        </p>
      </div>

      <div className="space-y-1">
        <SectionLabel>Evidence cited</SectionLabel>
        <div className="flex flex-wrap items-center gap-1">
          {action.evidenceKeys.map((key) => (
            <EvidenceChip key={key} evidenceKey={key} />
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <SectionLabel>Plan risk, before and after</SectionLabel>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] tracking-wider text-muted-foreground uppercase">
              <th className="py-1 font-medium">Metric</th>
              <th className="py-1 text-right font-medium">Before</th>
              <th className="py-1 text-right font-medium">After</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {snapshotRows(plan.before, plan.after).map((row) => (
              <tr key={row.label} className="border-t">
                <td className="py-1 font-sans">{row.label}</td>
                <td className="py-1 text-right">{row.before}</td>
                <td className="py-1 text-right">{row.after}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] text-muted-foreground">Before and after describe the whole plan, not this action alone.</p>
      </div>
    </div>
  );
}
