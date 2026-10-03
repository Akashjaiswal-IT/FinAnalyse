import type { Refinery, StormPoint } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import {
  buildCuratedEvent,
  buildHurricaneEvent,
  describeEvent,
  hurricaneGdeltQuery,
  type EventBuildBase,
} from "./event-builder";
import type { DatedValue } from "./series";
import type { TimelinePoint } from "./stats";

// Reference values come from independent Python calculations (weekday calendar, statistics.stdev, math.log).

/** Weekdays from 2020-06-01 to 2021-12-31: 415 trading days with no holidays. */
const DATES: string[] = (() => {
  const out: string[] = [];
  for (let t = Date.parse("2020-06-01"); t <= Date.parse("2021-12-31"); t += 86_400_000) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
})();
const IDX = new Map(DATES.map((d, i) => [d, i] as const));

const spy: DatedValue[] = DATES.map((date, i) => ({ date, value: 100 + i }));
const wti: DatedValue[] = DATES.filter((d) => d !== "2021-08-26").map((date) => ({ date, value: 50 + 2 * (IDX.get(date) as number) }));
const vixWith = (t0: string): DatedValue[] =>
  DATES.map((date, i) => ({ date, value: date === t0 ? 25 : i % 2 === 0 ? 15 : 17 }));

const daily = (from: string, to: string, value: (d: string) => number): TimelinePoint[] => {
  const out: TimelinePoint[] = [];
  for (let t = Date.parse(from); t <= Date.parse(to); t += 86_400_000) {
    const at = new Date(t).toISOString();
    out.push({ at, value: value(at.slice(0, 10)) });
  }
  return out;
};

describe("buildCuratedEvent", () => {
  // 28 baseline days (Jul 28 .. Aug 24) alternating, one point inside the window, and decoys outside both ranges.
  const volTimeline: TimelinePoint[] = [
    { at: "2021-07-20T00:00:00.000Z", value: 50 }, // older than the baseline
    ...daily("2021-07-28", "2021-08-24", () => 0).map((p, i) => ({ ...p, value: i % 2 === 0 ? 1 : 2 })),
    { at: "2021-08-25T00:00:00.000Z", value: 4 },
    { at: "2021-08-26T00:00:00.000Z", value: 99 }, // after the window
  ];
  const toneTimeline: TimelinePoint[] = [
    ...daily("2021-07-28", "2021-08-24", () => 0).map((p, i) => ({ ...p, value: i % 2 === 0 ? -1 : -3 })),
    { at: "2021-08-25T00:00:00.000Z", value: -6 },
  ];
  const base: EventBuildBase = { closes: { SPY: spy, WTI: wti }, vix: vixWith("2021-08-24"), volTimeline, toneTimeline };

  const built = buildCuratedEvent({ ...base, firstReportAt: "2021-08-24T14:30:00.000Z" });

  it("sets the feature window end and t0 = the last close readable then", () => {
    expect(built.featureAt).toBe("2021-08-25T14:30:00.000Z");
    // Tue 24 Aug closes at 21:00 UTC, before the feature window ends; Wed 25 Aug closes after it.
    expect(built.t0).toBe("2021-08-24");
  });
  it("computes volZ and toneZ over the window against the 28 days before it", () => {
    expect(built.features.volZ).toBeCloseTo(4.90990253, 8);
    expect(built.features.toneZ).toBeCloseTo(-3.92792202, 8);
  });
  it("computes vixZ at t0 against the 252 closes before it and leaves weather features empty", () => {
    expect(built.features.vixZ).toBeCloseTo(8.98212511, 8);
    expect(built.features.windKt).toBeNull();
    expect(built.features.capAtRisk).toBeNull();
    expect(built.features.offshoreExposure).toBeNull();
  });
  it("measures reactions on each series' own calendar", () => {
    const k = IDX.get("2021-08-24") as number;
    expect(built.reactions.SPY?.d1).toBeCloseTo(Math.log((100 + k + 1) / (100 + k)), 12);
    expect(built.reactions.SPY?.d5).toBeCloseTo(0.011806512586989, 12);
    expect(built.reactions.SPY?.d20).toBeCloseTo(0.046412041764464514, 12);
    // WTI has no 26 Aug bar, so its 5th observation after t0 is 1 Sep, one day later than SPY's.
    expect(built.reactions.WTI?.d1).toBeCloseTo(0.0028860048891348514, 12);
    expect(built.reactions.WTI?.d5).toBeCloseTo(0.01719240054037277, 12);
  });
  it("realized_until is 20 trading days after t0 on the reference calendar", () => {
    expect(built.realizedUntil).toBe("2021-09-21");
  });
  it("t0 moves later, never earlier, when firstReportAt is a date-only source (23:59 UTC)", () => {
    const dateOnly = buildCuratedEvent({ ...base, firstReportAt: "2021-08-24T23:59:00.000Z" });
    expect(dateOnly.t0).toBe("2021-08-25"); // featureAt 25 Aug 23:59: the 25 Aug close (21:00) is readable by then
    const sameDay = buildCuratedEvent({ ...base, firstReportAt: "2021-08-24T20:59:59.000Z" });
    expect(sameDay.t0).toBe("2021-08-24"); // featureAt 25 Aug 20:59:59 -> 24 Aug close
    const earlier = buildCuratedEvent({ ...base, firstReportAt: "2021-08-23T20:00:00.000Z" });
    expect(earlier.t0).toBe("2021-08-23"); // featureAt 24 Aug 20:00 is before 24 Aug 21:00
  });
  it("leaves out returns the data does not reach and reports no realized_until", () => {
    const recent = buildCuratedEvent({
      ...base,
      closes: { SPY: spy.slice(0, (IDX.get("2021-12-28") as number) + 1) }, // one bar after t0: d1 exists, d5 does not
      vix: vixWith("2021-12-27"),
      firstReportAt: "2021-12-27T10:00:00.000Z",
    });
    expect(recent.t0).toBe("2021-12-27");
    expect(recent.reactions.SPY?.d1).not.toBeNull();
    expect(recent.reactions.SPY?.d5).toBeNull();
    expect(recent.reactions.SPY?.d20).toBeNull();
    expect(recent.realizedUntil).toBeNull();
  });
  it("has null news and VIX features when the series cannot support them", () => {
    const bare = buildCuratedEvent({ ...base, volTimeline: [], toneTimeline: [], vix: [], firstReportAt: "2021-08-24T14:30:00.000Z" });
    expect(bare.features).toEqual({ volZ: null, toneZ: null, vixZ: null, windKt: null, capAtRisk: null, offshoreExposure: null });
    const shortVix = buildCuratedEvent({ ...base, vix: vixWith("2021-08-24").slice(0, 100), firstReportAt: "2021-08-24T14:30:00.000Z" });
    expect(shortVix.features.vixZ).toBeNull();
  });
  it("fails loudly when nothing is readable or the reference series is missing", () => {
    expect(() => buildCuratedEvent({ ...base, firstReportAt: "2019-01-01T00:00:00.000Z" })).toThrow(/no close is readable/);
    expect(() => buildCuratedEvent({ ...base, closes: { WTI: wti }, firstReportAt: "2021-08-24T14:30:00.000Z" })).toThrow(
      /reference symbol/,
    );
  });
  it("uses another reference calendar when asked", () => {
    const viaWti = buildCuratedEvent({ ...base, referenceSymbol: "WTI", firstReportAt: "2021-08-25T14:30:00.000Z" });
    // featureAt 26 Aug 14:30; WTI has no 26 Aug bar, so the last readable WTI close is 25 Aug.
    expect(viaWti.t0).toBe("2021-08-25");
  });
});

