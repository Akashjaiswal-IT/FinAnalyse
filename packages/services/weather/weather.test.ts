import { LANDFALL_REGIONS, REPLAY_FORECAST_HOURS, type Refinery, type StormPoint } from "@repo/contracts";
import db, { eq, inArray } from "@repo/database";
import { refineries, stormPoints, storms } from "@repo/database/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseHurdat2 } from "../clients/hurdat2";
import { fixtureText } from "../test-fixtures";
import { haversineKm, interpolateHourly } from "./geo";
import { atRiskRefineries, buildHypotheticalTrack, persistenceTrack, WeatherService } from "./index";

const HOUR = 3_600_000;

describe("geo stand-in", () => {
  it("haversine: one degree of latitude is 2 pi R / 360", () => {
    expect(haversineKm(29, -90, 30, -90)).toBeCloseTo((2 * Math.PI * 6371.0088) / 360, 6);
    expect(haversineKm(29.1, -90.2, 29.1, -90.2)).toBe(0);
  });

  it("interpolates to whole hours", () => {
    const pts = interpolateHourly([
      { at: 0, lat: 20, lon: -80, windKt: 60 },
      { at: 6 * HOUR, lat: 26, lon: -86, windKt: 120 },
    ]);
    expect(pts).toHaveLength(7);
    expect(pts[3]).toEqual({ at: 3 * HOUR, lat: 23, lon: -83, windKt: 90 });
  });
});

describe("hypothetical track (SPEC 5.12)", () => {
  const asOf = new Date("2026-10-03T12:00:00Z");
  const track = buildHypotheticalTrack({ category: 4, region: "LA_SOUTHEAST", hoursToLandfall: 48 }, asOf);

  it("runs 6-hourly from 24.5N 89.0W to the anchor at landfall with the category wind", () => {
    expect(track.slice(0, 9).map((p) => (Date.parse(p.validAt) - asOf.getTime()) / HOUR)).toEqual([0, 6, 12, 18, 24, 30, 36, 42, 48]);
    expect(track[0]).toMatchObject({ lat: 24.5, lon: -89, windKt: 125, kind: "forecast" });
    expect(track[8]).toMatchObject({ lat: LANDFALL_REGIONS.LA_SOUTHEAST.lat, lon: LANDFALL_REGIONS.LA_SOUTHEAST.lon, windKt: 125, recordId: "L" });
  });

  it("ends with one inland point 12 hours after landfall at half wind", () => {
    const last = track.at(-1)!;
    expect(track).toHaveLength(10);
    expect(Date.parse(last.validAt) - asOf.getTime()).toBe(60 * HOUR);
    expect(last.windKt).toBe(63);
    expect(last.lat).toBeGreaterThan(LANDFALL_REGIONS.LA_SOUTHEAST.lat);
  });

  it("rejects an unknown region", () => {
    expect(() => buildHypotheticalTrack({ category: 1, region: "NOWHERE", hoursToLandfall: 48 }, asOf)).toThrow();
  });
});

const point = (validAt: string, lat: number, lon: number, windKt: number, kind: StormPoint["kind"] = "observed"): StormPoint => ({
  stormId: "T",
  kind,
  issuedAt: validAt,
  validAt,
  lat,
  lon,
  windKt,
  pressureMb: null,
  status: null,
  recordId: null,
});
const refinery = (id: string, lat: number, lon: number): Refinery => ({
  id,
  name: id,
  company: "c",
  ticker: null,
  state: "Louisiana",
  padd: 3,
  lat,
  lon,
  capacityBpd: 100_000,
});

