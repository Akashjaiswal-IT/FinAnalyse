"use client";

import Link from "next/link";
import { Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MarketEventView, Mode } from "@repo/contracts";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "~/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { useRunStream } from "~/hooks/use-run-stream";
import { useTerminalUrl } from "~/hooks/use-terminal-url";
import { DATA_SOURCE, runDriver } from "~/lib/data-source";
import { formatDateTime } from "~/lib/display";
import { fixturePortfolioAt } from "~/lib/fixture-data";
import { trpc } from "~/trpc/client";
import { findPreset } from "~/lib/url-state";
import { AgentGraph } from "./agent-graph";
import { AnswerCard } from "./answer-card";
import { DrilldownSheet } from "./drilldown-sheet";
import { EventCard } from "./event-card";
import { ForecastPanel } from "./forecast-panel";
import { HedgeTable } from "./hedge-table";
import { ImpactStrip } from "./impact-strip";
import { EventFeed, NewsFeed, SourceDots, SourceHealth, useLiveRefresh } from "./live-panels";
import { ModeSwitch } from "./mode-switch";
import { PortfolioPanel } from "./portfolio-panel";
import { QueryBar } from "./query-bar";
import { RiskSummary } from "./risk-summary";
import { RunProvider, type DrilldownTarget } from "./run-context";
import { StepLog } from "./step-log";
import { WeatherMap } from "./weather-map";
import { WhatHappened } from "./what-happened";

