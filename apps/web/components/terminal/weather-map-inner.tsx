"use client";

import "leaflet/dist/leaflet.css";
import type { AtRiskRefinery, StormPoint } from "@repo/contracts";
import { formatValue } from "@repo/contracts";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from "react-leaflet";
import { useTheme } from "next-themes";
import { formatDateTime } from "~/lib/display";

const TILES = {
  dark: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  light: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
};
const ATTRIBUTION = "Tiles &copy; Esri";
const GULF: [number, number][] = [
  [18, -98],
  [31, -80],
];

const line = (points: StormPoint[]) => points.map((p) => [p.lat, p.lon] as [number, number]);

/** Leaflet touches `window`, so this module is loaded only in the browser through `next/dynamic`. */
export default function WeatherMapInner({ points, refineries }: { points: StormPoint[]; refineries: AtRiskRefinery[] }) {
  const { resolvedTheme } = useTheme();
  const observed = points.filter((p) => p.kind === "observed");
  const forecast = points.filter((p) => p.kind === "forecast");
  // The forecast line starts at the last observed point so the two read as one track.
  const lastObserved = observed.at(-1);
  const forecastLine = lastObserved && forecast.length ? [lastObserved, ...forecast] : forecast;

  const bounds = points.length > 1 ? [...line(points), ...refineries.map((r) => [r.lat, r.lon] as [number, number])] : GULF;

  return (
    <MapContainer bounds={bounds} boundsOptions={{ padding: [16, 16] }} scrollWheelZoom={false} className="h-72 w-full rounded-md">
      <TileLayer key={resolvedTheme} url={resolvedTheme === "light" ? TILES.light : TILES.dark} attribution={ATTRIBUTION} />
      <Polyline positions={line(observed)} pathOptions={{ color: "#f59e0b", weight: 3 }} />
      <Polyline positions={line(forecastLine)} pathOptions={{ color: "#f59e0b", weight: 2, dashArray: "6 6" }} />
      {points.map((p) => (
        <CircleMarker key={`${p.kind}-${p.validAt}`} center={[p.lat, p.lon]} radius={3} pathOptions={{ color: "#f59e0b", fillOpacity: 0.9 }}>
          <Tooltip>
            {formatDateTime(p.validAt)} · {formatValue("kt", p.windKt)} · {p.kind}
          </Tooltip>
        </CircleMarker>
      ))}
      {refineries.map((r) => (
        <CircleMarker key={r.id} center={[r.lat, r.lon]} radius={5} pathOptions={{ color: "#ef4444", fillOpacity: 0.6 }}>
          <Tooltip>
            {r.name} ({r.company}) · {formatValue("bpd", r.capacityBpd)} · {Math.round(r.distanceKm)} km
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
