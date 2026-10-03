import { describe, expect, it } from "vitest";
import {
  correlation,
  correlationMatrix,
  covariance,
  effectiveSampleSize,
  mean,
  ols,
  ranks,
  spearman,
  std,
  trailingZ,
  weightedMean,
  weightedStd,
  windowZ,
  zScore,
} from "./stats";

// Reference values come from Python's statistics module and math (independent of this code).

describe("mean, std, covariance", () => {
  const xs = [2, 4, 4, 4, 5, 5, 7, 9];
  it("computes mean and both standard deviations", () => {
    expect(mean(xs)).toBe(5);
    expect(std(xs, 0)).toBe(2);
    expect(std(xs)).toBeCloseTo(2.13808994, 8);
  });
  it("computes sample covariance", () => {
    expect(covariance([1, 2, 3, 4, 5], [2, 4, 5, 4, 5])).toBeCloseTo(1.5, 12);
    expect(covariance([1, 2, 3, 4, 5], [2, 4, 5, 4, 5], 0)).toBeCloseTo(1.2, 12);
  });
  it("rejects empty or too-short input and mismatched lengths", () => {
    expect(() => mean([])).toThrow(RangeError);
    expect(() => std([1])).toThrow(RangeError);
    expect(std([1], 0)).toBe(0);
    expect(() => covariance([1, 2], [1])).toThrow(RangeError);
  });
});

