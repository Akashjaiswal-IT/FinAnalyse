"use client";

import { Fragment } from "react";
import { formatValue } from "@repo/contracts";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { cn } from "~/lib/utils";
import { humanize } from "~/lib/display";
import { signTone } from "~/lib/tone";
import { PanelMessage, SectionLabel, Stat } from "./bits";
import { useRun } from "./run-context";
import { TemplateText } from "./template-text";

/**
 * The hedge and reallocation plan: one row per action, each with its exit trigger and rationale chips.
 * Like the answer, it shows only what `run.completed` carried, after the verifier checked the text.
 */
export function HedgeTable() {
  const { view, openDrilldown } = useRun();
  const plan = view.hedgePlan;

  if (!plan) {
    return view.phase === "succeeded" || view.phase === "partial" ? (
      <PanelMessage>This run produced no hedge plan.</PanelMessage>
    ) : null;
  }

  return (
    <Card className="gap-0 py-0">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <SectionLabel className="mr-1">Hedge plan</SectionLabel>
          <Badge
            variant="outline"
            className={cn(plan.source === "fallback" && "border-warning/50 bg-warning/10 text-warning")}
          >
            {plan.source === "model" ? "model plan" : "fallback plan"}
          </Badge>
        </div>

        <p className="text-sm leading-relaxed">
          <TemplateText text={plan.summary} />
        </p>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          <Stat label="Gross notional">{formatValue("usd", plan.grossNotional)}</Stat>
          <Stat label="Scenario P&L before">
            <span className={signTone(plan.before.scenarioPnl)}>{formatValue("usd", plan.before.scenarioPnl)}</span>
          </Stat>
          <Stat label="Scenario P&L after">
            <span className={signTone(plan.after.scenarioPnl)}>{formatValue("usd", plan.after.scenarioPnl)}</span>
          </Stat>
          <Stat label="1-day VaR before / after">
            {formatValue("usd", plan.before.var1d.var95)} / {formatValue("usd", plan.after.var1d.var95)}
          </Stat>
        </div>

        {plan.violations.length > 0 && (
          <ul className="space-y-1 rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative" role="alert">
            {plan.violations.map((v, i) => (
              <li key={i}>
                {humanize(v.rule)}
                {v.symbol ? ` (${v.symbol})` : ""}: {v.message}
              </li>
            ))}
          </ul>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Action</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Notional</TableHead>
              <TableHead>Timing</TableHead>
              <TableHead>Order</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plan.actions.map((action, i) => (
              <Fragment key={i}>
                <TableRow className="border-b-0">
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => openDrilldown({ kind: "hedge", index: i })}
                      aria-label={`${action.side} ${action.symbol}: open details`}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <span
                        className={cn(
                          "rounded border px-1.5 py-px font-mono text-[11px] font-semibold uppercase",
                          action.side === "buy"
                            ? "border-positive/40 bg-positive/10 text-positive"
                            : "border-negative/40 bg-negative/10 text-negative",
                        )}
                      >
                        {action.side}
                      </span>
                      <span className="font-mono font-semibold">{action.symbol}</span>
                    </button>
                    <Badge variant="outline" className="ml-2 text-[10px] text-muted-foreground">
                      {action.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatValue("count", action.quantity)}</TableCell>
                  <TableCell className="text-right font-mono">{formatValue("usd", action.notional)}</TableCell>
                  <TableCell className="capitalize">{humanize(action.timing)}</TableCell>
                  <TableCell className="capitalize">{action.orderType}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={5} className="pt-0 pb-3 text-xs leading-relaxed whitespace-normal">
                    <div>
                      <span className="mr-1.5 text-[10px] tracking-wider text-muted-foreground uppercase">Why</span>
                      <TemplateText text={action.rationale} />
                    </div>
                    <div>
                      <span className="mr-1.5 text-[10px] tracking-wider text-muted-foreground uppercase">Exit</span>
                      <TemplateText text={action.exitTrigger} />
                    </div>
                  </TableCell>
                </TableRow>
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
