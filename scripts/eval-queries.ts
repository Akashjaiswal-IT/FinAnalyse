// Orchestration eval (SPEC 9.2): runs the 20 queries in data/eval/queries.json through the agent graph and scores
// the plan, the event, the verifier and the hedge limits against the expected values.
//
//   pnpm eval                  run and print the tables
//   pnpm eval --write-results  also update the eval section of docs/RESULTS.md
//   pnpm eval --only=q01,q02   run a subset (follow-ups also run the query they continue)
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { AgentRuntime, createCheckpointer, createServices } from "@repo/agents";
import { llm } from "@repo/services/llm";
import { createPostgresRuns } from "@repo/services/runs/postgres";
import { upsertResultsSection } from "../packages/quant/index";

type Specialist = "weather" | "sentiment" | "macro" | "analogs";
const SPECIALISTS: Specialist[] = ["weather", "sentiment", "macro", "analogs"];

interface EvalQuery {
  id: string;
  group: string;
  query: string;
  mode: "live" | "replay";
  presetId: string | null;
  expectedIntent: string;
  expectedEventType: string | null;
  expectedEventSource: string;
  requiredSpecialists: Record<Specialist, boolean>;
  followUpOf?: string;
}

interface Outcome {
  q: EvalQuery;
  status: string;
  intentOk: boolean;
  typeOk: boolean;
  sourceOk: boolean;
  called: Specialist[];
  required: Specialist[];
  verified: boolean | null;
  firstTry: boolean | null;
  hedgeOk: boolean | null;
  answerSource: string | null;
  planSource: string | null;
  latencyMs: number;
  firstEventMs: number;
  costUsd: number;
  threadId: string;
}