describe("correlation", () => {
  it("matches Pearson r", () => {
    expect(correlation([1, 2, 3, 4, 5], [2, 4, 5, 4, 5])).toBeCloseTo(0.77459667, 8);
    expect(correlation([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1, 12);
  });
  it("is null for a constant series or fewer than two points", () => {
    expect(correlation([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(correlation([1], [2])).toBeNull();
  });
});

describe("correlationMatrix", () => {
  it("has a unit diagonal, is symmetric and uses 0 where undefined", () => {
    const m = correlationMatrix({ A: [1, 2, 3, 4], B: [2, 4, 6, 8.5], C: [5, 5, 5, 5] }, ["A", "B", "C"]);
    expect(m[0]?.[0]).toBe(1);
    expect(m[0]?.[1]).toBeCloseTo(m[1]?.[0] as number, 12);
    expect(m[0]?.[1]).toBeGreaterThan(0.99);
    expect(m[0]?.[2]).toBe(0);
    expect(() => correlationMatrix({ A: [1, 2] }, ["A", "Z"])).toThrow(RangeError);
  });
});

describe("ols", () => {
  it("returns beta, alpha and R² against a hand calculation", () => {
    // python: statistics.linear_regression -> slope 1.99, intercept 0.05; r² = correlation² = 0.99730533
    const fit = ols([2.1, 3.9, 6.2, 7.8, 10.1], [1, 2, 3, 4, 5]);
    expect(fit?.beta).toBeCloseTo(1.99, 10);
    expect(fit?.alpha).toBeCloseTo(0.05, 10);
    expect(fit?.r2).toBeCloseTo(0.99730533, 8);
    expect(fit?.n).toBe(5);
  });
  it("recovers an exact line with R² of 1", () => {
    const fit = ols([3, 5, 7, 9], [1, 2, 3, 4]);
    expect(fit?.beta).toBeCloseTo(2, 12);
    expect(fit?.alpha).toBeCloseTo(1, 12);
    expect(fit?.r2).toBeCloseTo(1, 12);
  });
  it("gives R² of 0 for a constant y and null for a constant x or fewer than 3 points", () => {
    expect(ols([4, 4, 4, 4], [1, 2, 3, 4])?.r2).toBe(0);
    expect(ols([1, 2, 3], [5, 5, 5])).toBeNull();
    expect(ols([1, 2], [1, 2])).toBeNull();
  });
});

describe("ranks and spearman", () => {
  it("averages tied ranks", () => {
    expect(ranks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
    expect(ranks([3, 1, 2])).toEqual([3, 1, 2]);
  });
  it("matches Spearman rho with ties", () => {
    expect(spearman([1, 2, 3, 4, 5], [5, 6, 7, 8, 7])).toBeCloseTo(0.82078268, 8);
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 12);
    expect(spearman([1, 2, 3, 4], [9, 7, 5, 1])).toBeCloseTo(-1, 12);
  });
  it("is null for fewer than 3 points or a constant series", () => {
    expect(spearman([1, 2], [1, 2])).toBeNull();
    expect(spearman([1, 2, 3], [4, 4, 4])).toBeNull();
  });
});

describe("weighted statistics", () => {
  it("computes weighted mean and population std", () => {
    expect(weightedMean([1, 2, 3], [1, 2, 1])).toBe(2);
    expect(weightedStd([1, 2, 3], [1, 2, 1])).toBeCloseTo(0.70710678, 8);
  });
  it("equals the plain population statistics for equal weights", () => {
    expect(weightedMean([2, 4, 4, 4, 5, 5, 7, 9], new Array(8).fill(3))).toBe(5);
    expect(weightedStd([2, 4, 4, 4, 5, 5, 7, 9], new Array(8).fill(3))).toBeCloseTo(2, 12);
  });
  it("rejects weights that do not sum to a positive number", () => {
    expect(() => weightedMean([1, 2], [0, 0])).toThrow(RangeError);
    expect(() => weightedStd([1, 2], [1])).toThrow(RangeError);
  });
  it("effective sample size is (sum w)² / sum w²", () => {
    expect(effectiveSampleSize([1, 1])).toBe(2);
    expect(effectiveSampleSize([1, 0])).toBe(1);
    expect(effectiveSampleSize([1, 2, 1])).toBeCloseTo(8 / 3, 12);
    expect(effectiveSampleSize([])).toBe(0);
    expect(effectiveSampleSize([5, 5, 5, 5])).toBeCloseTo(4, 12);
  });
});

describe("zScore, trailingZ, windowZ", () => {
  it("zScore standardises against the sample std", () => {
    expect(zScore(5, [1, 2, 3, 4, 5])).toBeCloseTo(1.26491106, 8);
    expect(zScore(3, [1, 2, 3, 4, 5])).toBe(0);
  });
  it("zScore is null without a usable baseline", () => {
    expect(zScore(1, [2])).toBeNull();
    expect(zScore(1, [2, 2, 2])).toBeNull();
  });
  it("trailingZ compares the last value with the lookback before it", () => {
    expect(trailingZ([1, 2, 3, 4, 5, 10], 5)).toBeCloseTo(4.42718872, 8);
    expect(trailingZ([9, 9, 9, 1, 2, 3, 4, 5, 10], 5)).toBeCloseTo(4.42718872, 8); // older values ignored
  });
  it("trailingZ is null when the history is shorter than required", () => {
    expect(trailingZ([1, 2, 3, 4, 5, 10], 252)).toBeNull();
    expect(trailingZ([1, 2, 3, 4, 5, 10], 252, 5)).not.toBeNull();
    expect(trailingZ([1], 5)).toBeNull();
  });
  it("windowZ compares the window mean with the baseline before it", () => {
    // baseline: days 1..10 of March (values 1..10), window: 11 and 12 March (values 12 and 14, mean 13).
    const baseline = Array.from({ length: 10 }, (_, i) => ({ at: `2024-03-${String(i + 1).padStart(2, "0")}`, value: i + 1 }));
    const timeline = [...baseline, { at: "2024-03-11", value: 12 }, { at: "2024-03-12", value: 14 }, { at: "2024-03-13", value: 99 }];
    // python: (13 - mean(1..10)) / stdev(1..10) = 2.47716847; the point after the window is ignored.
    expect(windowZ(timeline, "2024-03-11", "2024-03-12", 28)).toBeCloseTo(2.47716847, 8);
  });
  it("windowZ ignores baseline points older than baselineDays and returns null without enough data", () => {
    const timeline = [
      { at: "2024-01-01", value: 1000 },
      ...Array.from({ length: 10 }, (_, i) => ({ at: `2024-03-${String(i + 1).padStart(2, "0")}`, value: i + 1 })),
      { at: "2024-03-11", value: 12 },
      { at: "2024-03-12", value: 14 },
    ];
    expect(windowZ(timeline, "2024-03-11", "2024-03-12", 28)).toBeCloseTo(2.47716847, 8);
    expect(windowZ(timeline, "2024-03-11", "2024-03-12", 28, 11)).toBeNull(); // only 10 baseline points
    expect(windowZ(timeline, "2024-06-01", "2024-06-02", 28)).toBeNull(); // empty window
    expect(windowZ([{ at: "2024-03-11", value: 1 }], "2024-03-11", "2024-03-12", 28)).toBeNull();
  });
});
