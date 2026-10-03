"use client";

import { formatValue, type MarketEventView, type NewsItem } from "@repo/contracts";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { formatDateTime, humanize, isHttpUrl } from "~/lib/display";
import { CHANNEL_TONE, EVENT_TYPE_TONE, HEALTH_TONE, signTone } from "~/lib/tone";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";
import { PanelMessage, SectionLabel } from "./bits";

const STATUS_REFRESH_MS = 30_000;

/** Live mode only: worker messages refresh the lists they change (SPEC 5.13). */
export function useLiveRefresh(enabled: boolean) {
  const utils = trpc.useUtils();
  trpc.live.feed.useSubscription(undefined, {
    enabled,
    onData(event) {
      if (event.type === "event.detected" || event.type === "event.updated") void utils.events.list.invalidate();
      if (event.type === "news.ingested" || event.type === "news.scored") void utils.news.list.invalidate();
      if (event.type === "news.ingested" || event.type === "source.status") void utils.system.status.invalidate();
    },
  });
}

export function EventFeed({
  asOf,
  disabled,
  onAnalyse,
}: {
  asOf: string | null;
  disabled: boolean;
  onAnalyse(event: MarketEventView): void;
}) {
  const events = trpc.events.list.useQuery(asOf ? { asOf } : {});

  if (events.error) return <PanelMessage tone="negative">Events unavailable: {events.error.message}</PanelMessage>;
  if (!events.data) return <PanelMessage>Loading events…</PanelMessage>;
  if (events.data.length === 0) {
    return (
      <PanelMessage>
        {asOf ? "No events had been detected by this as-of. Replay runs use the preset event." : "No events detected yet. The worker clusters scored news every 15 minutes."}
      </PanelMessage>
    );
  }

  return (
    <ol className="space-y-2">
      {events.data.map((e) => (
        <li key={e.id} className="space-y-1.5 rounded-md border p-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={cn("px-1.5 py-0 text-[10px]", EVENT_TYPE_TONE[e.type])}>
              {humanize(e.type)}
            </Badge>
            <Badge variant="outline" className="px-1.5 py-0 text-[10px] capitalize">
              {e.status}
            </Badge>
            <span className="font-mono text-[10px] text-muted-foreground">{formatDateTime(e.lastSeenAt)}</span>
          </div>
          <p className="text-xs leading-snug font-medium">{e.title}</p>
          <div className="flex flex-wrap items-center gap-1">
            <span className="font-mono text-[10px] text-muted-foreground">{formatValue("count", e.articleCount)} articles</span>
            {e.touchedHoldings.map((h) => (
              <Badge key={h.symbol} variant="outline" className={cn("px-1 py-0 font-mono text-[10px]", CHANNEL_TONE[h.channels[0]!])}>
                {h.symbol}
              </Badge>
            ))}
          </div>
          <Button type="button" size="sm" variant="outline" className="h-6 text-[11px]" disabled={disabled} onClick={() => onAnalyse(e)}>
            Analyse
          </Button>
        </li>
      ))}
    </ol>
  );
}

function NewsRow({ item }: { item: NewsItem }) {
  const sentiment = item.sentiment ?? item.sourceSentiment;
  return (
    <li className="space-y-1 rounded-md border px-2.5 py-2">
      {isHttpUrl(item.url) ? (
        <a href={item.url} target="_blank" rel="noreferrer" className="block text-xs leading-snug hover:underline">
          {item.title}
        </a>
      ) : (
        <span className="block text-xs leading-snug">{item.title}</span>
      )}
      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
        <span>{formatDateTime(item.publishedAt)}</span>
        {item.domain && <span>{item.domain}</span>}
        {item.eventType && item.eventType !== "none" && (
          <Badge variant="outline" className={cn("px-1 py-0 text-[10px]", EVENT_TYPE_TONE[item.eventType])}>
            {humanize(item.eventType)}
          </Badge>
        )}
        {sentiment !== null && <span className={signTone(sentiment)}>sent {formatValue("score", sentiment)}</span>}
        {item.tickers.slice(0, 4).map((t) => (
          <span key={t} className="text-foreground/80">
            {t}
          </span>
        ))}
      </div>
    </li>
  );
}

export function NewsFeed({ asOf }: { asOf: string | null }) {
  const news = trpc.news.list.useQuery(asOf ? { asOf, limit: 50 } : { limit: 50 });
  const status = trpc.system.status.useQuery(undefined, { refetchInterval: STATUS_REFRESH_MS });
  const ingest = trpc.system.ingestNow.useMutation({
    onSuccess: (r) => toast.success(r.queued.length ? `Queued ${r.queued.join(", ")}` : "Nothing queued"),
    onError: (err) => toast.error(`Ingest failed: ${err.message}`),
  });
  const latency = status.data?.ingestLatency;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-muted-foreground">
          {latency && latency.count > 0
            ? `ingest to index p50 ${formatValue("count", latency.p50Ms)} ms · p95 ${formatValue("count", latency.p95Ms)} ms (${latency.count} items, ${latency.windowHours} h)`
            : "No ingest latency measured yet"}
        </span>
        {!asOf && (
          <Button type="button" size="sm" variant="outline" className="h-6 text-[11px]" disabled={ingest.isPending} onClick={() => ingest.mutate({})}>
            {ingest.isPending ? "Queuing…" : "Ingest now"}
          </Button>
        )}
      </div>
      {news.error ? (
        <PanelMessage tone="negative">News unavailable: {news.error.message}</PanelMessage>
      ) : !news.data ? (
        <PanelMessage>Loading news…</PanelMessage>
      ) : news.data.length === 0 ? (
        <PanelMessage>No news before this time.</PanelMessage>
      ) : (
        <ol className="space-y-1.5">
          {news.data.map((item) => (
            <NewsRow key={item.id} item={item} />
          ))}
        </ol>
      )}
    </div>
  );
}

export function SourceHealth() {
  const status = trpc.system.status.useQuery(undefined, { refetchInterval: STATUS_REFRESH_MS });
  if (status.error) return <PanelMessage tone="negative">Status unavailable: {status.error.message}</PanelMessage>;
  if (!status.data) return <PanelMessage>Loading sources…</PanelMessage>;
  const { sources, enrichQuota } = status.data;

  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {sources.map((s) => (
          <li key={s.source} className="grid grid-cols-[6.5rem_1fr] gap-x-2 rounded px-1.5 py-1 text-xs">
            <span className="flex items-center gap-1.5 font-mono">
              <span className={cn("text-[10px]", HEALTH_TONE[s.status])} aria-hidden>
                ●
              </span>
              {s.source}
            </span>
            <span className="min-w-0 space-y-0.5">
              <span className={cn("block", HEALTH_TONE[s.status])}>{humanize(s.status)}</span>
              <span className="block font-mono text-[10px] text-muted-foreground">
                {s.lastOkAt ? `ok ${formatDateTime(s.lastOkAt)}` : "never ok"}
                {s.lastLatencyMs !== null ? ` · ${formatValue("count", s.lastLatencyMs)} ms` : ""}
              </span>
              {s.lastError && <span className="block truncate text-[10px] text-muted-foreground" title={s.lastError}>{s.lastError}</span>}
            </span>
          </li>
        ))}
      </ul>
      <div className="px-1.5">
        <SectionLabel>News scoring today</SectionLabel>
        <span className="font-mono text-xs">
          {formatValue("count", enrichQuota.used)} / {formatValue("count", enrichQuota.max)}
        </span>
      </div>
    </div>
  );
}