const RESULTS_PATH = resolve(process.cwd(), "docs/RESULTS.md");
const pct = (num: number, den: number) => (den === 0 ? "n/a" : `${((100 * num) / den).toFixed(1)}%`);
const quantile = (xs: number[], q: number) => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]!;
};
const seconds = (ms: number) => (Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)} s` : "n/a");

function gitCommit(): string {
  try {
    const sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    return execSync("git status --porcelain", { encoding: "utf8" }).trim() ? `${sha} (uncommitted changes)` : sha;
  } catch {
    return "unknown";
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { "write-results": { type: "boolean", default: false }, only: { type: "string" } } });
  const all = (JSON.parse(readFileSync(resolve(process.cwd(), "data/eval/queries.json"), "utf8")) as { queries: EvalQuery[] }).queries;
  const wanted = values.only ? new Set(values.only.split(",")) : null;
  for (const q of all) if (wanted?.has(q.id) && q.followUpOf) wanted.add(q.followUpOf);
  const queries = wanted ? all.filter((q) => wanted.has(q.id)) : all;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const runs = createPostgresRuns();
  const runtime = new AgentRuntime({
    deps: { llm: llm(), runs, now: () => new Date(), ...createServices(false) },
    checkpointer: await createCheckpointer(url),
  });

  const outcomes: Outcome[] = [];
  for (const q of queries) {
    const threadId = q.followUpOf ? outcomes.find((o) => o.q.id === q.followUpOf)?.threadId : undefined;
    const started = Date.now();
    const { runId, threadId: thread } = await runtime.start({
      query: q.query,
      mode: q.mode,
      replayPresetId: q.presetId ?? undefined,
      threadId,
    });
    let firstEventMs = NaN;
    const watcher = (async () => {
      for await (const { event } of runs.stream(runId, 0)) {
        if (event.type === "step.completed" && Number.isNaN(firstEventMs)) firstEventMs = Date.now() - started;
      }
    })();
    await runtime.finished(runId);
    await watcher;
    const got = await runs.get(runId);
    if (!got) throw new Error(`run ${runId} not found`);
    const { run } = got;
    const plan = run.plan;
    const called = plan ? SPECIALISTS.filter((s) => plan.specialists[s]) : [];
    const outcome: Outcome = {
      q,
      status: run.status,
      intentOk: plan?.intent === q.expectedIntent,
      typeOk: (run.eventProfile?.type ?? plan?.event.type ?? null) === q.expectedEventType,
      sourceOk: plan?.event.source === q.expectedEventSource,
      called,
      required: SPECIALISTS.filter((s) => q.requiredSpecialists[s]),
      verified: run.verification ? run.verification.passed : null,
      firstTry: run.verification ? run.verification.passed && !run.verification.repairAttempted : null,
      hedgeOk: run.hedgePlan ? run.hedgePlan.violations.length === 0 : null,
      answerSource: run.answer?.source ?? null,
      planSource: plan?.source ?? null,
      latencyMs: run.finishedAt ? Date.parse(run.finishedAt) - Date.parse(run.startedAt) : NaN,
      firstEventMs,
      costUsd: run.costUsd,
      threadId: thread,
    };
    outcomes.push(outcome);
    console.error(
      `${q.id} ${run.status.padEnd(9)} intent ${outcome.intentOk ? "ok " : "BAD"} type ${outcome.typeOk ? "ok " : "BAD"} ` +
        `${seconds(outcome.latencyMs)} plan ${outcome.planSource ?? "none"} answer ${outcome.answerSource ?? "none"}`,
    );
  }

  const n = outcomes.length;
  const count = (f: (o: Outcome) => boolean) => outcomes.filter(f).length;
  const hit = outcomes.reduce((a, o) => a + o.called.filter((s) => o.required.includes(s)).length, 0);
  const required = outcomes.reduce((a, o) => a + o.required.length, 0);
  const calledTotal = outcomes.reduce((a, o) => a + o.called.length, 0);
  const verifiedRuns = outcomes.filter((o) => o.verified !== null);
  const hedged = outcomes.filter((o) => o.hedgeOk !== null);
  const latencies = outcomes.map((o) => o.latencyMs).filter(Number.isFinite);
  const firsts = outcomes.map((o) => o.firstEventMs).filter(Number.isFinite);
  const cost = outcomes.reduce((a, o) => a + o.costUsd, 0);

  const body = [
    "## Orchestration eval (SPEC 9.2)",
    "",
    `- Run: ${new Date().toISOString()} on ${hostname()}, commit \`${gitCommit()}\`, ${n} queries from data/eval/queries.json.`,
    `- Runs: ${count((o) => o.status === "succeeded")} succeeded, ${count((o) => o.status === "partial")} partial, ${count((o) => o.status === "failed")} failed.`,
    `- Plans: ${count((o) => o.planSource === "model")} model, ${count((o) => o.planSource === "fallback")} rule-based. Answers: ${count((o) => o.answerSource === "model")} model, ${count((o) => o.answerSource === "template")} template.`,
    "",
    "| Metric | Value |",
    "|---|---|",
    `| Intent accuracy | ${pct(count((o) => o.intentOk), n)} (${count((o) => o.intentOk)}/${n}) |`,
    `| Event-type accuracy | ${pct(count((o) => o.typeOk), n)} (${count((o) => o.typeOk)}/${n}) |`,
    `| Event-source accuracy | ${pct(count((o) => o.sourceOk), n)} (${count((o) => o.sourceOk)}/${n}) |`,
    `| Specialist recall | ${pct(hit, required)} (${hit}/${required}) |`,
    `| Specialist precision | ${pct(hit, calledTotal)} (${hit}/${calledTotal}) |`,
    `| Verifier pass, first try | ${pct(verifiedRuns.filter((o) => o.firstTry).length, verifiedRuns.length)} |`,
    `| Verifier pass, after repair | ${pct(verifiedRuns.filter((o) => o.verified).length, verifiedRuns.length)} |`,
    `| Hedge-limit pass | ${pct(hedged.filter((o) => o.hedgeOk).length, hedged.length)} (${hedged.length} plans) |`,
    `| Run latency p50 / p95 | ${seconds(quantile(latencies, 0.5))} / ${seconds(quantile(latencies, 0.95))} |`,
    `| First completed step p50 / p95 | ${seconds(quantile(firsts, 0.5))} / ${seconds(quantile(firsts, 0.95))} |`,
    `| Cost per run (mean) | $${(n ? cost / n : 0).toFixed(4)} |`,
    "",
    "| Query | Group | Status | Intent | Event type | Source | Specialists called | Answer |",
    "|---|---|---|---|---|---|---|---|",
    ...outcomes.map(
      (o) =>
        `| ${o.q.id} | ${o.q.group} | ${o.status} | ${o.intentOk ? "ok" : "wrong"} | ${o.typeOk ? "ok" : "wrong"} | ${o.sourceOk ? "ok" : "wrong"} | ${o.called.join(", ") || "none"} | ${o.answerSource ?? "none"} |`,
    ),
  ].join("\n");

  console.log(body);
  if (values["write-results"]) {
    writeFileSync(RESULTS_PATH, upsertResultsSection(readFileSync(RESULTS_PATH, "utf8"), "eval", body));
    console.error(`Wrote the eval section of ${RESULTS_PATH}`);
  }
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
