// Robustness drills (SPEC 9.4): the Ukraine and Ida preset questions with inputs taken away, one at a time.
// Each drill runs `scripts/run-query.ts` in a child process with its own environment and checks the stored run.
//
//   pnpm drills                  run and print the table
//   pnpm drills --write-results  also update the drills section of docs/RESULTS.md
import { execFileSync, execSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { digitViolations } from "@repo/agents";
import { ENRICH_DAILY_MAX, type Confidence, type RunsGetOutput } from "@repo/contracts";
import { closeRedis, getRedis, quotaKey } from "@repo/services/clients/redis";
import { upsertResultsSection } from "../packages/quant/index";

const RESULTS_PATH = resolve(process.cwd(), "docs/RESULTS.md");
const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
const BOGUS_PINECONE = "drill-unreachable.svc.invalid.pinecone.io";

const QUESTIONS = [
  { id: "ukraine", preset: "geopolitical-russia-ukraine-2022", query: "How will the Russian invasion of Ukraine affect our portfolio?" },
  {
    id: "ida",
    preset: "disaster-hurricane-ida-2021",
    query: "How will the forecasted Category 4 hurricane in the Gulf of Mexico affect our current energy holdings?",
  },
] as const;

interface Drill {
  name: string;
  env?: Record<string, string>;
  quota?: { name: string; value: number };
  /** What a caveat or warning must mention; null when the input is not read at run time (Postgres holds it). */
  mentions: RegExp | null;
}

const DRILLS: Drill[] = [
  { name: "baseline", mentions: null },
  ...["tiingo", "fred", "eia", "alphavantage", "nhc"].map((s) => ({ name: `${s} disabled`, env: { DISABLE_SOURCES: s }, mentions: null })),
  { name: "gdelt disabled", env: { DISABLE_SOURCES: "gdelt" }, mentions: /news (coverage )?features|gdelt/i },
  { name: "openmeteo disabled", env: { DISABLE_SOURCES: "openmeteo" }, mentions: null },
  { name: "pinecone unreachable", env: { PINECONE_INDEX: BOGUS_PINECONE }, mentions: /news|sentiment|analog|pinecone/i },
  {
    name: "all news sources disabled",
    env: { DISABLE_SOURCES: "gdelt,alphavantage", PINECONE_INDEX: BOGUS_PINECONE },
    mentions: /news|sentiment/i,
  },
  { name: "alpha vantage quota at 24", quota: { name: "alphavantage", value: 24 }, mentions: null },
  { name: "enrichment quota exhausted", quota: { name: "enrich", value: ENRICH_DAILY_MAX }, mentions: null },
  { name: "invalid ANTHROPIC_API_KEY", env: { ANTHROPIC_API_KEY: "sk-ant-drill-invalid" }, mentions: /structured data|template|rule-based|fallback/i },
];

interface Result {
  drill: string;
  question: string;
  status: string;
  confidence: Confidence | null;
  checks: { notFailed: boolean; caveat: boolean | null; confidence: boolean; placeholders: boolean; digits: boolean };
}

function gitCommit(): string {
  try {
    const sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    return execSync("git status --porcelain", { encoding: "utf8" }).trim() ? `${sha} (uncommitted changes)` : sha;
  } catch {
    return "unknown";
  }
}

function runOnce(question: (typeof QUESTIONS)[number], env: Record<string, string>, out: string): RunsGetOutput {
  try {
    execFileSync("npx", ["tsx", "scripts/run-query.ts", `--preset=${question.preset}`, "--json", `--out=${out}`, question.query], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "ignore", "pipe"],
    });
  } catch (error) {
    // Exit code 2 is a `partial` run, which is what most drills expect; the stored run is checked below.
    if ((error as { status?: number }).status !== 2) throw error;
  }
  return JSON.parse(readFileSync(out, "utf8")) as RunsGetOutput;
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { "write-results": { type: "boolean", default: false } } });
  const dir = mkdtempSync(join(tmpdir(), "drills-"));
  const redis = getRedis();
  const baseline = new Map<string, Confidence | null>();
  const results: Result[] = [];

  for (const drill of DRILLS) {
    for (const question of QUESTIONS) {
      const key = drill.quota ? quotaKey(drill.quota.name, new Date()) : null;
      const saved = key ? await redis.get(key) : null;
      if (key && drill.quota) await redis.set(key, String(drill.quota.value), "EX", 86_400);
      let got: RunsGetOutput;
      try {
        got = runOnce(question, drill.env ?? {}, join(dir, `${results.length}.json`));
      } finally {
        if (key) await (saved === null ? redis.del(key) : redis.set(key, saved, "EX", 86_400));
      }
      const { run } = got;
      if (drill.name === "baseline") baseline.set(question.id, run.confidence);
      const texts = run.answer
        ? [run.answer.headline, run.answer.summary, ...run.answer.bullets.map((b) => b.text), ...run.answer.caveats]
        : [];
      const notes = [...(run.answer?.caveats.map((c) => c.rendered) ?? []), ...run.warnings].join("\n");
      const base = baseline.get(question.id) ?? null;
      results.push({
        drill: drill.name,
        question: question.id,
        status: run.status,
        confidence: run.confidence,
        checks: {
          notFailed: run.status !== "failed",
          caveat: drill.mentions ? drill.mentions.test(notes) : null,
          confidence: base === null || run.confidence === null || RANK[run.confidence] <= RANK[base],
          placeholders: texts.every((t) => !t.rendered.includes("{{")),
          digits: texts.every((t) => digitViolations(t.template).length === 0),
        },
      });
      const r = results.at(-1)!;
      console.error(`${drill.name.padEnd(28)} ${question.id.padEnd(8)} ${r.status.padEnd(9)} confidence ${r.confidence ?? "n/a"}`);
    }
  }
  await closeRedis();

  const mark = (v: boolean | null) => (v === null ? "n/a" : v ? "pass" : "FAIL");
  const passed = results.filter((r) => Object.values(r.checks).every((v) => v !== false)).length;
  const body = [
    "## Robustness drills (SPEC 9.4)",
    "",
    `- Run: ${new Date().toISOString()} on ${hostname()}, commit \`${gitCommit()}\`. ${passed}/${results.length} drill runs pass every check.`,
    "- Checks: the run does not fail; a caveat or warning names the missing input (n/a where the input is read from Postgres at run time); confidence is not above the baseline; no unresolved placeholders; no digits outside placeholders.",
    "",
    "| Drill | Question | Status | Confidence | Not failed | Caveat | Confidence | Placeholders | Digits |",
    "|---|---|---|---|---|---|---|---|---|",
    ...results.map(
      (r) =>
        `| ${r.drill} | ${r.question} | ${r.status} | ${r.confidence ?? "n/a"} | ${mark(r.checks.notFailed)} | ${mark(r.checks.caveat)} | ${mark(r.checks.confidence)} | ${mark(r.checks.placeholders)} | ${mark(r.checks.digits)} |`,
    ),
  ].join("\n");

  console.log(body);
  if (values["write-results"]) {
    writeFileSync(RESULTS_PATH, upsertResultsSection(readFileSync(RESULTS_PATH, "utf8"), "drills", body));
    console.error(`Wrote the drills section of ${RESULTS_PATH}`);
  }
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
