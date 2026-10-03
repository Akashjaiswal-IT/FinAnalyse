import { count, db } from "../packages/database/index";
import {
  analogEvents,
  instruments,
  macroObservations,
  newsItems,
  positions,
  priceBars,
  refineries,
  stormPoints,
  storms,
} from "../packages/database/schema";
import { closeRedis } from "../packages/services/clients/redis";
import { ensureIndex, getPinecone } from "../packages/services/clients/pinecone";
import { seedAnalogs } from "./seed/analogs";
import { log, type SeedOptions } from "./seed/lib";
import { seedPrices } from "./seed/prices";
import { seedRefineries } from "./seed/refineries";
import { seedReplayNews } from "./seed/replay-news";
import { seedStorms } from "./seed/storms";
import { seedUniverse } from "./seed/universe";

// `pnpm seed` (idempotent), `pnpm seed --only=<step>`, `--refresh` to refetch cached upstream data (SPEC 10).

const STEPS = {
  universe: (_: SeedOptions) => seedUniverse(),
  prices: (o: SeedOptions) => seedPrices(o),
  storms: (o: SeedOptions) => seedStorms(o),
  refineries: (_: SeedOptions) => seedRefineries(),
  analogs: (o: SeedOptions) => seedAnalogs(o),
  news: (o: SeedOptions) => seedReplayNews(o),
  pinecone: async (_: SeedOptions) => {
    log("pinecone", `index: ${await ensureIndex()}`);
    log("pinecone", `namespace counts: ${JSON.stringify(await getPinecone().namespaceCounts())}`);
  },
} as const;
type Step = keyof typeof STEPS;

async function counts(): Promise<Record<string, number>> {
  const tables = { instruments, positions, priceBars, macroObservations, storms, stormPoints, refineries, analogEvents, newsItems };
  const out: Record<string, number> = {};
  for (const [name, table] of Object.entries(tables)) {
    const [row] = await db.select({ n: count() }).from(table);
    out[name] = row?.n ?? 0;
  }
  return out;
}

async function main(): Promise<void> {
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);
  const options: SeedOptions = { refresh: process.argv.includes("--refresh") };
  const steps = (only ? only.split(",") : Object.keys(STEPS)) as Step[];
  for (const step of steps) {
    if (!(step in STEPS)) throw new Error(`unknown step ${step}; steps: ${Object.keys(STEPS).join(", ")}`);
    const started = Date.now();
    await STEPS[step](options);
    log(step, `done in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  }
  console.table(await counts());
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeRedis();
    await db.$client.end();
  });
