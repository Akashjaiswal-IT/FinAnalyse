import { notImplemented } from "./not-implemented";

export interface OlsResult {
  alpha: number;
  beta: number;
  r2: number;
  n: number;
}

/** One point of a GDELT timeline (`timelinevol` or `timelinetone`). `at` is an ISO date or datetime. */
export interface TimelinePoint {
  at: string;
  value: number;
}

export const mean: (xs: readonly number[]) => number = notImplemented("mean");

/** Standard deviation. `ddof` 1 (sample, default) or 0 (population). */
export const std: (xs: readonly number[], ddof?: 0 | 1) => number = notImplemented("std");

export const covariance: (x: readonly number[], y: readonly number[], ddof?: 0 | 1) => number =
  notImplemented("covariance");

/** Pearson correlation; null for fewer than 2 points or a constant series. */
export const correlation: (x: readonly number[], y: readonly number[]) => number | null = notImplemented("correlation");

/** Correlation matrix in the order of `symbols`; a pair with no defined correlation is 0, the diagonal 1. */
export const correlationMatrix: (
  columns: Readonly<Record<string, readonly number[]>>,
  symbols: readonly string[],
) => number[][] = notImplemented("correlationMatrix");

/** Simple OLS of `y` on `x` with intercept. Null for fewer than 3 points or a constant `x`. */
export const ols: (y: readonly number[], x: readonly number[]) => OlsResult | null = notImplemented("ols");

/** Ranks from 1, ties get the average rank. */
export const ranks: (xs: readonly number[]) => number[] = notImplemented("ranks");

/** Spearman rank correlation; null for fewer than 3 points or a constant series. */
export const spearman: (x: readonly number[], y: readonly number[]) => number | null = notImplemented("spearman");

export const weightedMean: (values: readonly number[], weights: readonly number[]) => number =
  notImplemented("weightedMean");

/** Weighted population standard deviation: `sqrt(sum w (x - mu)^2 / sum w)`. */
export const weightedStd: (values: readonly number[], weights: readonly number[]) => number =
  notImplemented("weightedStd");

/** `(sum w)^2 / sum w^2` (SPEC 5.9). */
export const effectiveSampleSize: (weights: readonly number[]) => number = notImplemented("effectiveSampleSize");

/** `(value - mean(baseline)) / std(baseline)`; null when the baseline has fewer than 2 points or no spread. */
export const zScore: (value: number, baseline: readonly number[]) => number | null = notImplemented("zScore");

/**
 * z-score of the last value of `series` against the `lookback` values before it (exclusive of itself).
 * Used for `vixZ` (SPEC 5.9) and the macro VIX z-score. Null when fewer than `minPoints` values precede it.
 */
export const trailingZ: (series: readonly number[], lookback: number, minPoints?: number) => number | null =
  notImplemented("trailingZ");

/**
 * z-score of the mean of the timeline points in `[windowStart, windowEnd]` against the mean and std of the
 * points in the `baselineDays` before `windowStart` (SPEC 5.9 `volZ` and `toneZ`). Null when the window is
 * empty, the baseline has fewer than `minBaselinePoints` points, or the baseline has no spread.
 */
export const windowZ: (
  timeline: readonly TimelinePoint[],
  windowStart: string,
  windowEnd: string,
  baselineDays: number,
  minBaselinePoints?: number,
) => number | null = notImplemented("windowZ");
