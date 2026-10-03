"use client";

import { formatValue, HOLDING_HORIZON, type PositionView } from "@repo/contracts";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { Badge } from "~/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { formatPrice } from "~/lib/display";
import { signTone } from "~/lib/tone";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";

const SPARK_DAYS = 45;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function HorizonBadge({ symbol }: { symbol: string }) {
  const horizon = HOLDING_HORIZON[symbol];
  if (!horizon) return null;
  return (
    <Badge
      variant="outline"
      className={cn("px-1.5 py-0 text-[10px] font-normal", horizon === "long" ? "border-info/40 text-info" : "border-primary/40 text-primary")}
      title={horizon === "long" ? "Core position, judged over weeks" : "Tactical position, judged over days"}
    >
      {horizon === "long" ? "Long-term" : "Short-term"}
    </Badge>
  );
}

function Sparkline({ symbol, asOf }: { symbol: string; asOf: string }) {
  const from = isoDay(Date.parse(asOf) - SPARK_DAYS * 86_400_000);
  const bars = trpc.market.bars.useQuery({ symbol, from }, { staleTime: 10 * 60_000 });
  const data = (bars.data ?? []).map((b) => ({ close: b.adjClose }));
  if (data.length < 2) return <div className="h-8 w-28" />;
  const rising = data[data.length - 1]!.close >= data[0]!.close;
  return (
    <div className="h-8 w-28" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 3, bottom: 3, left: 0, right: 0 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line type="monotone" dataKey="close" dot={false} strokeWidth={1.5} stroke={rising ? "var(--positive)" : "var(--negative)"} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** One row per holding; clicking a row opens the stock drawer. */
export function HoldingsTable({ positions, asOf, onPick }: { positions: PositionView[]; asOf: string; onPick(symbol: string): void }) {
  const rows = [...positions].sort((a, b) => b.value - a.value);
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Holding</TableHead>
          <TableHead>Horizon</TableHead>
          <TableHead className="hidden md:table-cell">{SPARK_DAYS} days</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">1 day</TableHead>
          <TableHead className="text-right">Weight</TableHead>
          <TableHead className="text-right">Value</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((p) => (
          <TableRow
            key={p.symbol}
            onClick={() => onPick(p.symbol)}
            onKeyDown={(e) => e.key === "Enter" && onPick(p.symbol)}
            tabIndex={0}
            className="cursor-pointer focus-visible:bg-accent focus-visible:outline-none"
          >
            <TableCell>
              <span className="font-mono text-[13px] font-semibold">{p.symbol}</span>
              <span className="ml-2 text-[12px] text-muted-foreground">{p.name}</span>
            </TableCell>
            <TableCell>
              <HorizonBadge symbol={p.symbol} />
            </TableCell>
            <TableCell className="hidden py-1 md:table-cell">
              <Sparkline symbol={p.symbol} asOf={asOf} />
            </TableCell>
            <TableCell className="text-right font-mono text-[13px]">{formatPrice(p.price)}</TableCell>
            <TableCell className={cn("text-right font-mono text-[13px]", signTone(p.change1d))}>
              {p.change1d === null ? "n/a" : formatValue("pct_signed", p.change1d)}
            </TableCell>
            <TableCell className="text-right font-mono text-[13px]">{formatValue("pct", p.weight)}</TableCell>
            <TableCell className="text-right font-mono text-[13px]">{formatValue("usd", p.value)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