describe("at-risk refineries and persistence", () => {
  const asOf = new Date("2021-08-29T12:00:00Z");

  it("counts a refinery once when within 100 km of a hurricane-force point", () => {
    const pts = [point("2021-08-29T06:00:00Z", 28.5, -89.6, 130), point("2021-08-29T18:00:00Z", 29.6, -90.6, 105, "forecast")];
    const risk = atRiskRefineries(pts, [refinery("near", 29.2, -90.2), refinery("far", 32, -94)], asOf);
    expect(risk.map((r) => r.id)).toEqual(["near"]);
    expect(risk[0]!.distanceKm).toBeLessThan(20);
  });

  it("ignores old observed points and tropical-storm-force points", () => {
    const old = [point("2021-08-28T00:00:00Z", 29.2, -90.2, 130)];
    expect(atRiskRefineries(old, [refinery("near", 29.2, -90.2)], asOf)).toEqual([]);
    const weak = [point("2021-08-29T10:00:00Z", 29.2, -90.2, 50)];
    expect(atRiskRefineries(weak, [refinery("near", 29.2, -90.2)], asOf)).toEqual([]);
  });

  it("extrapolates 48 hours from the last two observed points", () => {
    const track = persistenceTrack([point("2021-08-29T00:00:00Z", 27, -89, 100), point("2021-08-29T06:00:00Z", 28, -90, 110)], asOf)!;
    expect(track).toHaveLength(8);
    expect(track[0]).toMatchObject({ kind: "forecast", lat: 29, lon: -91, windKt: 110, validAt: "2021-08-29T12:00:00.000Z" });
    expect(track.at(-1)).toMatchObject({ lat: 36, lon: -98, validAt: "2021-08-31T06:00:00.000Z" });
    expect(persistenceTrack([point("2021-08-29T00:00:00Z", 27, -89, 100)], asOf)).toBeNull();
  });
});

// GATE A2: at the Ida as-of, weather.track returns observed points plus 72 hours of labelled forecast.
describe("Ida replay track (database)", () => {
  const IDA_AS_OF = new Date("2021-08-27T21:00:00.000Z");
  const ida = parseHurdat2(fixtureText("hurdat2-two-storms.txt"))[0]!;
  let insertedStorm = false;
  const REFINERY = "zz-test-near-ida-landfall";

  beforeAll(async () => {
    const added = await db.insert(storms).values(ida.storm).onConflictDoNothing().returning({ id: storms.id });
    insertedStorm = added.length > 0;
    await db
      .insert(stormPoints)
      .values(ida.points.map((p) => ({ ...p, issuedAt: new Date(p.issuedAt), validAt: new Date(p.validAt) })))
      .onConflictDoNothing();
    await db.insert(refineries).values({ ...refinery(REFINERY, 29.2, -90.3), id: REFINERY }).onConflictDoNothing();
  });

  afterAll(async () => {
    await db.delete(refineries).where(inArray(refineries.id, [REFINERY]));
    if (insertedStorm) await db.delete(storms).where(eq(storms.id, ida.storm.id));
    await db.$client.end();
  });

  it("lists Ida among the storms at the as-of", async () => {
    expect((await new WeatherService().stormsAt(IDA_AS_OF)).map((s) => s.id)).toContain("AL092021");
  });

  it("returns observed points up to the as-of and the next 72 hours as perfect-forecast replay", async () => {
    const track = (await new WeatherService().track("al092021", IDA_AS_OF))!;
    expect(track.forecastLabel).toBe("perfect_forecast_replay");
    const observed = track.points.filter((p) => p.kind === "observed");
    const forecast = track.points.filter((p) => p.kind === "forecast");
    expect(observed.every((p) => Date.parse(p.validAt) <= IDA_AS_OF.getTime())).toBe(true);
    expect(observed.at(-1)?.validAt).toBe("2021-08-27T18:00:00.000Z");
    expect(forecast[0]?.validAt).toBe("2021-08-27T23:25:00.000Z");
    const end = IDA_AS_OF.getTime() + REPLAY_FORECAST_HOURS * HOUR;
    expect(forecast.every((p) => Date.parse(p.validAt) > IDA_AS_OF.getTime() && Date.parse(p.validAt) <= end)).toBe(true);
    expect(forecast.every((p) => p.issuedAt === IDA_AS_OF.toISOString())).toBe(true);
    // The 2021-08-29 16:55 landfall (130 kt) is inside the window.
    expect(forecast.some((p) => p.recordId === "L" && p.windKt === 130)).toBe(true);
    expect(track.atRiskRefineries.map((r) => r.id)).toContain(REFINERY);
  });

  it("returns null for an unknown storm", async () => {
    expect(await new WeatherService().track("AL992099", IDA_AS_OF)).toBeNull();
  });
});
