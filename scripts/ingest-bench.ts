// Ingestion latency (SPEC 9.3, NFR 1) as measured by the worker's real passes: for every news item fetched in the
// window, `indexed_at - fetched_at` is the time from the upstream response to Postgres and Pinecone acknowledging.
//
//   pnpm bench:ingest                  last 7 days
//   pnpm bench:ingest --days=1
//   pnpm bench:ingest --write-results  also update the ingest section of docs/RESULTS.md
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { db, sql } from "../packages/database/index";
import { upsertResultsSection } from "../packages/quant/index";

const RESULTS_PATH = resolve(process.cwd(), "docs/RESULTS.md");

interface Row {
  source: string;
  items: number;
  indexed: number;
  prefiltered: number;
  p50: number | null;
  p95: number | null;
  max: number | null;
}

function gitCommit(): string {
  try {
    const sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    return execSync("git status --porcelain", { encoding: "utf8" }).trim() ? `${sha} (uncommitted changes)` : sha;
  } catch {
    return "unknown";
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { days: { type: "string", default: "7" }, "write-results": { type: "boolean", default: false } } });
  const days = Number(values.days);
  if (!Number.isFinite(days) || days <= 0) throw new Error("--days must be a positive number");

  // Replay seeding stamps fetched_at with a preset's as-of, so only items fetched inside the window are live passes.
  const result = await db.execute(sql`
    select source,
      count(*)::int as items,
      count(indexed_at)::int as indexed,
      count(*) filter (where prefilter_match)::int as prefiltered,
      percentile_cont(0.5) within group (order by extract(epoch from (indexed_at - fetched_at)) * 1000) as p50,
      percentile_cont(0.95) within group (order by extract(epoch from (indexed_at - fetched_at)) * 1000) as p95,
      max(extract(epoch from (indexed_at - fetched_at)) * 1000) as max
    from news_items
    where fetched_at >= now() - make_interval(days => ${days})
    group by source order by source`);
  const rows = (result as unknown as { rows?: Row[] }).rows ?? (result as unknown as Row[]);
  const ms = (v: number | null) => (v === null ? "n/a" : `${Math.round(Number(v)).toLocaleString("en-US")} ms`);
  const share = (a: number, b: number) => (b === 0 ? "n/a" : `${((100 * a) / b).toFixed(1)}%`);

  const body = [
    "## Ingestion latency (SPEC 9.3)",
    "",
    `- Run: ${new Date().toISOString()} on ${hostname()}, commit \`${gitCommit()}\`. Window: news fetched in the last ${days} days by the worker's scheduled and manual passes.`,
    "- Latency is `indexed_at - fetched_at`: upstream response received to the Postgres insert and the Pinecone upsert both acknowledged. Only prefiltered items are indexed.",
    "",
    "| Source | Items | Prefilter pass | Indexed | p50 | p95 | Max |",
    "|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.source} | ${r.items} | ${share(r.prefiltered, r.items)} | ${r.indexed} | ${ms(r.p50)} | ${ms(r.p95)} | ${ms(r.max)} |`),
    ...(rows.length === 0 ? ["| (none) | 0 | n/a | 0 | n/a | n/a | n/a |"] : []),
  ].join("\n");

  console.log(body);
  if (values["write-results"]) {
    writeFileSync(RESULTS_PATH, upsertResultsSection(readFileSync(RESULTS_PATH, "utf8"), "ingest", body));
    console.error(`Wrote the ingest section of ${RESULTS_PATH}`);
  }
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
