import { describe, expect, it } from "vitest";
import {
  alignSeries,
  alignedLogReturns,
  forwardLogReturn,
  lastIndexOnOrBefore,
  logReturns,
  rollingSums,
  simpleReturn,
  tradingDateAfter,
  visibleBars,
  type DatedValue,
} from "./series";

const d = (date: string, value: number): DatedValue => ({ date, value });

describe("logReturns", () => {
  it("matches ln(v[i]/v[i-1])", () => {
    const r = logReturns([100, 110, 99]);
    expect(r).toHaveLength(2);
    expect(r[0]).toBeCloseTo(0.09531018, 8); // python: math.log(110/100)
    expect(r[1]).toBeCloseTo(-0.10536052, 8); // python: math.log(99/110)
  });
  it("is empty for fewer than two values and rejects non-positive values", () => {
    expect(logReturns([100])).toEqual([]);
    expect(() => logReturns([100, 0, 5])).toThrow(RangeError);
    expect(() => logReturns([100, -3])).toThrow(RangeError);
  });
});

describe("alignSeries", () => {
  it("keeps only dates present in every series, oldest first", () => {
    const out = alignSeries({
      A: [d("2024-01-02", 1), d("2024-01-03", 2), d("2024-01-04", 3), d("2024-01-05", 4)],
      B: [d("2024-01-03", 20), d("2024-01-04", 30), d("2024-01-05", 40), d("2024-01-08", 50)],
    });
    expect(out.dates).toEqual(["2024-01-03", "2024-01-04", "2024-01-05"]);
    expect(out.values).toEqual({ A: [2, 3, 4], B: [20, 30, 40] });
  });
  it("returns nothing for no series or no common date", () => {
    expect(alignSeries({})).toEqual({ dates: [], values: {} });
    expect(alignSeries({ A: [d("2024-01-02", 1)], B: [d("2024-01-03", 1)] }).dates).toEqual([]);
  });
});

describe("alignedLogReturns", () => {
  const dates = ["2020-04-17", "2020-04-20", "2020-04-21", "2020-04-22", "2020-04-23"];
  it("dates each return by the later day and keeps columns aligned", () => {
    const out = alignedLogReturns({
      SPY: dates.map((x, i) => d(x, [100, 101, 102, 103, 104][i] as number)),
    });
    expect(out.dates).toEqual(dates.slice(1));
    expect(out.values.SPY?.[0]).toBeCloseTo(Math.log(101 / 100), 12);
  });
  it("drops a day for every symbol when any price is not positive (WTI 2020-04-20)", () => {
    const out = alignedLogReturns({
      SPY: dates.map((x, i) => d(x, [100, 101, 102, 103, 104][i] as number)),
      WTI: dates.map((x, i) => d(x, [18.27, -36.98, 10.01, 13.7, 16.5][i] as number)),
    });
    // returns into 04-20 and 04-21 touch the negative price: only 04-22 and 04-23 survive.
    expect(out.dates).toEqual(["2020-04-22", "2020-04-23"]);
    expect(out.values.WTI?.[0]).toBeCloseTo(Math.log(13.7 / 10.01), 12);
    expect(out.values.SPY?.[1]).toBeCloseTo(Math.log(104 / 103), 12);
  });
  it("keeps only the most recent `lookback` returns", () => {
    const out = alignedLogReturns({ SPY: dates.map((x, i) => d(x, [100, 101, 102, 103, 104][i] as number)) }, 2);
    expect(out.dates).toEqual(["2020-04-22", "2020-04-23"]);
    expect(out.values.SPY).toHaveLength(2);
  });
});

describe("rollingSums", () => {
  it("returns overlapping window sums", () => {
    expect(rollingSums([1, 2, 3, 4, 5], 3)).toEqual([6, 9, 12]);
    expect(rollingSums([1, 2, 3, 4, 5], 1)).toEqual([1, 2, 3, 4, 5]);
    expect(rollingSums([1, 2], 5)).toEqual([]);
  });
  it("rejects a bad window", () => {
    expect(() => rollingSums([1, 2], 0)).toThrow(RangeError);
    expect(() => rollingSums([1, 2], 1.5)).toThrow(RangeError);
  });
});

describe("simpleReturn", () => {
  it("is e^r - 1", () => {
    expect(simpleReturn(Math.log(1.1))).toBeCloseTo(0.1, 12);
    expect(simpleReturn(0)).toBe(0);
  });
});

describe("lastIndexOnOrBefore", () => {
  const s = [d("2024-01-02", 1), d("2024-01-03", 2), d("2024-01-05", 3)];
  it("finds the last observation on or before a date", () => {
    expect(lastIndexOnOrBefore(s, "2024-01-03")).toBe(1);
    expect(lastIndexOnOrBefore(s, "2024-01-04")).toBe(1);
    expect(lastIndexOnOrBefore(s, "2030-01-01")).toBe(2);
    expect(lastIndexOnOrBefore(s, "2024-01-01")).toBe(-1);
    expect(lastIndexOnOrBefore([], "2024-01-01")).toBe(-1);
  });
});

describe("visibleBars", () => {
  const bars = [d("2021-08-26", 1), d("2021-08-27", 2), d("2021-08-30", 3)];
  it("shows a bar from 21:00 UTC on its date (SPEC 5.1)", () => {
    expect(visibleBars(bars, "2021-08-27T21:00:00.000Z").map((b) => b.date)).toEqual(["2021-08-26", "2021-08-27"]);
    expect(visibleBars(bars, "2021-08-27T20:59:59.999Z").map((b) => b.date)).toEqual(["2021-08-26"]);
    expect(visibleBars(bars, "2021-08-25T00:00:00.000Z")).toEqual([]);
  });
});

describe("forwardLogReturn", () => {
  const s = [
    d("2024-03-04", 100),
    d("2024-03-05", 102),
    d("2024-03-06", 101),
    d("2024-03-07", 105),
    d("2024-03-08", 107),
    d("2024-03-11", 110),
    d("2024-03-12", 108),
  ];
  it("counts trading days on the series' own calendar", () => {
    expect(forwardLogReturn(s, "2024-03-04", 1)).toBeCloseTo(Math.log(102 / 100), 12);
    expect(forwardLogReturn(s, "2024-03-04", 5)).toBeCloseTo(Math.log(110 / 100), 12);
  });
  it("starts from the last observation on or before the date", () => {
    expect(forwardLogReturn(s, "2024-03-09", 1)).toBeCloseTo(Math.log(110 / 107), 12); // Saturday: starts at 03-08
  });
  it("is null past the data, before the data, stale, or on a non-positive price", () => {
    expect(forwardLogReturn(s, "2024-03-08", 5)).toBeNull();
    expect(forwardLogReturn(s, "2024-03-01", 1)).toBeNull();
    expect(forwardLogReturn(s, "2024-04-01", 1)).toBeNull(); // last observation is 20 days old
    expect(forwardLogReturn([d("2020-04-17", 18), d("2020-04-20", -37)], "2020-04-17", 1)).toBeNull();
  });
});

describe("tradingDateAfter", () => {
  const dates = ["2024-03-04", "2024-03-05", "2024-03-06", "2024-03-07"];
  it("steps n observations forward from the last date on or before", () => {
    expect(tradingDateAfter(dates, "2024-03-04", 2)).toBe("2024-03-06");
    expect(tradingDateAfter(dates, "2024-03-05", 0)).toBe("2024-03-05");
    expect(tradingDateAfter(dates, "2024-03-04", 9)).toBeNull();
    expect(tradingDateAfter(dates, "2024-01-01", 1)).toBeNull();
  });
});
