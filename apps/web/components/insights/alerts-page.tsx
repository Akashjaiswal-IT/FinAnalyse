"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, BellRing, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { UNIVERSE, type Alert } from "@repo/contracts";
import { PageHeader } from "~/components/shell/page-header";
import { SEVERITY_DOT, SEVERITY_TONE } from "~/components/shell/severity";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { formatDateTime, humanize } from "~/lib/display";
import { useAlerts } from "~/lib/insights";
import { CHANNEL_TONE, CONFIDENCE_TONE, DIRECTION_GLYPH, EVENT_TYPE_TONE } from "~/lib/tone";
import { cn } from "~/lib/utils";

const nameOf = (symbol: string) => UNIVERSE.find((u) => u.symbol === symbol)?.name ?? symbol;
const analyzeHref = (a: Alert) =>
  a.replayPresetId ? `/analyze?mode=replay&preset=${a.replayPresetId}` : `/analyze?q=${encodeURIComponent(`How will "${a.title}" affect our portfolio?`)}`;

function AlertCard({ alert, highlighted, onDismiss }: { alert: Alert; highlighted: boolean; onDismiss(): void }) {
  return (
    <Card id={alert.id} className={cn("scroll-mt-24 gap-0 py-0 transition-shadow", highlighted && "ring-2 ring-primary/50")}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={cn("gap-1.5 capitalize", SEVERITY_TONE[alert.severity])}>
            <span className={cn("size-1.5 rounded-full", SEVERITY_DOT[alert.severity])} aria-hidden />
            {alert.severity}
          </Badge>
          <Badge variant="outline" className={EVENT_TYPE_TONE[alert.eventType]}>
            {humanize(alert.eventType)}
          </Badge>
          <span className="text-[12px] text-muted-foreground">{formatDateTime(alert.raisedAt)}</span>
        </div>
        <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onDismiss} aria-label="Dismiss this alert">
          <X className="size-4" />
        </Button>
      </div>

      <div className="space-y-4 px-6 pt-3 pb-5">
        <div className="space-y-1">
          <h2 className="text-lg leading-snug font-semibold tracking-[-0.01em]">{alert.title}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{alert.summary}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {alert.holdings.map((h) => {
            const d = DIRECTION_GLYPH[h.expected];
            return (
              <span key={h.symbol} className="flex items-center gap-2 rounded-lg border bg-background/40 px-3 py-1.5">
                <span className="font-mono text-[13px] font-semibold">{h.symbol}</span>
                <span className="hidden text-[12px] text-muted-foreground sm:inline">{nameOf(h.symbol)}</span>
                <Badge variant="outline" className={cn("px-1.5 py-0 text-[10px]", CHANNEL_TONE[h.channel])}>
                  {h.channel}
                </Badge>
                <span className={cn("text-[12px]", d.tone)} title={`Expected direction: ${d.label}`}>
                  {d.glyph} {d.label}
                </span>
              </span>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-muted-foreground">
          <span>{alert.articleCount} articles</span>
          <Badge variant="outline" className={cn("capitalize", CONFIDENCE_TONE[alert.confidence])}>
            {alert.confidence} confidence
          </Badge>
        </div>

        {alert.sources.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] tracking-wider text-muted-foreground uppercase">Sources</div>
            <ul className="space-y-1">
              {alert.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noreferrer" className="group inline-flex items-center gap-1.5 text-[13px] hover:text-primary">
                    {s.title}
                    <span className="text-[11px] text-muted-foreground">{s.domain}</span>
                    <ArrowUpRight className="size-3.5 opacity-50 group-hover:opacity-100" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Button asChild className="gap-1.5">
          <Link href={analyzeHref(alert)}>
            <Sparkles className="size-4" /> Run the full analysis
          </Link>
        </Button>
      </div>
    </Card>
  );
}

/** Alerts raised without a question when news reaches a holding. */
export function AlertsPage() {
  const { alerts, preview } = useAlerts();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [highlight, setHighlight] = useState<string | null>(null);

  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) setHighlight(id);
  }, []);

  const visible = alerts.filter((a) => !dismissed.has(a.id));

  // Demo aid: plays the most severe alert as if it had just arrived from the live feed.
  function simulate() {
    const a = alerts[0];
    if (!a) return;
    setDismissed((d) => new Set([...d].filter((x) => x !== a.id)));
    toast(a.title, {
      description: `${a.holdings.map((h) => h.symbol).join(", ")} · ${humanize(a.eventType)} · ${a.confidence} confidence`,
      icon: <BellRing className="size-4 text-negative" />,
      duration: 8000,
      action: { label: "Analyze", onClick: () => (window.location.href = analyzeHref(a)) },
    });
    setHighlight(a.id);
    document.getElementById(a.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-6 px-6 py-7">
        <PageHeader
          eyebrow="Alerts"
          title="News that reached your holdings"
          description="Raised without a question: the system watches news about every holding and its competitors, and alerts when an event is likely to move them."
          actions={
            <Button type="button" variant="outline" className="gap-1.5" onClick={simulate}>
              <BellRing className="size-4" /> Simulate an incoming alert
            </Button>
          }
        />
        {preview && (
          <p className="rounded-xl border border-dashed px-4 py-3 text-[13px] text-muted-foreground">
            Preview: these alerts are past events in the replay set. “Run the full analysis” runs the real pipeline on each one.
          </p>
        )}
        <AnimatePresence initial={false}>
          {visible.map((a) => (
            <motion.div key={a.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
              <AlertCard alert={a} highlighted={highlight === a.id} onDismiss={() => setDismissed((d) => new Set(d).add(a.id))} />
            </motion.div>
          ))}
        </AnimatePresence>
        {visible.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No alerts. Every one was dismissed.</p>}
      </div>
    </main>
  );
}
