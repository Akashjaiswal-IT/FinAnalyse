"use client";

import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { formatValue, UNIVERSE, type PositionView } from "@repo/contracts";
import { Button } from "~/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "~/components/ui/sheet";
import { Skeleton } from "~/components/ui/skeleton";
import { formatDateTime, formatPrice, humanize, isHttpUrl } from "~/lib/display";
import { signTone } from "~/lib/tone";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";
import { HorizonBadge } from "./holdings-table";
import { PriceChart } from "./price-chart";

const CHART_DAYS = 180;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** One stock: price with news markers, the news itself with sources, and a way to analyse it. */
export function StockDrawer({ position, asOf, onClose }: { position: PositionView | null; asOf: string; onClose(): void }) {
  const symbol = position?.symbol ?? "";
  const from = isoDay(Date.parse(asOf) - CHART_DAYS * 86_400_000);
  const bars = trpc.market.bars.useQuery({ symbol, from }, { enabled: Boolean(position), staleTime: 10 * 60_000 });
  const news = trpc.news.list.useQuery({ ticker: symbol, limit: 30 }, { enabled: Boolean(position) });
  const name = UNIVERSE.find((u) => u.symbol === symbol)?.name ?? symbol;
  const newsDays = (news.data ?? []).map((n) => n.publishedAt.slice(0, 10));

  return (
    <Sheet open={position !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {position && (
          <>
            <SheetHeader className="space-y-2 border-b px-6 py-5">
              <div className="flex items-center gap-2">
                <HorizonBadge symbol={symbol} />
                {position.sector && <span className="text-[12px] text-muted-foreground">{humanize(position.sector)}</span>}
              </div>
              <SheetTitle className="flex items-baseline gap-3 text-2xl font-semibold tracking-[-0.02em]">
                <span className="font-mono">{symbol}</span>
                <span className="text-base font-normal text-muted-foreground">{name}</span>
              </SheetTitle>
              <SheetDescription asChild>
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                  <span className="font-mono text-xl text-foreground">{formatPrice(position.price)}</span>
                  <span className={cn("font-mono", signTone(position.change1d))}>
                    {position.change1d === null ? "n/a" : formatValue("pct_signed", position.change1d)} today
                  </span>
                  <span className="text-muted-foreground">
                    {formatValue("usd", position.value)} held · {formatValue("pct", position.weight)} of the portfolio
                  </span>
                </div>
              </SheetDescription>
            </SheetHeader>

            <section className="border-b px-4 py-4">
              <div className="mb-2 px-2 text-[12px] text-muted-foreground">Last {CHART_DAYS} days · dots mark days with news</div>
              {bars.data ? <PriceChart bars={bars.data} newsDays={newsDays} /> : <Skeleton className="h-64 w-full" />}
            </section>

            <section className="space-y-3 px-6 py-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">News about {symbol}</h3>
                <Button asChild size="sm" className="h-8 gap-1.5">
                  <Link href={`/analyze?q=${encodeURIComponent(`What is moving ${name} and how does it affect our portfolio?`)}`}>
                    <Sparkles className="size-3.5" /> Analyze
                  </Link>
                </Button>
              </div>
              {news.isLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (news.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No news about {symbol} in the index yet.</p>
              ) : (
                <ul className="divide-y">
                  {(news.data ?? []).map((n) => {
                    const sentiment = n.sentiment ?? n.sourceSentiment;
                    return (
                      <li key={n.id} className="py-3">
                        {isHttpUrl(n.url) ? (
                          <a href={n.url} target="_blank" rel="noreferrer" className="group flex items-start gap-1.5 text-[13px] leading-snug hover:text-primary">
                            <span>{n.title}</span>
                            <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 opacity-50 group-hover:opacity-100" aria-hidden />
                          </a>
                        ) : (
                          <span className="text-[13px] leading-snug">{n.title}</span>
                        )}
                        <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                          {n.domain && <span>{n.domain}</span>}
                          <span>{formatDateTime(n.publishedAt)}</span>
                          {sentiment !== null && (
                            <span className={signTone(sentiment)}>
                              sentiment {formatValue("score", sentiment)}
                              {n.sentiment === null ? " (source)" : ""}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
