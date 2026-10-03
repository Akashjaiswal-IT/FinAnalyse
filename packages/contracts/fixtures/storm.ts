import type { AtRiskRefinery, Storm, StormPoint, StormTrack } from "../schemas";

// Hand-built development data. Positions and winds approximate Hurricane Ida but are NOT HURDAT2 values.

export const fixtureStorm: Storm = { id: "AL092021", name: "Ida", season: 2021, source: "hurdat2" };

const ISSUED = "2021-08-27T21:00:00.000Z";

function point(
  kind: StormPoint["kind"],
  validAt: string,
  lat: number,
  lon: number,
  windKt: number,
  status: string,
  recordId: string | null = null,
): StormPoint {
  return {
    stormId: fixtureStorm.id,
    kind,
    issuedAt: kind === "observed" ? validAt : ISSUED,
    validAt,
    lat,
    lon,
    windKt,
    pressureMb: null,
    status,
    recordId,
  };
}

export const fixtureStormPoints: StormPoint[] = [
  point("observed", "2021-08-27T09:00:00.000Z", 20.6, -81.3, 55, "TS"),
  point("observed", "2021-08-27T15:00:00.000Z", 21.7, -82.2, 70, "HU"),
  point("observed", "2021-08-27T21:00:00.000Z", 22.9, -83.6, 75, "HU"),
  point("forecast", "2021-08-28T03:00:00.000Z", 24.3, -85.2, 90, "HU"),
  point("forecast", "2021-08-28T15:00:00.000Z", 26.5, -87.6, 110, "HU"),
  point("forecast", "2021-08-29T03:00:00.000Z", 28.2, -89.7, 120, "HU"),
  point("forecast", "2021-08-29T17:00:00.000Z", 29.1, -90.2, 130, "HU", "L"),
  point("forecast", "2021-08-30T05:00:00.000Z", 30.2, -90.6, 90, "HU"),
];

export const fixtureAtRiskRefineries: AtRiskRefinery[] = [
  { id: "fixture-ref-1", name: "Fixture refinery 1", company: "Valero Energy", ticker: "VLO", state: "LA", padd: 3, lat: 29.99, lon: -90.38, capacityBpd: 340_000, distanceKm: 18 },
  { id: "fixture-ref-2", name: "Fixture refinery 2", company: "Marathon Petroleum", ticker: "MPC", state: "LA", padd: 3, lat: 30.05, lon: -90.5, capacityBpd: 590_000, distanceKm: 31 },
  { id: "fixture-ref-3", name: "Fixture refinery 3", company: "Phillips 66", ticker: "PSX", state: "LA", padd: 3, lat: 29.95, lon: -90.6, capacityBpd: 255_000, distanceKm: 44 },
  { id: "fixture-ref-4", name: "Fixture refinery 4", company: "Exxon Mobil", ticker: "XOM", state: "LA", padd: 3, lat: 30.48, lon: -91.2, capacityBpd: 520_000, distanceKm: 87 },
];

export const fixtureStormTrack: StormTrack = {
  storm: fixtureStorm,
  asOf: ISSUED,
  points: fixtureStormPoints,
  forecastLabel: "perfect_forecast_replay",
  atRiskRefineries: fixtureAtRiskRefineries,
};
