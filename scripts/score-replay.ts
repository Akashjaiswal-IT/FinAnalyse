// Scores the prefiltered news in every replay preset's window `[asOf - 72 h, asOf]` ahead of a demo, so a replay
// run does not wait on scoring in its sentiment node. Idempotent: scored items are skipped.
//
//   pnpm score:replay [--preset=<id>]
import { parseArgs } from "node:util";
import { ENRICH_BATCH, NEWS_WINDOW_HOURS, REPLAY_PRESETS } from "../packages/contracts/index";
import { and, db, eq, gte, isNull, lte } from "../packages/database/index";
import { newsItems } from "../packages/database/schema";
import { closeRedis } from "../packages/services/clients/redis";
import { NewsService } from "../packages/services/news/index";

const PARALLEL = 3;
const HOUR = 3_600_000;
const MIN_SPLIT = 5;

/** A batch that times out is retried as two halves: the fast model's 15 s limit fits fewer items. */
async function score(news: NewsService, ids: string[]): Promise<{ scored: number; failed: number }> {
  try {
    return { scored: (await news.scoreUnscored(ids.length, ids)).length, failed: 0 };
  } catch (error) {
    if (ids.length <= MIN_SPLIT) {
      console.error(error instanceof Error ? error.message : String(error));
      return { scored: 0, failed: 1 };
    }
    const half = Math.ceil(ids.length / 2);
    const [a, b] = await Promise.all([score(news, ids.slice(0, half)), score(news, ids.slice(half))]);
    return { scored: a.scored + b.scored, failed: a.failed + b.failed };
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { preset: { type: "string" } } });
  const presets = REPLAY_PRESETS.filter((p) => !values.preset || p.id === values.preset);
  if (presets.length === 0) throw new Error(`no replay preset ${values.preset}`);
  const news = new NewsService();

  for (const preset of presets) {
    const to = new Date(preset.asOf);
    const from = new Date(to.getTime() - NEWS_WINDOW_HOURS * HOUR);
    const rows = await db
      .select({ id: newsItems.id })
      .from(newsItems)
      .where(and(gte(newsItems.publishedAt, from), lte(newsItems.publishedAt, to), eq(newsItems.prefilterMatch, true), isNull(newsItems.scoredAt)));
    const batches: string[][] = [];
    for (let i = 0; i < rows.length; i += ENRICH_BATCH) batches.push(rows.slice(i, i + ENRICH_BATCH).map((r) => r.id));

    let scored = 0;
    let failed = 0;
    const started = Date.now();
    for (let i = 0; i < batches.length; i += PARALLEL) {
      for (const r of await Promise.all(batches.slice(i, i + PARALLEL).map((ids) => score(news, ids)))) {
        scored += r.scored;
        failed += r.failed;
      }
    }
    console.log(`${preset.id}: ${rows.length} unscored, ${scored} scored, ${failed} failed batches, ${((Date.now() - started) / 1000).toFixed(0)} s`);
  }
}

main().then(
  async () => {
    await closeRedis();
    process.exit(0);
  },
  async (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    await closeRedis();
    process.exit(1);
  },
);
