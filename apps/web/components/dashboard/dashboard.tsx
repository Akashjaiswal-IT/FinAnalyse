"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import type { Format } from "@number-flow/react";
import { Activity, ArrowRight, ArrowUpRight, Landmark, Sparkles, Wallet } from "lucide-react";
import { formatValue, HOLDING_HORIZON, type PositionView } from "@repo/contracts";
import { PageHeader } from "~/components/shell/page-header";
import { startTour, tourSeen } from "~/components/shell/tour";
import { SEVERITY_DOT } from "~/components/shell/severity";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { formatDateTime, humanize, isHttpUrl } from "~/lib/display";
import { useAlerts } from "~/lib/insights";
import { DIRECTION_GLYPH, signTone } from "~/lib/tone";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";
import { HoldingsTable } from "./holdings-table";
import { KpiTile } from "./kpi-tile";
import { PortfolioHeatmap } from "./portfolio-heatmap";
import { StockDrawer } from "./stock-drawer";

const USD_COMPACT: Format = { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 };
const VIX_TONE: Record<"calm" | "elevated" | "stressed", string> = { calm: "text-positive", elevated: "text-warning", stressed: "text-negative" };

const rise = (i: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const, delay: 0.04 * i },
});

function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 pt-4 pb-2">
      <h2 className="text-sm font-medium">{title}</h2>
      {action}
    </div>
  );
}

