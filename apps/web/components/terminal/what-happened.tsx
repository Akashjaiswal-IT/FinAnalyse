"use client";

import { formatValue, UNIVERSE } from "@repo/contracts";
import { Card, CardContent } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { signTone } from "~/lib/tone";
import { trpc } from "~/trpc/client";
import { SectionLabel } from "./bits";
import { useRun } from "./run-context";

const nameOf = (symbol: string) => UNIVERSE.find((u) => u.symbol === symbol)?.name ?? symbol;

/** Replay only, after the run: the forecast next to what markets did in the five trading days after the event. */
export function WhatHappened({ presetId }: { presetId: string | null }) {
  const { view } = useRun();
  const done = view.phase === "succeeded" || view.phase === "partial";
  const type = view.eventProfile?.type;
  const analogs = trpc.analogs.list.useQuery(type ? { type } : {}, { enabled: done && view.mode === "replay" && presetId !== null });
  const event = analogs.data?.find((a) => a.id === presetId);
  if (!done || !view.forecast || !event) return null;

  const rows = Object.entries(view.forecast.targets).map(([symbol, f]) => ({ symbol, forecast: f.mean, realized: event.reactions[symbol]?.d5 ?? null }));

  return (
    <Card className="gap-0 py-0">
      <CardContent className="space-y-2 p-4">
        <SectionLabel>What happened next</SectionLabel>
        <p className="text-xs text-muted-foreground">
          Hindsight, not available at the as-of: the 5-day move after {event.name}, next to the forecast the run made.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Target</TableHead>
              <TableHead className="text-right">Forecast</TableHead>
              <TableHead className="text-right">Realized</TableHead>
              <TableHead className="text-right">Direction</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.symbol}>
                <TableCell className="text-xs">{nameOf(r.symbol)}</TableCell>
                <TableCell className={`text-right font-mono text-xs ${signTone(r.forecast)}`}>{formatValue("pct_signed", r.forecast)}</TableCell>
                <TableCell className={`text-right font-mono text-xs ${signTone(r.realized)}`}>{formatValue("pct_signed", r.realized)}</TableCell>
                <TableCell className="text-right text-xs">
                  {r.realized === null || r.forecast === 0 ? "n/a" : Math.sign(r.forecast) === Math.sign(r.realized) ? "same" : "opposite"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-[10px] text-muted-foreground">5-day log returns from the close before the event.</p>
      </CardContent>
    </Card>
  );
}
