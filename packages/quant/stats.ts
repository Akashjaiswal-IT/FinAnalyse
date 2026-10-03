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

const DAY_MS = 86_400_000;

function isConstant(xs: readonly number[]): boolean {
  return xs.every((v) => v === xs[0]);
}

function requireSameLength(a: readonly unknown[], b: readonly unknown[]): void {
  if (a.length !== b.length) throw new RangeError(`length mismatch: ${a.length} vs ${b.length}`);
}

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) throw new RangeError("mean of an empty array");
  let sum = 0;
  for (const v of xs) sum += v;
  return sum / xs.length;
}

/** Standard deviation. `ddof` 1 (sample, default) or 0 (population). */
export function std(xs: readonly number[], ddof: 0 | 1 = 1): number {
  if (xs.length <= ddof) throw new RangeError(`std needs more than ${ddof} value(s), got ${xs.length}`);
  const m = mean(xs);
  let ss = 0;
  for (const v of xs) ss += (v - m) ** 2;
  return Math.sqrt(ss / (xs.length - ddof));
}

export function covariance(x: readonly number[], y: readonly number[], ddof: 0 | 1 = 1): number {
  requireSameLength(x, y);
  if (x.length <= ddof) throw new RangeError(`covariance needs more than ${ddof} value(s), got ${x.length}`);
  const mx = mean(x);
  const my = mean(y);
  let s = 0;
  for (let i = 0; i < x.length; i++) s += ((x[i] as number) - mx) * ((y[i] as number) - my);
  return s / (x.length - ddof);
}

/** Pearson correlation; null for fewer than 2 points or a constant series. */
export function correlation(x: readonly number[], y: readonly number[]): number | null {
  requireSameLength(x, y);
  if (x.length < 2 || isConstant(x) || isConstant(y)) return null;
  const c = covariance(x, y) / (std(x) * std(y));
  return Math.max(-1, Math.min(1, c));
}

/** Correlation matrix in the order of `symbols`; a pair with no defined correlation is 0, the diagonal 1. */
export function correlationMatrix(
  columns: Readonly<Record<string, readonly number[]>>,
  symbols: readonly string[],
): number[][] {
  return symbols.map((a, i) =>
    symbols.map((b, j) => {
      if (i === j) return 1;
      const ca = columns[a];
      const cb = columns[b];
      if (!ca || !cb) throw new RangeError(`no returns for ${!ca ? a : b}`);
      return correlation(ca, cb) ?? 0;
    }),
  );
}

/** Simple OLS of `y` on `x` with intercept. Null for fewer than 3 points or a constant `x`. */
export function ols(y: readonly number[], x: readonly number[]): OlsResult | null {
  requireSameLength(x, y);
  const n = x.length;
  if (n < 3 || isConstant(x)) return null;
  const mx = mean(x);
  const my = mean(y);
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = (x[i] as number) - mx;
    const dy = (y[i] as number) - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const beta = sxy / sxx;
  const r2 = syy === 0 ? 0 : Math.min(1, (sxy * sxy) / (sxx * syy));
  return { alpha: my - beta * mx, beta, r2, n };
}

/** Ranks from 1, ties get the average rank. */
export function ranks(xs: readonly number[]): number[] {
  const order = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v || a.i - b.i);
  const out = new Array<number>(xs.length);
  let k = 0;
  while (k < order.length) {
    let j = k;
    while (j + 1 < order.length && (order[j + 1] as { v: number }).v === (order[k] as { v: number }).v) j++;
    const avg = (k + j) / 2 + 1;
    for (let m = k; m <= j; m++) out[(order[m] as { i: number }).i] = avg;
    k = j + 1;
  }
  return out;
}

/** Spearman rank correlation; null for fewer than 3 points or a constant series. */
export function spearman(x: readonly number[], y: readonly number[]): number | null {
  requireSameLength(x, y);
  if (x.length < 3) return null;
  return correlation(ranks(x), ranks(y));
}

function sumWeights(weights: readonly number[]): number {
  let s = 0;
  for (const w of weights) s += w;
  if (!(s > 0)) throw new RangeError("weights must sum to a positive number");
  return s;
}

export function weightedMean(values: readonly number[], weights: readonly number[]): number {
  requireSameLength(values, weights);
  const total = sumWeights(weights);
  let s = 0;
  for (let i = 0; i < values.length; i++) s += (values[i] as number) * (weights[i] as number);
  return s / total;
}

/** Weighted population standard deviation: `sqrt(sum w (x - mu)^2 / sum w)`. */
export function weightedStd(values: readonly number[], weights: readonly number[]): number {
  const mu = weightedMean(values, weights);
  const total = sumWeights(weights);
  let s = 0;
  for (let i = 0; i < values.length; i++) s += (weights[i] as number) * ((values[i] as number) - mu) ** 2;
  return Math.sqrt(s / total);
}

/** `(sum w)^2 / sum w^2` (SPEC 5.9). */
export function effectiveSampleSize(weights: readonly number[]): number {
  let s = 0;
  let s2 = 0;
  for (const w of weights) {
    s += w;
    s2 += w * w;
  }
  return s2 === 0 ? 0 : (s * s) / s2;
}

/** `(value - mean(baseline)) / std(baseline)`; null when the baseline has fewer than 2 points or no spread. */
export function zScore(value: number, baseline: readonly number[]): number | null {
  if (baseline.length < 2 || isConstant(baseline)) return null;
  return (value - mean(baseline)) / std(baseline);
}

/**
 * z-score of the last value of `series` against the `lookback` values before it (exclusive of itself).
 * Used for `vixZ` (SPEC 5.9) and the macro VIX z-score. Null when fewer than `minPoints` values precede it
 * (default `lookback`: a shorter history is not a "252-day" z-score).
 */
export function trailingZ(series: readonly number[], lookback: number, minPoints: number = lookback): number | null {
  if (series.length < 2) return null;
  const last = series[series.length - 1] as number;
  const baseline = series.slice(Math.max(0, series.length - 1 - lookback), series.length - 1);
  if (baseline.length < minPoints) return null;
  return zScore(last, baseline);
}

/**
 * z-score of the mean of the timeline points in `[windowStart, windowEnd]` against the mean and std of the
 * points in the `baselineDays` before `windowStart` (SPEC 5.9 `volZ` and `toneZ`). Null when the window is
 * empty, the baseline has fewer than `minBaselinePoints` points, or the baseline has no spread.
 */
export function windowZ(
  timeline: readonly TimelinePoint[],
  windowStart: string,
  windowEnd: string,
  baselineDays: number,
  minBaselinePoints = 7,
): number | null {
  const start = Date.parse(windowStart);
  const end = Date.parse(windowEnd);
  const baseStart = start - baselineDays * DAY_MS;
  const inWindow: number[] = [];
  const baseline: number[] = [];
  for (const p of timeline) {
    const t = Date.parse(p.at);
    if (t >= start && t <= end) inWindow.push(p.value);
    else if (t >= baseStart && t < start) baseline.push(p.value);
  }
  if (inWindow.length === 0 || baseline.length < minBaselinePoints) return null;
  return zScore(mean(inWindow), baseline);
}
