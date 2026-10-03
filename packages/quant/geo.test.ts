import type { Refinery, StormPoint } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import {
  EARTH_RADIUS_KM,
  capacityAtRisk,
  findLandfall,
  haversineKm,
  hubCentroid,
  hurricaneShareInBox,
  impactPoints,
  impactSourcePoints,
  inBox,
  interpolateTrack,
  isGulfHurricane,
  maxWindBetween,
  nearestLandfallRegion,
  peakCategory,
  refineriesAtRisk,
  saffirSimpsonCategory,
  type TrackPoint,
} from "./geo";

const tp = (validAt: string, lat: number, lon: number, windKt: number): TrackPoint => ({ validAt, lat, lon, windKt });

const sp = (
  validAt: string,
  lat: number,
  lon: number,
  windKt: number,
  extra: Partial<StormPoint> = {},
): StormPoint => ({
  stormId: "AL092021",
  kind: "observed",
  issuedAt: validAt,
  validAt,
  lat,
  lon,
  windKt,
  pressureMb: null,
  status: null,
  recordId: null,
  ...extra,
});

describe("haversineKm", () => {
  it("one degree of arc is 2πR/360", () => {
    const degree = (2 * Math.PI * EARTH_RADIUS_KM) / 360; // 111.195 km
    expect(haversineKm(0, 0, 1, 0)).toBeCloseTo(degree, 6);
    expect(haversineKm(0, 0, 0, 1)).toBeCloseTo(degree, 6);
  });
  it("matches published city-pair distances within 1 km", () => {
    expect(Math.abs(haversineKm(40.7128, -74.006, 34.0522, -118.2437) - 3936)).toBeLessThan(1); // New York - Los Angeles
    expect(Math.abs(haversineKm(51.5074, -0.1278, 48.8566, 2.3522) - 344)).toBeLessThan(1); // London - Paris
  });
  it("is zero for the same point and symmetric", () => {
    expect(haversineKm(29.7, -95, 29.7, -95)).toBe(0);
    expect(haversineKm(29.7, -95.3, 30.5, -91.1)).toBeCloseTo(haversineKm(30.5, -91.1, 29.7, -95.3), 9);
  });
});

describe("interpolateTrack", () => {
  const six = [tp("2021-08-29T00:00:00.000Z", 25, -90, 100), tp("2021-08-29T06:00:00.000Z", 31, -84, 70)];
  it("fills hourly points linearly in time and keeps the endpoints", () => {
    const out = interpolateTrack(six);
    expect(out).toHaveLength(7);
    expect(out[0]).toEqual(six[0]);
    expect(out[6]).toEqual(six[1]);
    expect(out[3]).toEqual(tp("2021-08-29T03:00:00.000Z", 28, -87, 85));
  });
  it("supports another step and handles unsorted, single and duplicate-time input", () => {
    expect(interpolateTrack(six, 3).map((p) => p.validAt)).toEqual([
      "2021-08-29T00:00:00.000Z",
      "2021-08-29T03:00:00.000Z",
      "2021-08-29T06:00:00.000Z",
    ]);
    expect(interpolateTrack([six[1] as TrackPoint, six[0] as TrackPoint])).toHaveLength(7);
    expect(interpolateTrack([six[0] as TrackPoint])).toEqual([six[0]]);
    expect(interpolateTrack([])).toEqual([]);
    expect(interpolateTrack([six[0] as TrackPoint, six[0] as TrackPoint])).toHaveLength(1);
  });
  it("handles an off-hour landfall record between two synoptic times", () => {
    const out = interpolateTrack([
      tp("2021-08-29T12:00:00.000Z", 29, -90, 130),
      tp("2021-08-29T16:55:00.000Z", 29.1, -90.2, 130),
      tp("2021-08-29T18:00:00.000Z", 29.3, -90.4, 125),
    ]);
    expect(out.map((p) => p.validAt).slice(0, 6)).toEqual([
      "2021-08-29T12:00:00.000Z",
      "2021-08-29T13:00:00.000Z",
      "2021-08-29T14:00:00.000Z",
      "2021-08-29T15:00:00.000Z",
      "2021-08-29T16:00:00.000Z",
      "2021-08-29T16:55:00.000Z",
    ]);
    expect(out[out.length - 1]?.validAt).toBe("2021-08-29T18:00:00.000Z");
  });
  it("rejects a non-positive step", () => {
    expect(() => interpolateTrack(six, 0)).toThrow(RangeError);
  });
});

