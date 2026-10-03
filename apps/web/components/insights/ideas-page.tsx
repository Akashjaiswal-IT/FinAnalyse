"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowDownRight, ArrowUpRight, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { formatValue, UNIVERSE, type Idea } from "@repo/contracts";
import { HorizonBadge } from "~/components/dashboard/holdings-table";
import { PageHeader } from "~/components/shell/page-header";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { useIdeas } from "~/lib/insights";
import { CONFIDENCE_TONE, signTone } from "~/lib/tone";
import { cn } from "~/lib/utils";

const nameOf = (symbol: string) => UNIVERSE.find((u) => u.symbol === symbol)?.name ?? symbol;

function IdeaCard({ idea, index }: { idea: Idea; index: number }) {
  const sell = idea.side === "sell";
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: 0.05 * index }}>
      <Card className="gap-0 py-0">
        <div className="space-y-4 px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-lg font-semibold">{idea.symbol}</span>
                <HorizonBadge symbol={idea.symbol} />
              </div>
              <div className="text-[12px] text-muted-foreground">{nameOf(idea.symbol)}</div>
            </div>
            <Badge variant="outline" className={cn("capitalize", CONFIDENCE_TONE[idea.confidence])}>
              {idea.confidence} confidence
            </Badge>
          </div>

          <h3 className="text-[15px] leading-snug font-semibold">{idea.headline}</h3>

          <ul className="space-y-1.5">
            {idea.reasons.map((r) => (
              <li key={r} className="flex gap-2 text-[13px] leading-relaxed text-muted-foreground">
                <span className={cn("mt-2 size-1 shrink-0 rounded-full", sell ? "bg-negative" : "bg-positive")} aria-hidden />
                {r}
              </li>
            ))}
          </ul>

          <dl className="grid grid-cols-3 gap-3 border-t pt-4">
            <div>
              <dt className="text-[11px] text-muted-foreground">Expected move ({idea.horizon === "short" ? "5 days" : "20 days"})</dt>
              <dd className={cn("mt-1 font-mono text-[15px]", signTone(idea.expectedMove.mean))}>
                {formatValue("pct_signed", idea.expectedMove.mean)}
                <span className="ml-1 text-[11px] text-muted-foreground">± {formatValue("pct", idea.expectedMove.spread)}</span>
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">1-day VaR</dt>
              <dd className="mt-1 font-mono text-[15px]">
                {formatValue("usd", idea.varBefore)} <span className="text-info">→ {formatValue("usd", idea.varAfter)}</span>
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">Size</dt>
              <dd className="mt-1 font-mono text-[15px]">{formatValue("usd", idea.sizeUsd)}</dd>
            </div>
          </dl>

          {idea.sources.length > 0 && (
            <ul className="space-y-1">
              {idea.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noreferrer" className="group inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-primary">
                    {s.title} · {s.domain}
                    <ArrowUpRight className="size-3 opacity-50 group-hover:opacity-100" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          )}

          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href={`/analyze?q=${encodeURIComponent(`Should we ${idea.side} ${nameOf(idea.symbol)}? What is the risk?`)}`}>
              <Sparkles className="size-3.5" /> Check this idea
            </Link>
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}

function Column({ title, icon, ideas, tone }: { title: string; icon: React.ReactNode; ideas: Idea[]; tone: string }) {
  return (
    <section className="space-y-4">
      <h2 className={cn("flex items-center gap-2 text-sm font-medium", tone)}>
        {icon} {title} <span className="text-muted-foreground">({ideas.length})</span>
      </h2>
      {ideas.map((idea, i) => (
        <IdeaCard key={idea.id} idea={idea} index={i} />
      ))}
    </section>
  );
}

/** What to sell and what to buy, each with its reasons, sources and the risk before and after. */
export function IdeasPage() {
  const { ideas, preview } = useIdeas();
  return (
    <main className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-7">
        <PageHeader
          eyebrow="Ideas"
          title="What to sell, what to buy, and why"
          description="Each idea shows its reasons, its sources, the expected move over its horizon and what it does to the portfolio's risk. Paper portfolio, not investment advice."
        />
        {preview && (
          <p className="rounded-xl border border-dashed px-4 py-3 text-[13px] text-muted-foreground">
            Preview: hand-built examples of the idea format. “Check this idea” runs the real analysis.
          </p>
        )}
        <div className="grid gap-6 lg:grid-cols-2">
          <Column title="Consider selling" icon={<TrendingDown className="size-4" />} tone="text-negative" ideas={ideas.filter((i) => i.side === "sell")} />
          <Column title="Consider buying" icon={<TrendingUp className="size-4" />} tone="text-positive" ideas={ideas.filter((i) => i.side === "buy")} />
        </div>
        <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <ArrowDownRight className="size-3.5" /> Expected moves are log returns weighted over similar past events; the spread is their weighted standard deviation.
        </p>
      </div>
    </main>
  );
}
