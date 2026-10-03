import { notImplemented } from "./not-implemented";

/** One observation of a daily series. `date` is YYYY-MM-DD in the series' own calendar. */
export interface DatedValue {
  date: string;
  value: number;
}

/** Series aligned on common dates (inner join). `values[symbol][i]` belongs to `dates[i]`. */
export interface AlignedSeries {
  dates: string[];
  values: Record<string, number[]>;
}

/** Log returns `ln(v[i] / v[i-1])`; one element shorter than the input. */
export const logReturns: (values: readonly number[]) => number[] = notImplemented("logReturns");

/** Inner join on dates: keeps only dates present in every series, oldest first. SPEC gotcha 14. */
export const alignSeries: (series: Readonly<Record<string, readonly DatedValue[]>>) => AlignedSeries =
  notImplemented("alignSeries");

/**
 * Aligns the closes on common dates, then returns daily log returns dated by the later day.
 * `lookback` keeps only the most recent `lookback` returns.
 */
export const alignedLogReturns: (
  closes: Readonly<Record<string, readonly DatedValue[]>>,
  lookback?: number,
) => AlignedSeries = notImplemented("alignedLogReturns");

/** Overlapping sums over `window` consecutive values (5-day risk from daily log returns). */
export const rollingSums: (values: readonly number[], window: number) => number[] = notImplemented("rollingSums");

/** `e^r - 1`: the UI shows simple returns, quant works in log returns (SPEC gotcha 15). */
export const simpleReturn: (logReturn: number) => number = notImplemented("simpleReturn");

/** Index of the last element dated on or before `date`, or -1. Input sorted by date ascending. */
export const lastIndexOnOrBefore: (series: readonly { date: string }[], date: string) => number =
  notImplemented("lastIndexOnOrBefore");

/** Bars readable at `asOf`: `barAvailableAt(date) <= asOf` (SPEC 5.1). */
export const visibleBars: <T extends { date: string }>(bars: readonly T[], asOf: string) => T[] =
  notImplemented("visibleBars");

/**
 * Log return from the last observation on or before `fromDate` to the observation `horizon` trading days
 * later on the series' own calendar. Null when either end is missing.
 */
export const forwardLogReturn: (series: readonly DatedValue[], fromDate: string, horizon: number) => number | null =
  notImplemented("forwardLogReturn");

/** Date `n` observations after the last one on or before `fromDate`, or null past the end of the data. */
export const tradingDateAfter: (dates: readonly string[], fromDate: string, n: number) => string | null =
  notImplemented("tradingDateAfter");