function AlertsPreview() {
  const { alerts, preview } = useAlerts();
  return (
    <Card className="h-full gap-0 py-0">
      <SectionTitle
        title="Alerts"
        action={
          <span className="flex items-center gap-2">
            {preview && <Badge variant="outline" className="text-[10px] text-muted-foreground">preview</Badge>}
            <Link href="/alerts" className="text-[12px] text-muted-foreground hover:text-foreground">
              All
            </Link>
          </span>
        }
      />
      <ul className="divide-y px-2 pb-2">
        {alerts.slice(0, 4).map((a) => (
          <li key={a.id}>
            <Link href={`/alerts#${a.id}`} className="block rounded-lg px-3 py-3 transition-colors hover:bg-accent">
              <span className="flex items-start gap-2.5">
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", SEVERITY_DOT[a.severity])} aria-hidden />
                <span className="min-w-0">
                  <span className="block text-[13px] leading-snug font-medium">{a.title}</span>
                  <span className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                    {a.holdings.map((h) => (
                      <span key={h.symbol} className="font-mono">
                        {h.symbol}
                        <span className={DIRECTION_GLYPH[h.expected].tone}> {DIRECTION_GLYPH[h.expected].glyph}</span>
                      </span>
                    ))}
                    <span>· {humanize(a.eventType)}</span>
                  </span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function LatestNews() {
  const news = trpc.news.list.useQuery({ limit: 8 }, { refetchInterval: 60_000 });
  return (
    <Card className="h-full gap-0 py-0">
      <SectionTitle title="Latest news" />
      {news.isLoading ? (
        <div className="space-y-2 px-5 pb-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <ul className="divide-y px-5 pb-2">
          {(news.data ?? []).map((n) => {
            const sentiment = n.sentiment ?? n.sourceSentiment;
            return (
              <li key={n.id} className="py-2.5">
                {isHttpUrl(n.url) ? (
                  <a href={n.url} target="_blank" rel="noreferrer" className="group flex items-start gap-1 text-[12.5px] leading-snug hover:text-primary">
                    <span className="line-clamp-2">{n.title}</span>
                    <ArrowUpRight className="mt-0.5 size-3 shrink-0 opacity-40 group-hover:opacity-100" aria-hidden />
                  </a>
                ) : (
                  <span className="line-clamp-2 text-[12.5px] leading-snug">{n.title}</span>
                )}
                <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                  {n.domain && <span>{n.domain}</span>}
                  <span>{formatDateTime(n.publishedAt)}</span>
                  {sentiment !== null && <span className={signTone(sentiment)}>{formatValue("score", sentiment)}</span>}
                  {n.tickers.slice(0, 3).map((t) => (
                    <span key={t} className="font-mono text-foreground/80">
                      {t}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** Home: the portfolio now, what is moving it, and what the system has noticed. */
export function Dashboard() {
  const portfolio = trpc.portfolio.get.useQuery({});
  const macro = trpc.macro.snapshot.useQuery({});
  const [picked, setPicked] = useState<PositionView | null>(null);
  const snapshot = portfolio.data;
  const pick = (symbol: string) => setPicked(snapshot?.positions.find((p) => p.symbol === symbol) ?? null);
  const longCount = snapshot?.positions.filter((p) => HOLDING_HORIZON[p.symbol] === "long").length ?? 0;

  // First visit: the tour starts once the portfolio is on screen, so every step has its element.
  const ready = Boolean(snapshot);
  useEffect(() => {
    if (!ready || tourSeen()) return;
    const t = setTimeout(() => startTour("/"), 1200);
    return () => clearTimeout(t);
  }, [ready]);

  return (
    <main className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1440px] space-y-5 px-6 py-7">
        <PageHeader
          eyebrow="Dashboard"
          title={snapshot?.name ?? "Portfolio"}
          description={snapshot ? `Paper portfolio · prices as of ${formatDateTime(snapshot.asOf)}` : "Loading the portfolio…"}
          actions={
            <Button asChild className="gap-1.5">
              <Link href="/analyze">
                <Sparkles className="size-4" /> Analyze an event <ArrowRight className="size-4" />
              </Link>
            </Button>
          }
        />

        {portfolio.error && <p className="text-sm text-negative">Portfolio unavailable: {portfolio.error.message}</p>}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-tour="kpis">
          {[
            <KpiTile key="nav" label="Net asset value" value={snapshot?.nav ?? null} format={USD_COMPACT} icon={<Wallet className="size-4" />} sub={snapshot ? `${snapshot.positions.length} holdings` : undefined} />,
            <KpiTile key="cash" label="Cash" value={snapshot?.cash ?? null} format={USD_COMPACT} icon={<Landmark className="size-4" />} sub="Available for hedges and new ideas" />,
            <KpiTile
              key="vix"
              label="Market volatility (VIX)"
              value={macro.data?.vix.value ?? null}
              format={{ maximumFractionDigits: 1, minimumFractionDigits: 1 }}
              icon={<Activity className="size-4" />}
              sub={
                macro.data ? (
                  <span className={VIX_TONE[macro.data.vix.flag]}>
                    {macro.data.vix.flag.charAt(0).toUpperCase() + macro.data.vix.flag.slice(1)} regime
                  </span>
                ) : undefined
              }
            />,
            <KpiTile
              key="10y"
              label="10-year Treasury yield"
              value={macro.data?.yield10y.value ?? null}
              format={{ maximumFractionDigits: 2, minimumFractionDigits: 2 }}
              suffix="%"
              sub={macro.data ? `${macro.data.yield10y.change20d >= 0 ? "+" : ""}${macro.data.yield10y.change20d.toFixed(2)} points over 20 days` : undefined}
            />,
          ].map((tile, i) => (
            <motion.div key={i} {...rise(i)}>
              {tile}
            </motion.div>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <motion.div {...rise(4)} className="xl:col-span-2" data-tour="heatmap">
            <Card className="gap-0 py-0">
              <SectionTitle
                title="Portfolio heatmap"
                action={
                  <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="size-2 rounded-sm bg-negative/70" /> down
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="size-2 rounded-sm bg-positive/70" /> up
                    </span>
                    <span>size = weight</span>
                  </span>
                }
              />
              <div className="px-3 pb-3">{snapshot ? <PortfolioHeatmap positions={snapshot.positions} onPick={pick} /> : <Skeleton className="h-[340px] w-full" />}</div>
            </Card>
          </motion.div>
          <motion.div {...rise(5)}>
            <AlertsPreview />
          </motion.div>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <motion.div {...rise(6)} className="xl:col-span-2" data-tour="holdings">
            <Card className="gap-0 py-0">
              <SectionTitle
                title="Holdings"
                action={
                  snapshot && (
                    <span className="text-[12px] text-muted-foreground">
                      {longCount} long-term · {snapshot.positions.length - longCount} short-term
                    </span>
                  )
                }
              />
              <div className="px-2 pb-2">{snapshot ? <HoldingsTable positions={snapshot.positions} asOf={snapshot.asOf} onPick={pick} /> : <Skeleton className="h-96 w-full" />}</div>
            </Card>
          </motion.div>
          <motion.div {...rise(7)}>
            <LatestNews />
          </motion.div>
        </div>
      </div>

      {snapshot && <StockDrawer position={picked} asOf={snapshot.asOf} onClose={() => setPicked(null)} />}
    </main>
  );
}