describe("impactSourcePoints", () => {
  const asOf = "2021-08-27T21:00:00.000Z";
  const points = [
    sp("2021-08-27T06:00:00.000Z", 24, -85, 60), // 15 h before: too old
    sp("2021-08-27T12:00:00.000Z", 24.5, -86, 65), // 9 h before: kept
    sp("2021-08-27T18:00:00.000Z", 25, -87, 70),
    sp("2021-08-28T00:00:00.000Z", 26, -88, 80, { kind: "forecast" }),
    sp("2021-08-27T18:00:00.000Z", 25, -87, 70, { kind: "forecast" }), // a forecast point in the past: dropped
    sp("2021-08-28T06:00:00.000Z", 27, -89, 90, { kind: "forecast" }),
    sp("2021-08-28T12:00:00.000Z", 27.5, -89.5, 95), // an observed point after asOf (not yet known): dropped
  ];
  it("keeps recent observed points and future forecast points, sorted", () => {
    const out = impactSourcePoints(points, asOf);
    expect(out.map((p) => p.validAt)).toEqual([
      "2021-08-27T12:00:00.000Z",
      "2021-08-27T18:00:00.000Z",
      "2021-08-28T00:00:00.000Z",
      "2021-08-28T06:00:00.000Z",
    ]);
  });
  it("honours another recent window", () => {
    expect(impactSourcePoints(points, asOf, 20)).toHaveLength(5); // the 06:00 point is 15 h old: inside a 20 h window
  });
});

describe("impactPoints", () => {
  it("keeps the hourly points at or above hurricane force", () => {
    // 90 kt falling to 50 kt over 6 h: 90, 83.3, 76.7, 70, 63.3, 56.7, 50 -> four points at 64 kt or more.
    const out = impactPoints([tp("2021-08-29T00:00:00.000Z", 29, -90, 90), tp("2021-08-29T06:00:00.000Z", 30, -90, 50)]);
    expect(out).toHaveLength(4);
    expect(out[3]?.windKt).toBeCloseTo(70, 9);
  });
  it("is empty for a tropical storm and honours a lower threshold", () => {
    const weak = [tp("2021-08-29T00:00:00.000Z", 29, -90, 50), tp("2021-08-29T06:00:00.000Z", 30, -90, 55)];
    expect(impactPoints(weak)).toEqual([]);
    expect(impactPoints(weak, 34)).toHaveLength(7);
  });
});

describe("refineriesAtRisk", () => {
  const refinery = (id: string, lat: number, lon: number, padd = 3, ticker: string | null = null, bpd = 100_000): Refinery => ({
    id,
    name: id,
    company: id,
    ticker,
    state: "LA",
    padd,
    lat,
    lon,
    capacityBpd: bpd,
  });
  const impact = [tp("2021-08-29T12:00:00.000Z", 29, -90, 120), tp("2021-08-29T13:00:00.000Z", 29, -90.5, 120)];
  it("includes refineries within 100 km of any impact point, once each, with the nearest distance", () => {
    const out = refineriesAtRisk(
      [
        refinery("near", 29.3, -90), // 33.4 km from the first point
        refinery("far", 30.5, -90), // 166.8 km
        refinery("edge-in", 29, -89), // 97.3 km from (29, -90)
        refinery("edge-out", 29, -88.9), // 107.0 km from (29, -90)
      ],
      impact,
    );
    expect(out.map((r) => r.id)).toEqual(["near", "edge-in"]);
    expect(out[0]?.distanceKm).toBeCloseTo(33.3585, 3);
    expect(out[1]?.distanceKm).toBeCloseTo(97.2531, 3);
  });
  it("uses the nearest of several points and honours the radius", () => {
    const out = refineriesAtRisk([refinery("r", 29, -90.5)], impact);
    expect(out[0]?.distanceKm).toBeCloseTo(0, 9);
    expect(refineriesAtRisk([refinery("r", 29.3, -90)], impact, 30)).toEqual([]);
    expect(refineriesAtRisk([refinery("r", 29.3, -90)], [])).toEqual([]);
  });
});

