"use client";

import { formatValue, UNIVERSE } from "@repo/contracts";
import { Bar, BarChart, CartesianGrid, Cell, ErrorBar, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { humanize } from "~/lib/display";
import { EVENT_TYPE_TONE } from "~/lib/tone";
import { cn } from "~/lib/utils";
import { SectionLabel, Stat } from "./bits";
import { useRun } from "./run-context";

const ANALOG_ROWS = 8;
const POSITIVE = "var(--positive)";
const NEGATIVE = "var(--negative)";
const nameOf = (symbol: string) => UNIVERSE.find((u) => u.symbol === symbol)?.name ?? symbol;

/** The analog forecast: weighted mean 5-day move per target with its spread, and the analogs behind it. */
export function ForecastPanel() {
  const { view } = useRun();
  const forecast = view.forecast;
  if (!forecast) return null;

  const rows = Object.entries(forecast.targets).map(([symbol, t]) => ({ symbol, mean: t.mean, spread: t.spread, n: t.n }));
  const analogs = [...forecast.analogs].sort((a, b) => b.weight - a.weight).slice(0, ANALOG_ROWS);

  return (
    <Card className="gap-0 py-0">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <SectionLabel className="mr-1">Analog forecast</SectionLabel>
          <Badge variant="outline">{humanize(forecast.variant)}</Badge>
          {forecast.groupsUsed.map((g) => (
            <Badge key={g} variant="outline" className="text-[10px]">
              {g}
            </Badge>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-x-4">
          <Stat label="Effective sample">{formatValue("ratio", forecast.effectiveN)}</Stat>
          <Stat label="Bandwidth">{formatValue("ratio", forecast.bandwidth)}</Stat>
          <Stat label="News basis">{humanize(forecast.newsBasis)}</Stat>
        </div>

        <div className="h-48" role="img" aria-label="Forecast 5-day log return per target, with the weighted spread">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
              <CartesianGrid horizontal={false} strokeOpacity={0.15} />
              <XAxis type="number" tickFormatter={(v: number) => formatValue("pct_signed", v)} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="symbol" width={110} interval={0} tick={{ fontSize: 10 }} />
              <ReferenceLine x={0} strokeOpacity={0.4} />
              <Tooltip
                cursor={{ fillOpacity: 0.05 }}
                contentStyle={{ fontSize: 11, background: "var(--popover)", border: "1px solid var(--border)" }}
                formatter={(value: number, _name, item) => [
                  `${formatValue("pct_signed", value)} ± ${formatValue("pct", (item.payload as { spread: number }).spread)} (n ${(item.payload as { n: number }).n})`,
                  nameOf((item.payload as { symbol: string }).symbol),
                ]}
              />
              <Bar dataKey="mean" isAnimationActive={false}>
                {rows.map((r) => (
                  <Cell key={r.symbol} fill={r.mean >= 0 ? POSITIVE : NEGATIVE} fillOpacity={0.7} />
                ))}
                <ErrorBar dataKey="spread" width={4} strokeOpacity={0.6} direction="x" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[10px] text-muted-foreground">5-day log return, kernel-weighted over past events; whiskers show the weighted spread.</p>

        {analogs.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Closest past events</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Weight</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analogs.map((a) => (
                <TableRow key={a.eventId}>
                  <TableCell className="text-xs">{a.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("px-1.5 py-0 text-[10px]", EVENT_TYPE_TONE[a.type])}>
                      {humanize(a.type)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">{formatValue("ratio", a.weight)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