/** The terminal: top bar and three resizable columns (portfolio, question and answer, step log). */
export function Terminal() {
  const url = useTerminalUrl();
  const stream = useRunStream(runDriver);
  const [drill, setDrill] = useState<{ target: DrilldownTarget | null; open: boolean }>({ target: null, open: false });

  const openDrilldown = useCallback((target: DrilldownTarget) => setDrill({ target, open: true }), []);
  const runContext = useMemo(() => ({ view: stream.view, openDrilldown }), [stream.view, openDrilldown]);

  const preset = findPreset(url.presetId);
  const fixtureSnapshot = useMemo(() => fixturePortfolioAt(url.asOf), [url.asOf]);
  const portfolio = trpc.portfolio.get.useQuery(url.asOf ? { asOf: url.asOf } : {}, { enabled: DATA_SOURCE === "api" });
  const snapshot = DATA_SOURCE === "api" ? (portfolio.data ?? null) : fixtureSnapshot;

  // A reload mid-run follows the run named in the URL again, from its first event.
  const { attach } = stream;
  const initialRun = useRef(url.runId);
  useEffect(() => {
    if (initialRun.current) attach(initialRun.current);
  }, [attach]);
  const { runId: urlRunId, setRunId } = url;
  useEffect(() => {
    if (stream.runId && stream.runId !== urlRunId) setRunId(stream.runId);
  }, [stream.runId, urlRunId, setRunId]);

  // A new mode, preset or as-of makes the previous answer describe a different question, so it is cleared.
  const { reset } = stream;
  const { setMode, setPreset, setAsOf } = url;
  const changeMode = useCallback((mode: Mode) => (reset(), setMode(mode)), [reset, setMode]);
  const changePreset = useCallback((id: string) => (reset(), setPreset(id)), [reset, setPreset]);
  const changeAsOf = useCallback((asOf: string) => (reset(), setAsOf(asOf)), [reset, setAsOf]);

  const apiMode = DATA_SOURCE === "api";
  useLiveRefresh(apiMode && url.mode === "live");
  const [tab, setTab] = useState("steps");
  const analyse = (e: MarketEventView) => {
    setTab("steps");
    stream.start({
      query: `How will "${e.title}" affect our portfolio?`,
      mode: url.mode,
      asOf: url.asOf,
      replayPresetId: url.presetId,
      marketEventId: e.id,
    });
  };

  // A submit that never started (no recorded run for this selection) leaves no events, only an explanation.
  const notice = stream.status === "failed" && stream.events.length === 0 ? stream.error : null;

  return (
    <RunProvider value={runContext}>
      <div className="flex h-dvh flex-col">
        <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b bg-background/60 px-4 py-2 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2.5">
              <span className="flex size-7 items-center justify-center rounded-md bg-gradient-to-br from-primary to-warning/70 shadow-[0_0_18px_-4px_var(--primary)]">
                <Zap className="size-4 text-primary-foreground" aria-hidden />
              </span>
              <span className="leading-tight">
                <span className="block font-mono text-sm font-bold tracking-[0.25em] text-primary">TEMPEST</span>
                <span className="hidden text-[10px] text-muted-foreground xl:block">Event-driven portfolio intelligence</span>
              </span>
            </span>
            {DATA_SOURCE === "fixture" && (
              <Badge
                variant="outline"
                className="border-warning/50 bg-warning/10 text-warning"
                title="Runs are recorded fixtures from @repo/contracts. Their numbers are hand-built, not market data."
              >
                fixture data
              </Badge>
            )}
          </div>
          <ModeSwitch
            mode={url.mode}
            presetId={url.presetId}
            asOf={url.asOf}
            disabled={stream.isActive}
            onModeChange={changeMode}
            onPresetChange={changePreset}
            onAsOfChange={changeAsOf}
          />
          <div className="flex items-center gap-2">
            {apiMode && <SourceDots onOpen={() => setTab("sources")} />}
            <Button asChild variant="ghost" size="sm">
              <Link href="/reliability">Reliability</Link>
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => openDrilldown({ kind: "run" })}>
              Audit
            </Button>
          </div>
        </header>

        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
          <ResizablePanel defaultSize="22%" minSize="15%" maxSize="38%">
            {snapshot ? (
              <PortfolioPanel
                snapshot={snapshot}
                asOfLabel={url.asOf ? `As of ${formatDateTime(url.asOf)}` : "Live"}
              />
            ) : (
              <div className="p-4 text-sm text-muted-foreground">
                {portfolio.error ? `Portfolio unavailable: ${portfolio.error.message}` : "Loading portfolio…"}
              </div>
            )}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="50%" minSize="30%">
            <main className="bg-grid h-full overflow-y-auto">
              <div className="mx-auto max-w-4xl space-y-3 p-3">
                <QueryBar
                  disabled={stream.isActive}
                  notice={notice}
                  onSubmit={(query) =>
                    stream.start({ query, mode: url.mode, asOf: url.asOf, replayPresetId: url.presetId })
                  }
                  onPickExample={changePreset}
                />
                <EventCard preview={preset} />
                <AgentGraph />
                <ImpactStrip />
                <AnswerCard />
                <HedgeTable />
                <RiskSummary />
                <ForecastPanel />
                {apiMode && <WhatHappened presetId={url.presetId} />}
                {apiMode && <WeatherMap />}
              </div>
            </main>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="28%" minSize="18%" maxSize="42%">
            {apiMode ? (
              <Tabs value={tab} onValueChange={setTab} className="flex h-full min-h-0 flex-col gap-0">
                <TabsList className="m-2 mb-0 w-auto">
                  <TabsTrigger value="steps">Steps</TabsTrigger>
                  <TabsTrigger value="events">Events</TabsTrigger>
                  <TabsTrigger value="news">News</TabsTrigger>
                  <TabsTrigger value="sources">Sources</TabsTrigger>
                </TabsList>
                <TabsContent value="steps" className="min-h-0 flex-1">
                  <StepLog events={stream.events} />
                </TabsContent>
                <TabsContent value="events" className="min-h-0 flex-1 overflow-y-auto p-2">
                  <EventFeed asOf={url.asOf} disabled={stream.isActive} onAnalyse={analyse} />
                </TabsContent>
                <TabsContent value="news" className="min-h-0 flex-1 overflow-y-auto p-2">
                  <NewsFeed asOf={url.asOf} />
                </TabsContent>
                <TabsContent value="sources" className="min-h-0 flex-1 overflow-y-auto p-2">
                  <SourceHealth />
                </TabsContent>
              </Tabs>
            ) : (
              <StepLog events={stream.events} />
            )}
          </ResizablePanel>
        </ResizablePanelGroup>

        <DrilldownSheet
          target={drill.target}
          open={drill.open}
          onOpenChange={(open) => setDrill((d) => ({ ...d, open }))}
        />
      </div>
    </RunProvider>
  );
}