describe("capacityAtRisk", () => {
  const r = (id: string, padd: number, ticker: string | null, bpd: number): Refinery => ({
    id,
    name: id,
    company: ticker ?? id,
    ticker,
    state: "TX",
    padd,
    lat: 0,
    lon: 0,
    capacityBpd: bpd,
  });
  const all = [
    r("a", 3, "VLO", 300_000),
    r("b", 3, "VLO", 100_000),
    r("c", 3, "MPC", 200_000),
    r("d", 3, null, 400_000),
    r("e", 2, "VLO", 500_000), // other PADD, same company
  ];
  it("computes the Gulf share over PADD 3 and each company's share over its total capacity", () => {
    const out = capacityAtRisk(all, [
      { ...(all[0] as Refinery), distanceKm: 10 },
      { ...(all[3] as Refinery), distanceKm: 20 },
      { ...(all[4] as Refinery), distanceKm: 30 }, // PADD 2: counted as a refinery, not in the Gulf share
    ]);
    expect(out.refineryCount).toBe(3);
    expect(out.padd3Bpd).toBe(1_000_000);
    expect(out.atRiskBpd).toBe(700_000);
    expect(out.gulfShare).toBeCloseTo(0.7, 12);
    expect(out.company).toEqual({ VLO: 800_000 / 900_000 });
  });
  it("counts a refinery once even if listed twice and handles nothing at risk", () => {
    const dup = { ...(all[0] as Refinery), distanceKm: 1 };
    expect(capacityAtRisk(all, [dup, dup]).refineryCount).toBe(1);
    expect(capacityAtRisk(all, [])).toEqual({ refineryCount: 0, atRiskBpd: 0, padd3Bpd: 1_000_000, gulfShare: 0, company: {} });
    expect(capacityAtRisk([], []).gulfShare).toBe(0);
  });
});

describe("saffirSimpsonCategory and peakCategory", () => {
  it.each([
    [63, 0],
    [64, 1],
    [82, 1],
    [83, 2],
    [95, 2],
    [96, 3],
    [112, 3],
    [113, 4],
    [136, 4],
    [137, 5],
    [165, 5],
  ])("%i kt is category %i", (kt, cat) => {
    expect(saffirSimpsonCategory(kt)).toBe(cat);
  });
  it("peak category uses the strongest point", () => {
    expect(peakCategory([{ windKt: 70 }, { windKt: 130 }, { windKt: 90 }])).toBe(4);
    expect(peakCategory([])).toBe(0);
  });
});

describe("nearestLandfallRegion, inBox, hubCentroid", () => {
  it("finds the closest landfall anchor", () => {
    expect(nearestLandfallRegion(29.6, -94.4).region).toBe("TX_UPPER");
    expect(nearestLandfallRegion(29.6, -94.4).distanceKm).toBeCloseTo(14.7382, 3);
    expect(nearestLandfallRegion(29.0, -90.4).region).toBe("LA_SOUTHEAST");
    expect(nearestLandfallRegion(29.2, -90.1).distanceKm).toBe(0);
  });
  it("tests box membership inclusively", () => {
    const box = { latMin: 18, latMax: 31, lonMin: -98, lonMax: -80 };
    expect(inBox(25, -90, box)).toBe(true);
    expect(inBox(31, -80, box)).toBe(true);
    expect(inBox(31.1, -90, box)).toBe(false);
    expect(inBox(25, -79, box)).toBe(false);
  });
  it("the hub centroid is the mean of the seven hubs", () => {
    const c = hubCentroid();
    expect(c.lat).toBeCloseTo(29.77714286, 8);
    expect(c.lon).toBeCloseTo(-92.81, 8);
  });
});

