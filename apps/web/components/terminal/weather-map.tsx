"use client";

import dynamic from "next/dynamic";
import { formatValue } from "@repo/contracts";
import { Card, CardContent } from "~/components/ui/card";
import { humanize } from "~/lib/display";
import { trpc } from "~/trpc/client";
import { PanelMessage, SectionLabel, Stat } from "./bits";
import { useRun } from "./run-context";

const WeatherMapInner = dynamic(() => import("./weather-map-inner"), {
  ssr: false,
  loading: () => <PanelMessage>Loading map…</PanelMessage>,
});

/** The storm track and the refineries at risk, for runs whose weather node found a storm. */
export function WeatherMap() {
  const { view } = useRun();
  const weather = view.weather;
  const storm = weather?.status === "ok" ? weather.storm : null;
  const track = trpc.weather.track.useQuery(
    { stormId: storm?.id ?? "", ...(view.asOf ? { asOf: view.asOf } : {}) },
    { enabled: storm !== null },
  );

  if (!weather || weather.status === "skipped") {
    return view.phase === "succeeded" || view.phase === "partial" ? <PanelMessage>No storm in this event.</PanelMessage> : null;
  }
  if (weather.status !== "ok") return <PanelMessage>Weather unavailable: {weather.reason}</PanelMessage>;

  return (
    <Card className="gap-0 py-0">
      <CardContent className="space-y-3 p-4">
        <SectionLabel>
          Storm {weather.storm.name} ({weather.storm.id})
        </SectionLabel>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          <Stat label="Category now / peak">
            {formatValue("category", weather.currentCategory)} / {formatValue("category", weather.peakCategory)}
          </Stat>
          <Stat label="Landfall">{weather.landfallRegion ? humanize(weather.landfallRegion.toLowerCase()) : "none forecast"}</Stat>
          <Stat label="Refineries at risk">{formatValue("count", weather.refineriesAtRisk)}</Stat>
          <Stat label="Gulf capacity at risk">{formatValue("pct", weather.gulfCapAtRisk)}</Stat>
        </div>
        {track.data ? (
          <WeatherMapInner points={track.data.points} refineries={track.data.atRiskRefineries} />
        ) : track.error ? (
          <PanelMessage tone="negative">Track unavailable: {track.error.message}</PanelMessage>
        ) : (
          <PanelMessage>Loading track…</PanelMessage>
        )}
        {weather.forecastLabel && <p className="text-[10px] text-muted-foreground">Track: {humanize(weather.forecastLabel)}</p>}
      </CardContent>
    </Card>
  );
}
