import type { BacktestRun } from "./backtest";

/** The parts of a backtest that are recorded (a stored row, or a fresh run). */
export type BacktestSnapshot = Pick<BacktestRun, "config" | "metrics" | "predictions" | "caveats">;

export interface BacktestDiff {
  same: boolean;
  /** What differs, event set first (it is the usual cause), at most `max` lines. */
  differences: string[];
  /** How many further differences were left out. */
  omitted: number;
}

/** What Postgres jsonb does to a value: numbers and nulls survive, `undefined` keys and `-0` do not. */
const normalize = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const eventIds = (s: BacktestSnapshot): Set<string> => new Set(s.predictions.map((p) => p.eventId));

function listDiff(label: string, recorded: Set<string>, fresh: Set<string>): string[] {
  const added = [...fresh].filter((id) => !recorded.has(id)).sort();
  const removed = [...recorded].filter((id) => !fresh.has(id)).sort();
  const out: string[] = [];
  if (added.length > 0) out.push(`${label}: ${added.length} not in the recorded run (${added.slice(0, 5).join(", ")}${added.length > 5 ? ", ..." : ""})`);
  if (removed.length > 0) out.push(`${label}: ${removed.length} in the recorded run but not now (${removed.slice(0, 5).join(", ")}${removed.length > 5 ? ", ..." : ""})`);
  return out;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Compares a fresh backtest with a recorded one exactly (Gate C3: re-running reproduces the recorded numbers).
 * Both sides are normalised the way jsonb stores them first. Config, caveats, the event set, every metric and every
 * prediction are checked. No tolerance: the run is deterministic, so any difference is a real difference.
 */
export function diffBacktests(fresh: BacktestSnapshot, recorded: BacktestSnapshot, max = 10): BacktestDiff {
  const f = normalize(fresh);
  const r = normalize(recorded);
  const all: string[] = [];

  all.push(...listDiff("events", eventIds(r), eventIds(f)));

  for (const key of ["bandwidth", "typeWeight", "targets"] as const) {
    if (!same(f.config[key], r.config[key])) {
      all.push(`config.${key}: recorded ${JSON.stringify(r.config[key])}, fresh ${JSON.stringify(f.config[key])}`);
    }
  }
  if (!same(f.caveats, r.caveats)) all.push("caveats differ");

  for (const key of [...new Set([...Object.keys(r.metrics), ...Object.keys(f.metrics)])].sort()) {
    const rm = r.metrics[key];
    const fm = f.metrics[key];
    if (!rm || !fm) {
      all.push(`metrics.${key}: ${rm ? "missing in the fresh run" : "missing in the recorded run"}`);
      continue;
    }
    for (const model of [...new Set([...Object.keys(rm), ...Object.keys(fm)])].sort()) {
      const a = (rm as Record<string, Record<string, unknown> | undefined>)[model];
      const b = (fm as Record<string, Record<string, unknown> | undefined>)[model];
      if (!a || !b) {
        all.push(`metrics.${key}.${model}: ${a ? "missing in the fresh run" : "missing in the recorded run"}`);
        continue;
      }
      for (const field of Object.keys({ ...a, ...b }).sort()) {
        if (a[field] !== b[field]) all.push(`metrics.${key}.${model}.${field}: recorded ${a[field]}, fresh ${b[field]}`);
      }
    }
  }

  if (r.predictions.length !== f.predictions.length) {
    all.push(`predictions: recorded ${r.predictions.length}, fresh ${f.predictions.length}`);
  }
  const n = Math.min(r.predictions.length, f.predictions.length);
  let differing = 0;
  let first = -1;
  for (let i = 0; i < n; i++) {
    if (!same(r.predictions[i], f.predictions[i])) {
      differing++;
      if (first === -1) first = i;
    }
  }
  if (differing > 0) {
    const a = r.predictions[first];
    const b = f.predictions[first];
    all.push(`predictions: ${differing} of ${n} differ, the first at #${first}: recorded ${JSON.stringify(a)}, fresh ${JSON.stringify(b)}`);
  }

  return { same: all.length === 0, differences: all.slice(0, max), omitted: Math.max(0, all.length - max) };
}