describe("findLandfall and isGulfHurricane", () => {
  const track = [
    sp("2021-08-28T12:00:00.000Z", 27.0, -88.5, 120),
    sp("2021-08-29T16:00:00.000Z", 29.0, -90.0, 130),
    sp("2021-08-29T16:55:00.000Z", 29.1, -90.2, 130, { recordId: "L" }),
    sp("2021-08-30T00:00:00.000Z", 30.5, -90.9, 90),
  ];
  it("takes the first L record inside the Gulf coast box", () => {
    const lf = findLandfall(track);
    expect(lf?.method).toBe("hurdat2_record");
    expect(lf?.point.validAt).toBe("2021-08-29T16:55:00.000Z");
  });
  it("ignores an L record outside the box and an L record on a forecast point", () => {
    const florida = [sp("2021-08-29T00:00:00.000Z", 27, -80, 90, { recordId: "L" })];
    expect(findLandfall(florida)?.method).toBe("closest_approach");
    const forecastL = [sp("2021-08-29T00:00:00.000Z", 29.1, -90.2, 90, { recordId: "L", kind: "forecast" })];
    expect(findLandfall(forecastL)).toBeNull();
  });
  it("falls back to the point closest to the hub centroid when there is no L record", () => {
    const noRecord = track.map((p) => ({ ...p, recordId: null }));
    const lf = findLandfall(noRecord);
    expect(lf?.method).toBe("closest_approach");
    expect(lf?.point.validAt).toBe("2021-08-30T00:00:00.000Z"); // (30.5, -90.9) is nearest (29.78, -92.81)
  });
  it("is null for an empty track", () => {
    expect(findLandfall([])).toBeNull();
  });
  it("a Gulf hurricane has a point of at least 64 kt inside the Gulf box", () => {
    expect(isGulfHurricane(track)).toBe(true);
    expect(isGulfHurricane([sp("2021-08-28T12:00:00.000Z", 27, -88.5, 60)])).toBe(false); // too weak
    expect(isGulfHurricane([sp("2021-08-28T12:00:00.000Z", 27, -70, 120)])).toBe(false); // outside the box
    expect(isGulfHurricane([sp("2021-08-28T12:00:00.000Z", 27, -88.5, 120, { kind: "forecast" })])).toBe(false);
  });
});

describe("maxWindBetween and hurricaneShareInBox", () => {
  const pts = [
    { validAt: "2021-08-28T00:00:00.000Z", windKt: 100 },
    { validAt: "2021-08-28T12:00:00.000Z", windKt: 120 },
    { validAt: "2021-08-29T00:00:00.000Z", windKt: 140 },
  ];
  it("takes the maximum inside an inclusive window", () => {
    expect(maxWindBetween(pts, "2021-08-28T00:00:00.000Z", "2021-08-28T12:00:00.000Z")).toBe(120);
    expect(maxWindBetween(pts, "2021-08-28T06:00:00.000Z", "2021-08-29T00:00:00.000Z")).toBe(140);
    expect(maxWindBetween(pts, "2021-09-01T00:00:00.000Z", "2021-09-02T00:00:00.000Z")).toBeNull();
  });
  it("shares hurricane-force points inside the box", () => {
    const box = { latMin: 26, latMax: 29.5, lonMin: -95, lonMax: -88 };
    const track = [
      tp("a", 27, -90, 100), // inside, strong
      tp("b", 28, -92, 70), // inside, strong
      tp("c", 31, -90, 90), // outside, strong
      tp("d", 27, -90, 50), // inside but too weak: not counted
      tp("e", 32, -85, 120), // outside, strong
    ];
    expect(hurricaneShareInBox(track, box)).toBe(0.5);
    expect(hurricaneShareInBox([tp("a", 27, -90, 50)], box)).toBeNull();
  });
});
