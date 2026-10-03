// Leave-one-out backtest (SPEC 9.1). Owner: Track C.
//
//   pnpm backtest                      run on the analog events in Postgres and print the tables
//   pnpm backtest --save               also store the reported run as a `backtests` row
//   pnpm backtest --write-results      also update the backtest section of docs/RESULTS.md
//   pnpm backtest --from-file f.json   use the events in f.json (AnalogEvent[]) instead of Postgres
//   pnpm backtest --export f.json      write the events used, so the run can be repeated exactly
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
import { renderBacktestSection, runBacktest, upsertResultsSection } from "../packages/quant/index";

const ALTERNATIVE_BANDWIDTHS = [0.75, 1.5] as const;
const RESULTS_PATH = resolve(process.cwd(), "docs/RESULTS.md");

const USAGE = `Usage: pnpm backtest [--from-file events.json] [--export events.json] [--save] [--write-results]`;

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

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "from-file": { type: "string" },
      export: { type: "string" },
      save: { type: "boolean", default: false },
      "write-results": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }

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
  console.log(section);

  if (values.export) {
    writeFileSync(resolve(process.cwd(), values.export), `${JSON.stringify(events, null, 2)}\n`);
    console.error(`Wrote the ${events.length} events to ${values.export}`);
  }
  if (values["write-results"]) {
    writeFileSync(RESULTS_PATH, upsertResultsSection(readFileSync(RESULTS_PATH, "utf8"), "backtest", section));
    console.error("Updated the backtest section of docs/RESULTS.md");
  }
  if (values.save) {
    // Imported only here, so printing a backtest needs no database.
    const { createPostgresBacktests } = await import("../packages/services/backtest/postgres");
    const saved = await createPostgresBacktests().save(headline);
    console.error(`Saved backtest ${saved.id} (${saved.createdAt})`);
  }
}

main().then(
  () => process.exit(0), // the database pool would otherwise keep the process alive
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    if ((error as { code?: string } | null)?.code?.startsWith("ERR_PARSE_ARGS")) console.error(USAGE);
    process.exit(1);
  },
);