describe("hurricaneGdeltQuery", () => {
  it("builds the hurricane and tropical storm phrases from the HURDAT2 name", () => {
    expect(hurricaneGdeltQuery("IDA")).toBe('("Hurricane Ida" OR "Tropical Storm Ida")');
    expect(hurricaneGdeltQuery("laura")).toBe('("Hurricane Laura" OR "Tropical Storm Laura")');
  });
});

describe("buildHurricaneEvent", () => {
  const pt = (validAt: string, lat: number, lon: number, windKt: number, recordId: string | null = null): StormPoint => ({
    stormId: "AL992021",
    kind: "observed",
    issuedAt: validAt,
    validAt,
    lat,
    lon,
    windKt,
    pressureMb: null,
    status: null,
    recordId,
  });
  const track: StormPoint[] = [
    pt("2021-08-27T12:00:00.000Z", 24.0, -86.0, 70),
    pt("2021-08-27T18:00:00.000Z", 25.0, -87.0, 80),
    pt("2021-08-28T00:00:00.000Z", 26.0, -88.0, 100),
    pt("2021-08-28T06:00:00.000Z", 27.0, -89.0, 115),
    pt("2021-08-28T12:00:00.000Z", 28.0, -89.5, 125),
    pt("2021-08-28T18:00:00.000Z", 28.8, -90.0, 130),
    pt("2021-08-29T00:00:00.000Z", 29.1, -90.2, 130, "L"),
    pt("2021-08-29T06:00:00.000Z", 30.0, -90.6, 100),
    pt("2021-08-29T12:00:00.000Z", 30.8, -91.0, 60),
  ];
  const ref = (id: string, ticker: string | null, padd: number, lat: number, lon: number, capacityBpd: number): Refinery => ({
    id,
    name: id,
    company: ticker ?? id,
    ticker,
    state: "LA",
    padd,
    lat,
    lon,
    capacityBpd,
  });
  const refineries = [
    ref("r1", "VLO", 3, 29.6, -90.0, 300_000), // 39 km from the track: at risk
    ref("r2", "VLO", 3, 30.0, -93.0, 100_000), // 212 km: not at risk
    ref("r3", "MPC", 3, 29.9, -90.1, 200_000), // 42 km: at risk
    ref("r4", null, 3, 27.8, -97.4, 400_000), // 703 km: not at risk
    ref("r5", "PSX", 2, 29.5, -90.3, 150_000), // 11 km: at risk, but PADD 2
  ];
  // Daily 00:00 UTC points; the two days before the forecast origin spike.
  const spike = (over: Record<string, number>, sign: 1 | -1): TimelinePoint[] =>
    daily("2021-07-01", "2021-08-31", (d) => over[d] ?? sign * (Number(d.slice(8)) % 2 === 0 ? 1 : 2));
  const volTimeline = spike({ "2021-08-26": 6, "2021-08-27": 8 }, 1);
  const toneTimeline = spike({ "2021-08-26": -6, "2021-08-27": -8 }, -1);
  const input = {
    closes: { SPY: spy },
    vix: vixWith("2021-08-27"),
    volTimeline,
    toneTimeline,
    stormId: "AL992021",
    name: "TESTA",
    points: track,
    refineries,
  };
  const built = buildHurricaneEvent(input);

  it("finds the landfall from the HURDAT2 L record and the first tropical-storm point", () => {
    expect(built?.landfallAt).toBe("2021-08-29T00:00:00.000Z");
    expect(built?.landfallMethod).toBe("hurdat2_record");
    expect(built?.region).toBe("LA_SOUTHEAST");
    expect(built?.landfallCategory).toBe(4);
    expect(built?.firstReportAt).toBe("2021-08-27T12:00:00.000Z");
    expect(built?.gdeltQuery).toBe('("Hurricane Testa" OR "Tropical Storm Testa")');
  });
  it("t0 is the last close at least 24 hours before landfall, and featureAt is that close's availability time", () => {
    // Landfall Sun 29 Aug 00:00; 24 h earlier is Sat 28 Aug 00:00; the last close before that is Fri 27 Aug.
    expect(built?.t0).toBe("2021-08-27");
    expect(built?.featureAt).toBe("2021-08-27T21:00:00.000Z");
  });
  it("counts capacity at risk once per refinery: Gulf share over PADD 3, per company over its own total", () => {
    expect(built?.refineriesAtRisk).toBe(3); // r1, r3, r5
    expect(built?.atRiskBpd).toBe(500_000); // r1 + r3 (r5 is PADD 2)
    expect(built?.gulfShare).toBeCloseTo(0.5, 12); // 500k of 1,000,000 PADD 3
    expect(built?.companyCapAtRisk).toEqual({ VLO: 0.75, MPC: 1, PSX: 1 });
    expect(built?.entities).toEqual(["MPC", "PSX", "VLO"]);
  });
  it("computes the weather features from the best track as a perfect forecast", () => {
    expect(built?.features.windKt).toBe(130); // max wind in the 24 h before landfall
    expect(built?.features.capAtRisk).toBeCloseTo(0.5, 12);
    expect(built?.features.offshoreExposure).toBeCloseTo(27 / 48, 12); // 27 of 48 hourly hurricane-force points in the box
  });
  it("computes the news features over the 2 days before the origin against the 28 days before that", () => {
    expect(built?.features.volZ).toBeCloseTo(10.75912595, 8);
    expect(built?.features.toneZ).toBeCloseTo(-10.75912595, 8);
    expect(built?.features.vixZ).toBeCloseTo(8.98212511, 8);
  });
  it("reports reactions and realized_until from t0", () => {
    expect(built?.reactions.SPY?.d5).toBeCloseTo(0.011723463696059, 12);
    expect(built?.realizedUntil).toBe("2021-09-24");
  });
  it("falls back to the closest approach to the hub centroid when no L record is in the Gulf coast box", () => {
    const noRecord = buildHurricaneEvent({ ...input, points: track.map((p) => ({ ...p, recordId: null })) });
    expect(noRecord?.landfallMethod).toBe("closest_approach");
    // Closest to the centroid (29.78, -92.81) is the last point (30.8, -91.0).
    expect(noRecord?.landfallAt).toBe("2021-08-29T12:00:00.000Z");
  });
  it("is null for a storm that is not a Gulf hurricane, has no points, or has no readable close", () => {
    expect(buildHurricaneEvent({ ...input, points: track.map((p) => ({ ...p, windKt: 50 })) })).toBeNull();
    expect(buildHurricaneEvent({ ...input, points: [] })).toBeNull();
    expect(buildHurricaneEvent({ ...input, closes: { SPY: spy.filter((o) => o.date > "2021-09-01") } })).toBeNull();
  });
  it("ignores forecast-kind points in its input", () => {
    const withForecast = buildHurricaneEvent({ ...input, points: [...track, { ...(track[8] as StormPoint), kind: "forecast", lat: 40, lon: -70 }] });
    expect(withForecast).toEqual(built);
  });
  it("a storm that weakens before landfall has category 0 and no capacity at risk", () => {
    const weakening = buildHurricaneEvent({
      ...input,
      points: [
        pt("2021-08-27T12:00:00.000Z", 24.0, -86.0, 100),
        pt("2021-08-27T18:00:00.000Z", 25.0, -87.0, 100),
        pt("2021-08-30T00:00:00.000Z", 29.1, -90.2, 50, "L"),
      ],
    });
    expect(weakening?.landfallCategory).toBe(0);
    expect(weakening?.refineriesAtRisk).toBe(0);
    expect(weakening?.features.capAtRisk).toBe(0);
    expect(weakening?.entities).toEqual([]);
    expect(weakening?.companyCapAtRisk).toEqual({});
    expect(weakening?.features.offshoreExposure).toBeGreaterThan(0); // the hurricane-force part of the path is offshore
  });
  it("offshore exposure is null when the forecast window holds no hurricane-force point", () => {
    const stale = buildHurricaneEvent({
      ...input,
      points: [pt("2021-08-20T00:00:00.000Z", 25.0, -90.0, 100), pt("2021-08-29T00:00:00.000Z", 29.1, -90.2, 40, "L")],
    });
    expect(stale?.features.windKt).toBe(40); // only the landfall point is in the 24 h before landfall
    expect(stale?.features.capAtRisk).toBe(0);
    expect(stale?.features.offshoreExposure).toBeNull();
  });
});

