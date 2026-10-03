import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CuratedEventSeed, TIINGO_SYMBOLS, UNIVERSE_SYMBOLS, VAR_LOOKBACK_DAYS } from "../../packages/contracts/index";
import { db, max, min, sql } from "../../packages/database/index";
import { priceBars } from "../../packages/database/schema";
import { MacroService } from "../../packages/services/macro/index";
import { MarketService } from "../../packages/services/market/index";
import { SEED } from "./lib";

// GATE A checks on the seeded database (ROADMAP Phase 1). Run: pnpm exec dotenv -- tsx scripts/seed/gate-a.ts

const AS_OFS = { ida: new Date("2021-08-27T21:00:00.000Z"), ukraine: new Date("2022-02-25T02:40:00.000Z") };

async function main(): Promise<void> {
  let failures = 0;
  const check = (ok: boolean, message: string) => {
    console.log(`${ok ? "PASS" : "FAIL"} ${message}`);
    if (!ok) failures++;
  };

  const ranges = await db
    .select({ symbol: priceBars.symbol, first: min(priceBars.date), last: max(priceBars.date), n: sql<number>`count(*)::int` })
    .from(priceBars)
    .groupBy(priceBars.symbol);
  const lastClose = ranges.reduce((m, r) => (r.last && r.last > m ? r.last : m), "");
  for (const symbol of TIINGO_SYMBOLS) {
    const r = ranges.find((x) => x.symbol === symbol);
    check(!!r && r.last === lastClose && !!r.first && r.first < "2016-01-01", `${symbol} bars ${r?.first} to ${r?.last} (${r?.n})`);
  }

  const market = new MarketService();
  const macro = new MacroService();
  for (const [name, asOf] of Object.entries(AS_OFS)) {
    const m = await market.returns(UNIVERSE_SYMBOLS, VAR_LOOKBACK_DAYS, asOf);
    check(
      m.returns.length === VAR_LOOKBACK_DAYS && m.returns.every((row) => row.length === UNIVERSE_SYMBOLS.length && row.every(Number.isFinite)),
      `${name}: market.returns for ${UNIVERSE_SYMBOLS.length} symbols has ${m.returns.length} aligned rows, ${m.dates[0]} to ${m.dates.at(-1)}`,
    );
    const snap = await macro.snapshot(asOf);
    console.log(`     ${name} macro: ${JSON.stringify(snap)}`);
  }

  const curated = CuratedEventSeed.array().parse(JSON.parse(readFileSync(resolve(SEED, "analog-events.json"), "utf8")));
  check(curated.length >= 30 && curated.every((e) => e.sources.length > 0), `curated file: ${curated.length} events, all with a source`);

  console.log(failures ? `${failures} check(s) failed` : "GATE A data checks passed");
  process.exitCode = failures ? 1 : 0;
}

main().finally(() => db.$client.end());
