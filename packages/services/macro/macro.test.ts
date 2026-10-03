import { describe, expect, it } from "vitest";
import { alignReturns } from "../market";
import { inventoryVsFiveYear, vixReading, withChange } from "./index";

describe("inventoryVsFiveYear", () => {
  const year = (y: number, value: number) => ({ date: `${y}-08-20`, value });

  it("compares the latest week with the same week of the previous 5 years", () => {
    const history = [year(2016, 100), year(2017, 100), year(2018, 110), year(2019, 90), year(2020, 100), year(2021, 95)];
    const inv = inventoryVsFiveYear(history);
    expect(inv?.fiveYearAvg).toBe(100);
    expect(inv?.deviation).toBeCloseTo(-0.05, 12);
    expect(inv?.flag).toBe("tight");
  });

  it("accepts a same-week value within 3 days and is null when a year is missing", () => {
    const near = [
      { date: "2016-08-22", value: 100 },
      year(2017, 100),
      year(2018, 100),
      year(2019, 100),
      year(2020, 100),
      year(2021, 104),
    ];
    expect(inventoryVsFiveYear(near)?.flag).toBe("loose");
    expect(inventoryVsFiveYear(near.slice(1))).toBeNull();
  });
});

describe("vixReading and withChange", () => {
  it("flags VIX levels and leaves z null without a full year", () => {
    expect(vixReading([{ date: "2022-02-24", value: 30.32 }])).toEqual({ value: 30.32, z: null, flag: "stressed" });
    expect(vixReading([{ date: "2022-02-24", value: 20 }]).flag).toBe("elevated");
    expect(vixReading([{ date: "2022-02-24", value: 12 }]).flag).toBe("calm");
  });

  it("computes the 20-observation change as points or a ratio", () => {
    const history = Array.from({ length: 21 }, (_, i) => ({ date: `d${i}`, value: 100 + i }));
    expect(withChange(history, "points", "X")).toEqual({ value: 120, change20d: 20 });
    expect(withChange(history, "ratio", "X").change20d).toBeCloseTo(0.2, 12);
    expect(() => withChange(history.slice(1), "points", "X")).toThrow();
  });
});

describe("alignReturns", () => {
  it("inner-joins dates and returns log returns", () => {
    const closes = new Map([
      ["A", new Map([["d1", 100], ["d2", 110], ["d3", 121]])],
      ["B", new Map([["d1", 50], ["d3", 55]])],
    ]);
    const m = alignReturns(["A", "B"], closes, 5);
    expect(m.dates).toEqual(["d3"]);
    expect(m.returns[0]?.[0]).toBeCloseTo(Math.log(1.21), 12);
    expect(m.returns[0]?.[1]).toBeCloseTo(Math.log(1.1), 12);
  });

  it("drops a date with a non-positive close, so the next return spans the gap", () => {
    const closes = new Map([["WTI", new Map([["2020-04-17", 18.31], ["2020-04-20", -36.98], ["2020-04-21", 8.91]])]]);
    const m = alignReturns(["WTI"], closes, 5);
    expect(m.dates).toEqual(["2020-04-21"]);
    expect(m.returns[0]?.[0]).toBeCloseTo(Math.log(8.91 / 18.31), 12);
  });
});