describe("describeEvent", () => {
  const reactions = {
    SPY: { d1: null, d5: Math.log(1.05), d20: null },
    WTI: { d1: null, d5: Math.log(1.083), d20: null },
    GLD: { d1: null, d5: Math.log(0.99), d20: null },
    TLT: { d1: null, d5: null, d20: null },
    XLE: { d1: null, d5: Math.log(1.07), d20: null },
    CRAK: { d1: null, d5: Math.log(0.91), d20: null },
  };
  it("fills the SPEC 10.5 template for a hurricane", () => {
    expect(
      describeEvent({
        name: "Hurricane Test",
        year: 2021,
        type: "disaster",
        subtype: "hurricane",
        firstReportAt: "2021-08-27T12:00:00.000Z",
        entities: ["MPC", "PSX", "VLO"],
        affectedSectors: ["refiner", "energy"],
        reactions,
        hurricane: { landfallCategory: 4, region: "LA_SOUTHEAST", refineriesAtRisk: 3, atRiskBpd: 500_000, gulfShare: 0.5 },
      }),
    ).toBe(
      "Hurricane Test (2021), disaster / hurricane. First reported Aug 27, 2021. Directly involved: MPC, PSX, VLO. " +
        "Sectors: refiner, energy. Five trading days later: S&P 500 +5.0%, WTI +8.3%, gold -1.0%, long Treasuries n/a, CRAK -9.0%. " +
        "Category 4 at landfall in LA_SOUTHEAST. 3 refineries with 500K b/d (50% of Gulf Coast capacity) within 100 km of the hurricane-force track.",
    );
  });
  it("handles an event with no subtype, no listed company, no sectors and no sector ETF data", () => {
    expect(
      describeEvent({
        name: "Test shock",
        year: 2022,
        type: "geopolitical",
        subtype: null,
        firstReportAt: "2022-02-24T03:00:00.000Z",
        entities: [],
        affectedSectors: [],
        reactions: { SPY: { d1: null, d5: Math.log(0.97), d20: null } },
      }),
    ).toBe(
      "Test shock (2022), geopolitical. First reported Feb 24, 2022. Directly involved: no listed company. Sectors: none. " +
        "Five trading days later: S&P 500 -3.0%, WTI n/a, gold n/a, long Treasuries n/a.",
    );
  });
  it("picks the sector ETF with the largest absolute move, ties by symbol", () => {
    const tie = describeEvent({
      name: "N",
      year: 2020,
      type: "macro",
      subtype: null,
      firstReportAt: "2020-03-15T21:00:00.000Z",
      entities: [],
      affectedSectors: [],
      reactions: { KRE: { d1: null, d5: -0.08, d20: null }, XLF: { d1: null, d5: 0.08, d20: null }, XLK: { d1: null, d5: 0.02, d20: null } },
    });
    expect(tie).toMatch(/, KRE -7\.7%\.$/); // equal size -> KRE sorts before XLF; simple return of -0.08
  });
});
