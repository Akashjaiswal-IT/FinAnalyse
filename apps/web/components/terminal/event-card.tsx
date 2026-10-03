"use client";

import { formatValue, type ReplayPreset } from "@repo/contracts";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";
import { formatDateTime, humanize } from "~/lib/display";
import { DIRECTION_GLYPH, EVENT_TYPE_TONE, SEVERITY_TONE } from "~/lib/tone";
import { PanelMessage, SectionLabel, Stat } from "./bits";
import { useRun } from "./run-context";

/**
 * The run's event profile: what happened, how loud the news is, and who it touches. Replay and live events
 * show their news counts; a hypothetical event is badged and says its news features are assumed.
 */
export function EventCard({ preview }: { preview: ReplayPreset | null }) {
  const { view } = useRun();
  const profile = view.eventProfile;
  const eventNode = view.nodes.event;

  if (!profile) {
    if (view.phase === "running" && (eventNode.status === "pending" || eventNode.status === "running")) {
      return (
        <Card className="gap-0 py-0" aria-busy="true">
          <CardContent className="space-y-2 p-4">
            <SectionLabel>Event</SectionLabel>
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <p className="text-xs text-muted-foreground">
              {eventNode.status === "running" ? "Resolving the event…" : "Waiting for the planner…"}
            </p>
          </CardContent>
        </Card>
      );
    }
    if (view.phase !== "idle") {
      return (
        <PanelMessage tone={view.phase === "failed" ? "negative" : "muted"}>
          {eventNode.summary ?? "No event profile for this run."}
        </PanelMessage>
      );
    }
    return (
      <Card className="gap-0 py-0">
        <CardContent className="space-y-1.5 p-4">
          <SectionLabel>Event</SectionLabel>
          {preview ? (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className={cn("capitalize", EVENT_TYPE_TONE[preview.type])}>
                  {humanize(preview.type)}
                </Badge>
                <span className="text-sm font-medium">{preview.name}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Replay as of {formatDateTime(preview.asOf)}
                {preview.confirmed ? "" : " (provisional time)"}. Ask a question to resolve the event.
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Ask a question to resolve the event.</p>
          )}
        </CardContent>
      </Card>
    );
  }

  const hypothetical = profile.source === "hypothetical";

  return (
    <Card className="gap-0 py-0">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <SectionLabel className="mr-1">Event</SectionLabel>
          <Badge variant="outline" className={cn("capitalize", EVENT_TYPE_TONE[profile.type])}>
            {humanize(profile.type)}
          </Badge>
          {profile.subtype && (
            <Badge variant="outline" className="capitalize">
              {humanize(profile.subtype)}
            </Badge>
          )}
          <Badge variant="outline" className={cn("capitalize", SEVERITY_TONE[profile.severity])}>
            {profile.severity} severity
          </Badge>
          {hypothetical ? (
            <Badge variant="outline" className="border-warning/50 bg-warning/10 text-warning">
              hypothetical
            </Badge>
          ) : (
            <Badge variant="outline" className="capitalize text-muted-foreground">
              {profile.source}
            </Badge>
          )}
        </div>

        <h2 className="text-base leading-snug font-semibold">{profile.title}</h2>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5">
          <Stat label="First report" className="col-span-2">
            {profile.firstReportAt ? formatDateTime(profile.firstReportAt) : "n/a"}
          </Stat>
          <Stat label="Articles">
            {profile.articleCount === null ? "n/a" : formatValue("count", profile.articleCount)}
          </Stat>
          <Stat label="Domains">
            {profile.domainCount === null ? "n/a" : formatValue("count", profile.domainCount)}
          </Stat>
          <Stat label="Volume z / tone z">
            {profile.volZ === null ? "n/a" : formatValue("z", profile.volZ)}
            {" / "}
            {profile.toneZ === null ? "n/a" : formatValue("z", profile.toneZ)}
          </Stat>
        </div>

        {profile.newsBasis !== "observed" && (
          <p className="text-xs text-warning">
            {profile.newsBasis === "assumed"
              ? "News features are assumed from the event's severity, not observed."
              : "News features were unavailable for this event."}
          </p>
        )}

        <div className="space-y-1.5">
          <SymbolRow label="Direct" symbols={profile.entities} />
          <SymbolRow label="Peers" symbols={profile.peerSymbols} muted />
          <SymbolRow label="External" symbols={profile.externalNames} muted />
          <SymbolRow label="Sectors" symbols={profile.affectedSectors.map(humanize)} muted />
          {profile.factorDirections.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="w-14 shrink-0 text-[10px] tracking-wider text-muted-foreground uppercase">Factors</span>
              {profile.factorDirections.map(({ factor, direction }) => {
                const d = DIRECTION_GLYPH[direction];
                return (
                  <span key={factor} className="inline-flex items-center gap-1 font-mono text-xs">
                    {factor}
                    <span className={d.tone} aria-label={d.label} title={`${factor} ${d.label}`}>
                      {d.glyph}
                    </span>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {view.otherEvents.length > 0 && (
          <div className="border-t pt-2">
            <SectionLabel className="mb-1">Also in the news</SectionLabel>
            <ul className="space-y-0.5 text-xs">
              {view.otherEvents.map((e) => (
                <li key={e.id} className="flex items-center gap-1.5">
                  <Badge variant="outline" className={cn("capitalize", EVENT_TYPE_TONE[e.type])}>
                    {humanize(e.type)}
                  </Badge>
                  <span className="truncate">{e.title}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SymbolRow({ label, symbols, muted = false }: { label: string; symbols: readonly string[]; muted?: boolean }) {
  if (symbols.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="w-14 shrink-0 text-[10px] tracking-wider text-muted-foreground uppercase">{label}</span>
      {symbols.map((s) => (
        <Badge key={s} variant="outline" className={cn("font-mono", muted && "text-muted-foreground")}>
          {s}
        </Badge>
      ))}
    </div>
  );
}
