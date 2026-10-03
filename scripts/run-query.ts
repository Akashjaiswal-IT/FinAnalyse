/**
 * Runs one question through the agent graph from the command line and prints the events and the answer.
 *
 *   pnpm tsx scripts/run-query.ts [--preset=<id>] [--mode=live|replay] [--as-of=<ISO>] [--thread=<uuid>]
 *                                 [--market-event=<uuid>] [--fake] [--json] [--out=<file>] "<question>"
 *
 * --fake reads fixture data instead of the seeded services (the model is still called). --out writes the stored run
 * (`runs.get` output) as JSON to a file, for scripts. Exit code is 1 when the
 * run fails and 2 when it ends `partial`, so scripts can tell a clean run from a degraded one.
 */
import { writeFileSync } from "node:fs";
import { AgentRuntime, createCheckpointer, createServices } from "@repo/agents";
import { llm } from "@repo/services/llm";
import { createPostgresRuns } from "@repo/services/runs/postgres";

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const has = (name: string) => args.includes(`--${name}`);
const query = args.filter((a) => !a.startsWith("--")).join(" ").trim();
if (!query) {
  console.error('usage: run-query.ts [--preset=<id>] [--mode=live|replay] [--as-of=<ISO>] [--thread=<uuid>] [--fake] [--json] "<question>"');
  process.exit(1);
}

const preset = flag("preset");
const mode = (flag("mode") ?? (preset || flag("as-of") ? "replay" : "live")) as "live" | "replay";
const quiet = has("json");

async function main() {
  const runs = createPostgresRuns();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const checkpointer = await createCheckpointer(url);
  const runtime = new AgentRuntime({ deps: { llm: llm(), runs, now: () => new Date(), ...createServices(has("fake")) }, checkpointer });
  const { runId, threadId } = await runtime.start({
    query,
    mode,
    asOf: flag("as-of"),
    replayPresetId: preset,
    marketEventId: flag("market-event"),
    threadId: flag("thread"),
  });
  if (!quiet) console.log(`run ${runId}\nthread ${threadId}\n`);

  const printer = (async () => {
    for await (const { seq, event } of runs.stream(runId, 0)) {
      if (quiet) continue;
      const node = "node" in event ? ` ${event.node}` : "";
      const extra =
        event.type === "step.completed" ? ` ${event.status} ${event.durationMs}ms  ${event.summary}`
        : event.type === "evidence.added" ? ` +${event.evidence.length}`
        : event.type === "run.completed" ? ` ${event.status}`
        : event.type === "run.failed" ? ` ${event.error}`
        : "";
      console.log(`#${String(seq).padStart(3)} ${event.type}${node}${extra}`);
    }
  })();
  await runtime.finished(runId);
  await printer;

  const got = await runs.get(runId);
  if (!got) throw new Error("run not found after it finished");
  const { run, evidence, steps } = got;
  const out = flag("out");
  if (out) writeFileSync(out, JSON.stringify(got));
  if (quiet) {
    console.log(JSON.stringify(got, null, 2));
  } else {
    const answer = run.answer;
    console.log(`\n${run.status.toUpperCase()}  confidence ${run.confidence ?? "n/a"}  ${evidence.length} evidence rows  $${run.costUsd.toFixed(4)}  ${run.tokensIn} in / ${run.tokensOut} out`);
    if (answer) {
      console.log(`\n${answer.headline.rendered}\n\n${answer.summary.rendered}\n`);
      for (const b of answer.bullets) console.log(`- ${b.text.rendered}  [${b.evidenceKeys.join(" ")}]`);
      for (const c of answer.caveats) console.log(`  caveat: ${c.rendered}`);
      const cited = new Set(answer.bullets.flatMap((b) => b.evidenceKeys));
      const channels = new Set(run.risk?.channels.flatMap((c) => c.channels.map((l) => l.channel)));
      console.log(`\nanswer source: ${answer.source}; cites ${cited.size} evidence rows; exposure channels: ${[...channels].join(", ") || "none"}`);
    }
    if (run.hedgePlan) {
      console.log(`hedge plan (${run.hedgePlan.source}):`);
      for (const a of run.hedgePlan.actions) console.log(`  ${a.side} ${a.quantity} ${a.symbol} (${a.type}, ${a.timing}) notional $${Math.round(a.notional)}`);
    }
    console.log(`verification: ${run.verification?.passed ? "passed" : "FAILED"}${run.verification?.repairAttempted ? " after a repair" : ""}`);
    console.log(`steps: ${steps.map((s) => `${s.node}=${s.status}`).join(" ")}`);
    if (run.warnings.length > 0) console.log(`warnings:\n  ${run.warnings.join("\n  ")}`);
    if (run.error) console.log(`error: ${run.error}`);
  }
  process.exit(run.status === "failed" ? 1 : run.status === "partial" ? 2 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
