// Leave-one-out backtest (SPEC 9.1). Owner: Track C.
//
//   pnpm backtest                      run on the analog events in Postgres and print the tables
//   pnpm backtest --save               also store the reported run as a `backtests` row
//   pnpm backtest --write-results      also update the backtest section of docs/RESULTS.md
//   pnpm backtest --from-file f.json   use the events in f.json (AnalogEvent[]) instead of Postgres
//   pnpm backtest --export f.json      write the events used, so the run can be repeated exactly
//   pnpm backtest --verify             re-run and check that it reproduces the recorded numbers (Gate C3):
//                                      the latest saved `backtests` row and the backtest section of docs/RESULTS.md.
//                                      Exit code 1 on any difference. Only reads. --skip-db checks RESULTS.md alone.
//   pnpm backtest --results f.md       use f.md instead of docs/RESULTS.md (--write-results, --verify)
//
// Workspace code is imported by relative path, as scripts/seed.ts does: the root package has no workspace dependencies.
//
// The reported result is bandwidth h = KNN_BANDWIDTH. h = 0.75 and 1.5 are shown next to it, never instead of it.
// TYPE_WEIGHT is fixed. Nothing here tunes the forecast on the results.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { AnalogEvent, KNN_BANDWIDTH } from "../packages/contracts/index";
import {
  diffBacktests,
  diffResultsSection,
  renderBacktestSection,
  runBacktest,
  upsertResultsSection,
  type BacktestRun,
} from "../packages/quant/index";

const ALTERNATIVE_BANDWIDTHS = [0.75, 1.5] as const;
const DEFAULT_RESULTS = "docs/RESULTS.md";

const USAGE = `Usage: pnpm backtest [--from-file events.json] [--export events.json] [--save] [--write-results] [--results file.md]
       pnpm backtest --verify [--skip-db] [--from-file events.json] [--results file.md]`;

async function loadEvents(fromFile: string | undefined): Promise<AnalogEvent[]> {
  let raw: unknown;
  if (fromFile) {
    raw = JSON.parse(readFileSync(resolve(process.cwd(), fromFile), "utf8"));
  } else {
    // Imported only here, so --from-file needs neither Postgres nor DATABASE_URL.
    const { AnalogsService } = await import("../packages/services/analogs/index");
    try {
      raw = await new AnalogsService().list();
    } catch (error) {
      throw new Error(`AnalogsService.list() failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const parsed = AnalogEvent.array().safeParse(raw);
  if (!parsed.success) {
    const shown = parsed.error.issues.slice(0, 5).map((i) => `  ${i.path.map(String).join(".")}: ${i.message}`);
    const more = parsed.error.issues.length - shown.length;
    throw new Error(
      `The events do not match AnalogEvent[]:\n${shown.join("\n")}${more > 0 ? `\n  ... and ${more} more` : ""}`,
    );
  }
  return parsed.data;
}

function gitCommit(): string {
  try {
    const sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    const dirty = execSync("git status --porcelain", { encoding: "utf8" }).trim() !== "";
    return dirty ? `${sha} (uncommitted changes)` : sha;
  } catch {
    return "unknown";
  }
}

/**
 * Gate C3: a fresh run must equal what was recorded, exactly. Two recorded places are checked: the backtest section
 * of the results file (all but its "Run:" line) and the latest saved row. A missing record counts as a failure.
 */
async function verify(headline: BacktestRun, section: string, resultsPath: string, checkDb: boolean): Promise<boolean> {
  let ok = true;
  const report = (name: string, passed: boolean, details: string[]) => {
    console.log(`${passed ? "PASS" : "FAIL"}  ${name}`);
    for (const line of details) console.log(`        ${line}`);
    ok &&= passed;
  };

  try {
    const diff = diffResultsSection(readFileSync(resultsPath, "utf8"), "backtest", section);
    report(`${resultsPath}: the backtest section equals a fresh run (ignoring its "Run:" line)`, diff.same, diff.reason ? [diff.reason] : []);
  } catch (error) {
    report(`${resultsPath}: the backtest section equals a fresh run`, false, [error instanceof Error ? error.message : String(error)]);
  }

  if (checkDb) {
    // Imported only here, so --skip-db needs no database.
    const { createPostgresBacktests } = await import("../packages/services/backtest/postgres");
    const saved = await createPostgresBacktests().latest();
    if (!saved) {
      report("the latest saved backtest equals a fresh run", false, ["no backtest is saved yet (pnpm backtest --save)"]);
    } else {
      const diff = diffBacktests(headline, saved);
      const details = diff.differences.map((d) => d);
      if (diff.omitted > 0) details.push(`... and ${diff.omitted} more`);
      report(`the latest saved backtest (${saved.id}, ${saved.createdAt}) equals a fresh run`, diff.same, details);
    }
  }

  console.log(ok ? "Reproduced: the recorded numbers are exactly what a fresh run gives." : "NOT reproduced: see the differences above.");
  return ok;
}

async function main(): Promise<boolean> {
  const { values } = parseArgs({
    options: {
      "from-file": { type: "string" },
      export: { type: "string" },
      save: { type: "boolean", default: false },
      "write-results": { type: "boolean", default: false },
      verify: { type: "boolean", default: false },
      "skip-db": { type: "boolean", default: false },
      results: { type: "string" },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return true;
  }
  if (values.verify && (values.save || values["write-results"] || values.export)) {
    throw new Error("--verify only reads: do not combine it with --save, --write-results or --export.");
  }
  const resultsPath = resolve(process.cwd(), values.results ?? DEFAULT_RESULTS);

  const events = (await loadEvents(values["from-file"])).sort((a, b) => a.id.localeCompare(b.id));
  if (events.length < 2) {
    throw new Error(`A leave-one-out backtest needs at least 2 events; found ${events.length}. Run the seed first (pnpm seed).`);
  }
  console.error(`Backtesting ${events.length} events at h = ${KNN_BANDWIDTH}, ${ALTERNATIVE_BANDWIDTHS.join(" and ")}...`);

  const headline = runBacktest(events, { bandwidth: KNN_BANDWIDTH });
  const alternatives = ALTERNATIVE_BANDWIDTHS.map((bandwidth) => runBacktest(events, { bandwidth }));
  const section = renderBacktestSection(headline, alternatives, {
    generatedAt: new Date().toISOString(),
    machine: hostname(),
    commit: gitCommit(),
  });
  if (values.verify) return verify(headline, section, resultsPath, !values["skip-db"]);
  console.log(section);

  if (values.export) {
    writeFileSync(resolve(process.cwd(), values.export), `${JSON.stringify(events, null, 2)}\n`);
    console.error(`Wrote the ${events.length} events to ${values.export}`);
  }
  if (values["write-results"]) {
    writeFileSync(resultsPath, upsertResultsSection(readFileSync(resultsPath, "utf8"), "backtest", section));
    console.error(`Updated the backtest section of ${values.results ?? DEFAULT_RESULTS}`);
  }
  if (values.save) {
    // Imported only here, so printing a backtest needs no database.
    const { createPostgresBacktests } = await import("../packages/services/backtest/postgres");
    const saved = await createPostgresBacktests().save(headline);
    console.error(`Saved backtest ${saved.id} (${saved.createdAt})`);
  }
  return true;
}

main().then(
  (ok) => process.exit(ok ? 0 : 1), // exiting also stops the database pool from keeping the process alive
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    if ((error as { code?: string } | null)?.code?.startsWith("ERR_PARSE_ARGS")) console.error(USAGE);
    process.exit(1);
  },
);
