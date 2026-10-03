import { barAvailableAt } from "@repo/contracts";

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

const DAY_MS = 86_400_000;

function validPrice(v: number): boolean {
  return Number.isFinite(v) && v > 0;
}

/** Log returns `ln(v[i] / v[i-1])`; one element shorter than the input. Throws on a non-positive value. */
export function logReturns(values: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i] as number;
    if (!validPrice(v)) throw new RangeError(`log return needs positive finite values, got ${v} at index ${i}`);
    if (i > 0) out.push(Math.log(v / (values[i - 1] as number)));
  }
  return out;
}

/** Inner join on dates: keeps only dates present in every series, oldest first. SPEC gotcha 14. */
export function alignSeries(series: Readonly<Record<string, readonly DatedValue[]>>): AlignedSeries {
  const names = Object.keys(series);
  const maps = names.map((n) => new Map((series[n] as readonly DatedValue[]).map((o) => [o.date, o.value] as const)));
  const first = maps[0];
  if (!first) return { dates: [], values: {} };
  const dates = [...first.keys()].filter((d) => maps.every((m) => m.has(d))).sort();
  const values: Record<string, number[]> = {};
  names.forEach((name, k) => {
    const m = maps[k] as Map<string, number>;
    values[name] = dates.map((d) => m.get(d) as number);
  });
  return { dates, values };
}

/**
 * Aligns the closes on common dates, then returns daily log returns dated by the later day. A day whose return
 * is undefined for any symbol (a price of zero or below, such as WTI on 2020-04-20) is dropped for every symbol,
 * so the columns stay aligned. `lookback` keeps only the most recent `lookback` returns.
 */
export function alignedLogReturns(
  closes: Readonly<Record<string, readonly DatedValue[]>>,
  lookback?: number,
): AlignedSeries {
  const aligned = alignSeries(closes);
  const names = Object.keys(aligned.values);
  const dates: string[] = [];
  const values: Record<string, number[]> = Object.fromEntries(names.map((n) => [n, [] as number[]]));
  for (let i = 1; i < aligned.dates.length; i++) {
    const ok = names.every(
      (n) => validPrice((aligned.values[n] as number[])[i] as number) && validPrice((aligned.values[n] as number[])[i - 1] as number),
    );
    if (!ok) continue;
    dates.push(aligned.dates[i] as string);
    for (const n of names) {
      const col = aligned.values[n] as number[];
      (values[n] as number[]).push(Math.log((col[i] as number) / (col[i - 1] as number)));
    }
  }
  if (lookback === undefined || dates.length <= lookback) return { dates, values };
  const start = dates.length - lookback;
  return {
    dates: dates.slice(start),
    values: Object.fromEntries(names.map((n) => [n, (values[n] as number[]).slice(start)])),
  };
}

/** Overlapping sums over `window` consecutive values (5-day risk from daily log returns). */
export function rollingSums(values: readonly number[], window: number): number[] {
  if (!Number.isInteger(window) || window < 1) throw new RangeError(`window must be a positive integer, got ${window}`);
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i] as number;
    if (i >= window) sum -= values[i - window] as number;
    if (i >= window - 1) out.push(sum);
  }
  return out;
}

/** `e^r - 1`: the UI shows simple returns, quant works in log returns (SPEC gotcha 15). */
export function simpleReturn(logReturn: number): number {
  return Math.expm1(logReturn);
}

/** Index of the last element dated on or before `date`, or -1. Input sorted by date ascending. */
export function lastIndexOnOrBefore(series: readonly { date: string }[], date: string): number {
  let lo = 0;
  let hi = series.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((series[mid] as { date: string }).date <= date) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** Bars readable at `asOf`: `barAvailableAt(date) <= asOf` (SPEC 5.1). */
export function visibleBars<T extends { date: string }>(bars: readonly T[], asOf: string): T[] {
  const limit = Date.parse(asOf);
  return bars.filter((b) => barAvailableAt(b.date).getTime() <= limit);
}

/** A last observation older than this many calendar days before `fromDate` is too stale to start a return. */
const MAX_GAP_DAYS = 5;

/**
 * Log return from the last observation on or before `fromDate` to the observation `horizon` trading days
 * later on the series' own calendar. Null when either end is missing, not positive, or the start is more than
 * five calendar days before `fromDate`.
 */
export function forwardLogReturn(series: readonly DatedValue[], fromDate: string, horizon: number): number | null {
  const i = lastIndexOnOrBefore(series, fromDate);
  if (i < 0) return null;
  const start = series[i] as DatedValue;
  if ((Date.parse(fromDate) - Date.parse(start.date)) / DAY_MS > MAX_GAP_DAYS) return null;
  const end = series[i + horizon];
  if (!end || !validPrice(start.value) || !validPrice(end.value)) return null;
  return Math.log(end.value / start.value);
}

/** Date `n` observations after the last one on or before `fromDate`, or null past the end of the data. */
export function tradingDateAfter(dates: readonly string[], fromDate: string, n: number): string | null {
  const i = lastIndexOnOrBefore(dates.map((date) => ({ date })), fromDate);
  if (i < 0) return null;
  return dates[i + n] ?? null;
}
