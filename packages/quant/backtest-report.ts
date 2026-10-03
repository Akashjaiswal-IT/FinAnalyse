import { MIN_TYPE_EVENTS } from "@repo/contracts";
import type { BacktestMetrics, ModelKey } from "@repo/contracts";
import { MODEL_KEYS, type BacktestRun } from "./backtest";

/** Where and when a report was produced; `docs/RESULTS.md` states all three (SPEC 9.5). */
export interface BacktestReportMeta {
  generatedAt: string;
  machine: string;
  commit: string;
}

const NA = "n/a";
const MODEL_NAMES: Readonly<Record<ModelKey, string>> = {
  N: "unconditional mean of all events",
  T: "mean of same-type events",
  S: "news features only",
  M: "market-regime (VIX) only",
  W: "weather features only (hurricanes)",
  C: "combined (type, news, regime, weather)",
};

const pct1 = (x: number | null): string => (x === null ? NA : `${(x * 100).toFixed(1)}%`);
const pct2 = (x: number | null): string => (x === null ? NA : `${(x * 100).toFixed(2)}%`);
const rho = (x: number | null): string => (x === null ? NA : x.toFixed(2));

const TABLE_HEADER = [
  "| Model | n | Directional accuracy | Small moves excluded | MAE | Spearman |",
  "|---|---|---|---|---|---|",
];

function rows(row: Partial<Record<ModelKey, BacktestMetrics>> | undefined): string[] {
  return MODEL_KEYS.flatMap((model) => {
    const m = row?.[model];
    return m
      ? [`| ${model} | ${m.n} | ${pct1(m.directionalAccuracy)} | ${m.excludedSmallMoves} | ${pct2(m.mae)} | ${rho(m.spearman)} |`]
      : [];
  });
}

function eventCounts(run: BacktestRun): { total: number; byType: Map<string, number> } {
  const seen = new Map<string, string>();
  for (const p of run.predictions) seen.set(p.eventId, p.eventType);
  const byType = new Map<string, number>();
  for (const type of seen.values()) byType.set(type, (byType.get(type) ?? 0) + 1);
  return { total: seen.size, byType };
}

/**
 * Pooled, per-target and per-type tables of one run, as Markdown. A type with fewer than `MIN_TYPE_EVENTS`
 * events is listed with its n and `n/a` metrics: no per-type claim (SPEC 9.1).
 */
export function renderBacktestTables(run: BacktestRun): string {
  const { byType } = eventCounts(run);
  const out: string[] = ["### Pooled (all targets)", "", ...TABLE_HEADER, ...rows(run.metrics.pooled), ""];

  out.push("### Per target", "");
  for (const target of run.config.targets) {
    if (!run.metrics[target]) continue;
    out.push(`#### ${target}`, "", ...TABLE_HEADER, ...rows(run.metrics[target]), "");
  }

  out.push("### Per event type", "");
  const types = Object.keys(run.metrics)
    .filter((k) => k.startsWith("type:"))
    .sort();
  for (const key of types) {
    const type = key.slice("type:".length);
    const events = byType.get(type) ?? 0;
    const note = events < MIN_TYPE_EVENTS ? `${events} events, fewer than ${MIN_TYPE_EVENTS}: no per-type claim` : `${events} events`;
    out.push(`#### ${type} (${note})`, "", ...TABLE_HEADER, ...rows(run.metrics[key]), "");
  }
  return out.join("\n");
}

/**
 * The full backtest section of `docs/RESULTS.md`: provenance, the headline run, other bandwidths next to it
 * (never instead of it), and the caveats. Every number comes from the runs passed in.
 */
export function renderBacktestSection(
  headline: BacktestRun,
  alternatives: readonly BacktestRun[],
  meta: BacktestReportMeta,
): string {
  const { total, byType } = eventCounts(headline);
  const typeList = [...byType].sort(([a], [b]) => a.localeCompare(b)).map(([t, n]) => `${t} ${n}`).join(", ");
  const out: string[] = [
    "## Backtest (leave-one-out, SPEC 9.1)",
    "",
    `- Run: ${meta.generatedAt} on ${meta.machine}, commit \`${meta.commit}\`.`,
    `- Events: ${total} (${typeList || "none"}). Targets: ${headline.config.targets.join(", ")}.`,
    `- Reported result: bandwidth h = ${headline.config.bandwidth}, type weight ${headline.config.typeWeight}. Both are fixed and were not tuned on these results.`,
    "- Models:",
    ...MODEL_KEYS.map((m) => `  - ${m}: ${MODEL_NAMES[m]}`),
    "- n counts every (event, target) pair with a prediction and a realized return. Directional accuracy uses the pairs whose realized 5-day move is at least 0.25% in size; the others are counted in \"Small moves excluded\". MAE is in log-return percentage points.",
    "",
    renderBacktestTables(headline),
  ];

  if (alternatives.length > 0) {
    const all = [headline, ...alternatives].sort((a, b) => a.config.bandwidth - b.config.bandwidth);
    out.push(
      "### Bandwidth sensitivity (pooled)",
      "",
      `The reported result is h = ${headline.config.bandwidth}. The other bandwidths are shown next to it, never instead of it.`,
      "",
      "| h | Model | n | Directional accuracy | Small moves excluded | MAE | Spearman |",
      "|---|---|---|---|---|---|---|",
    );
    for (const run of all) {
      const label = run === headline ? `${run.config.bandwidth} (reported)` : `${run.config.bandwidth}`;
      for (const line of rows(run.metrics.pooled)) out.push(line.replace(/^\| /, `| ${label} | `));
    }
    out.push("");
  }

  out.push("### Caveats", "", ...headline.caveats.map((c) => `- ${c}`), "");
  return out.join("\n");
}
