"use client";

import Link from "next/link";
import { formatValue, ModelKey, type BacktestMetrics } from "@repo/contracts";
import { Card, CardContent } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { PanelMessage, SectionLabel } from "~/components/terminal/bits";
import { formatDateTime, humanize } from "~/lib/display";
import { trpc } from "~/trpc/client";

const MODEL_LABEL: Record<ModelKey, string> = {
  N: "N · unconditional mean",
  T: "T · same event type",
  S: "S · news features",
  M: "M · market regime",
  W: "W · weather (hurricanes)",
  C: "C · combined",
};

function MetricsTable({ title, row }: { title: string; row: Partial<Record<ModelKey, BacktestMetrics>> }) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="space-y-2 p-4">
        <SectionLabel>{title}</SectionLabel>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model</TableHead>
              <TableHead className="text-right">n</TableHead>
              <TableHead className="text-right">Directional accuracy</TableHead>
              <TableHead className="text-right">MAE</TableHead>
              <TableHead className="text-right">Spearman</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ModelKey.options.map((m) => {
              const x = row[m];
              return (
                <TableRow key={m}>
                  <TableCell className="text-xs">{MODEL_LABEL[m]}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{x ? formatValue("count", x.n) : "n/a"}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{formatValue("pct", x?.directionalAccuracy ?? null)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{formatValue("pct", x?.mae ?? null)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{formatValue("ratio", x?.spearman ?? null)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/** The newest leave-one-out backtest, as `pnpm backtest --save` stored it. */
export default function ReliabilityPage() {
  const latest = trpc.backtest.latest.useQuery();
  const b = latest.data;

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="font-mono text-sm font-bold tracking-[0.25em] text-primary">TEMPEST · RELIABILITY</h1>
        <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">
          Back to the terminal
        </Link>
      </header>
      {latest.error ? (
        <PanelMessage tone="negative">Backtest unavailable: {latest.error.message}</PanelMessage>
      ) : latest.isLoading ? (
        <PanelMessage>Loading…</PanelMessage>
      ) : !b ? (
        <PanelMessage>No backtest saved yet. Run pnpm backtest --save.</PanelMessage>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Leave-one-out over past events, run {formatDateTime(b.createdAt)}. Bandwidth {b.config.bandwidth}, type weight{" "}
            {b.config.typeWeight}. Directional accuracy ignores moves under 0.25%; MAE is in 5-day log-return points.
          </p>
          {b.metrics.pooled && <MetricsTable title="Pooled, all targets" row={b.metrics.pooled} />}
          <div className="grid gap-4 lg:grid-cols-2">
            {b.config.targets.flatMap((t) => (b.metrics[t] ? [<MetricsTable key={t} title={t} row={b.metrics[t]} />] : []))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {Object.keys(b.metrics)
              .filter((k) => k.startsWith("type:"))
              .sort()
              .map((k) => (
                <MetricsTable key={k} title={`Event type: ${humanize(k.slice(5))}`} row={b.metrics[k]!} />
              ))}
          </div>
          <Card className="gap-0 py-0">
            <CardContent className="space-y-2 p-4">
              <SectionLabel>Caveats</SectionLabel>
              <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                {b.caveats.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
