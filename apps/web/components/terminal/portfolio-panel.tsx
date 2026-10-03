"use client";

import { useMemo } from "react";
import { Sector, formatValue, type ExposureChannel, type PortfolioSnapshot, type PositionView } from "@repo/contracts";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import { humanize, signed } from "~/lib/display";
import { CHANNEL_TONE, DIRECTION_GLYPH, signTone } from "~/lib/tone";
import { SectionLabel, Stat } from "./bits";
import { useRun } from "./run-context";

interface PortfolioPanelProps {
  snapshot: PortfolioSnapshot;
  /** "Live" or the formatted replay as-of. */
  asOfLabel: string;
}

const CHANNEL_ORDER: readonly ExposureChannel[] = ["direct", "peer", "factor"];

/** Positions grouped by sector. After a run, each holding shows a badge per exposure channel and its news sentiment. */
export function PortfolioPanel({ snapshot, asOfLabel }: PortfolioPanelProps) {
  const { view, openDrilldown } = useRun();

  const exposureBySymbol = useMemo(
    () => new Map((view.risk?.channels ?? []).map((h) => [h.symbol, h] as const)),
    [view.risk],
  );
  const sentimentBySymbol = useMemo(
    () => new Map(view.sentiment?.status === "ok" ? view.sentiment.holdings.map((h) => [h.symbol, h] as const) : []),
    [view.sentiment],
  );

  const groups = useMemo(() => {
    const bySector = new Map<string, PositionView[]>();
    for (const p of snapshot.positions) {
      const key = p.sector ?? "other";
      bySector.set(key, [...(bySector.get(key) ?? []), p]);
    }
    const order: string[] = [...Sector.options, "other"];
    return order.flatMap((sector) => {
      const positions = bySector.get(sector);
      return positions ? [{ sector, positions }] : [];
    });
  }, [snapshot.positions]);
  const maxWeight = useMemo(() => Math.max(...snapshot.positions.map((p) => p.weight ?? 0), 1e-9), [snapshot.positions]);

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Portfolio">
      <header className="space-y-2 border-b px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <SectionLabel>Portfolio</SectionLabel>
          <span className="truncate text-[11px] text-muted-foreground">{asOfLabel}</span>
        </div>
        <div className="truncate text-sm font-medium">{snapshot.name}</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border bg-card/60 px-2.5 py-1.5">
            <Stat label="NAV">
              <span className="text-base font-semibold">{formatValue("usd", snapshot.nav)}</span>
            </Stat>
          </div>
          <div className="rounded-md border bg-card/60 px-2.5 py-1.5">
            <Stat label="Cash">
              <span className="text-base font-semibold">{formatValue("usd", snapshot.cash)}</span>
            </Stat>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
        {groups.map(({ sector, positions }) => (
          <div key={sector} className="mb-2">
            <h3 className="flex items-center gap-1.5 px-2 pt-1 pb-0.5 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
              <span className="size-1.5 rounded-full bg-primary/60" aria-hidden />
              {humanize(sector)}
            </h3>
            <ul>
              {positions.map((p) => {
                const exposure = exposureBySymbol.get(p.symbol);
                const sentiment = sentimentBySymbol.get(p.symbol);
                const channels = exposure ? CHANNEL_ORDER.filter((c) => exposure.channels.some((l) => l.channel === c)) : [];
                const direction = exposure ? DIRECTION_GLYPH[exposure.expectedSign] : null;
                return (
                  <li
                    key={p.symbol}
                    className={cn(
                      "rounded-md border-l-2 border-transparent px-2 py-1.5 transition-colors hover:bg-accent/40",
                      channels.includes("direct") && "border-primary/70 bg-primary/[0.04]",
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="flex min-w-0 items-baseline gap-1.5">
                        <span className="font-mono text-[13px] font-semibold">{p.symbol}</span>
                        <span className="truncate text-[11px] text-muted-foreground">{p.name}</span>
                      </span>
                      <span className={cn("shrink-0 font-mono text-xs", signTone(p.change1d))}>
                        {p.change1d === null ? "n/a" : formatValue("pct_signed", p.change1d)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {formatValue("usd", p.value)} · {formatValue("pct", p.weight)}
                      </span>
                      {channels.map((channel) => (
                        <button
                          key={channel}
                          type="button"
                          onClick={() => openDrilldown({ kind: "exposure", symbol: p.symbol })}
                          aria-label={`${p.symbol} ${channel} exposure: open why`}
                          className="cursor-pointer rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <Badge variant="outline" className={cn("px-1.5 py-0 text-[10px]", CHANNEL_TONE[channel])}>
                            {channel}
                          </Badge>
                        </button>
                      ))}
                      {direction && (
                        <span
                          className={cn("text-[10px]", direction.tone)}
                          title={`Expected direction: ${direction.label} (the size comes from the forecast)`}
                        >
                          {direction.glyph}
                        </span>
                      )}
                      {sentiment && (
                        <span
                          className={cn("font-mono text-[10px]", signTone(sentiment.score))}
                          title={`News sentiment from ${sentiment.n} articles`}
                        >
                          sent {signed(formatValue("score", sentiment.score), sentiment.score)}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 h-0.5 rounded-full bg-muted/60" aria-hidden>
                      <div className="h-full rounded-full bg-primary/45" style={{ width: `${(100 * (p.weight ?? 0)) / maxWeight}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
