"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatValue, ModelKey, type BacktestMetrics } from "@repo/contracts";
import { Card, CardContent } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { PanelMessage, SectionLabel } from "~/components/terminal/bits";
import { formatDateTime, humanize } from "~/lib/display";
import { trpc } from "~/trpc/client";
import { PageHeader } from "~/components/shell/page-header";

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
              <TableHead className="text-right" title="Directional accuracy, moves under 0.25% excluded">Direction</TableHead>
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

const MODEL_SHORT: Record<ModelKey, string> = { N: "Unconditional", T: "Same type", S: "News", M: "Regime", W: "Weather", C: "Combined" };

/** Pooled directional accuracy per model against the coin-flip line; models without predictions are left out. */
function AccuracyChart({ row }: { row: Partial<Record<ModelKey, BacktestMetrics>> }) {
  const data = ModelKey.options.flatMap((m) => {
    const x = row[m];
    return x && x.directionalAccuracy !== null ? [{ model: MODEL_SHORT[m], key: m, accuracy: x.directionalAccuracy, n: x.n }] : [];
  });
  return (
    <Card className="gap-0 py-0">
      <CardContent className="space-y-2 p-4">
        <SectionLabel>Directional accuracy by model, pooled</SectionLabel>
        <div className="h-56" role="img" aria-label="Directional accuracy by model against 50 percent">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: 0, right: 16, top: 8, bottom: 4 }}>
              <CartesianGrid vertical={false} strokeOpacity={0.12} />
              <XAxis dataKey="model" tick={{ fontSize: 11 }} />
              <YAxis domain={[0.3, 0.7]} tickFormatter={(v: number) => formatValue("pct", v)} tick={{ fontSize: 10 }} width={48} />
              <ReferenceLine y={0.5} stroke="var(--muted-foreground)" strokeDasharray="4 4" label={{ value: "coin flip", fontSize: 10, fill: "var(--muted-foreground)", position: "insideTopRight" }} />
              <Tooltip
                cursor={{ fillOpacity: 0.05 }}
                contentStyle={{ fontSize: 11, background: "var(--popover)", border: "1px solid var(--border)" }}
                formatter={(v: number, _n, item) => [`${formatValue("pct", v)} (n ${(item.payload as { n: number }).n})`, "Directional accuracy"]}
              />
              <Bar dataKey="accuracy" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {data.map((d) => (
                  <Cell key={d.key} fill={d.key === "C" ? "var(--primary)" : d.accuracy >= 0.5 ? "var(--positive)" : "var(--negative)"} fillOpacity={0.75} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

/** The newest leave-one-out backtest, as `pnpm backtest --save` stored it. */
export default function ReliabilityPage() {
  const latest = trpc.backtest.latest.useQuery();
  const b = latest.data;

  return (
    <main className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-5 px-6 py-8">
      <PageHeader
        eyebrow="Reliability"
        title="How well does it work?"
        description="Every number here comes from a script run, with its date and commit. Weak spots are shown, not hidden."
      />
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
          {b.metrics.pooled && <AccuracyChart row={b.metrics.pooled} />}
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
      </div>
    </main>
  );
}
