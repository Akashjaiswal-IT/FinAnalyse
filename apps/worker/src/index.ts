import { logger } from "@repo/logger";
import { createRedisConnection, closeRedis } from "@repo/services/clients/redis";
import { EventsService } from "@repo/services/events";
import { INGEST_SOURCES, IngestService, type IngestSource } from "@repo/services/ingest";
import { NewsService } from "@repo/services/news";
import { QUEUE_NAMES, closeQueues, getQueue, type QueueKey } from "@repo/services/queues";
import { publishLive } from "@repo/services/system";
import { Worker, type Job } from "bullmq";
import { env } from "./env";

const MINUTE = 60_000;

/** Schedules (SPEC 4 sources table): GDELT every 15 minutes, NHC every 10, Alpha Vantage hourly (24 a day),
 * Open-Meteo hourly, FRED every 6 hours, Tiingo on weekdays after the close, detection every 15 minutes. */
const SCHEDULES: { key: QueueKey; every?: number; pattern?: string }[] = [
  { key: "gdelt", every: 15 * MINUTE },
  { key: "nhc", every: 10 * MINUTE },
  { key: "alphavantage", every: 60 * MINUTE },
  { key: "openmeteo", every: 60 * MINUTE },
  { key: "fred", every: 6 * 60 * MINUTE },
  { key: "tiingo", pattern: "30 22 * * 1-5" },
  { key: "detect", every: 15 * MINUTE },
];

const ingest = new IngestService();
const news = new NewsService();
const events = new EventsService();

async function runIngest(source: IngestSource): Promise<unknown> {
  const result = await ingest.runSource(source);
  logger.info(`ingest ${source}`, { ...result });
  return result;
}

async function runEnrich(): Promise<unknown> {
  const scored = await news.scoreUnscored(20);
  if (scored.length) {
    const rows = await news.list({ asOf: new Date(), limit: 200 });
    const items = rows
      .filter((r) => scored.includes(r.id))
      .map((r) => ({ id: r.id, sentiment: r.sentiment ?? 0, relevance: r.relevance ?? 0, eventType: r.eventType }));
    await publishLive({ type: "news.scored", items });
  }
  return { scored: scored.length };
}

async function runDetect(): Promise<unknown> {
  const result = await events.detect(new Date());
  for (const id of [...result.detected, ...result.updated]) {
    const e = await events.get(id);
    if (!e) continue;
    await publishLive({
      type: result.detected.includes(id) ? "event.detected" : "event.updated",
      eventId: e.id,
      eventType: e.type,
      title: e.title,
      articleCount: e.articleCount,
      entities: e.entities,
    });
  }
  return { detected: result.detected.length, updated: result.updated.length, faded: result.faded.length };
}

function processor(key: QueueKey): (job: Job) => Promise<unknown> {
  if ((INGEST_SOURCES as readonly string[]).includes(key)) return () => runIngest(key as IngestSource);
  if (key === "enrich") return () => runEnrich();
  return () => runDetect();
}

async function main() {
  const workers = (Object.keys(QUEUE_NAMES) as QueueKey[]).map((key) => {
    const worker = new Worker(QUEUE_NAMES[key], processor(key), {
      connection: createRedisConnection({ maxRetriesPerRequest: null }),
      concurrency: key === "enrich" ? 2 : 1,
    });
    worker.on("failed", (job, err) => logger.warn(`${key} job failed`, { jobId: job?.id, error: err.message }));
    return worker;
  });

  if (env.SCHEDULES_ENABLED) {
    for (const s of SCHEDULES) {
      const repeat = s.every ? { every: s.every } : { pattern: s.pattern! };
      await getQueue(s.key).upsertJobScheduler(`schedule-${s.key}`, repeat, { name: s.key, data: { trigger: "schedule" } });
    }
  }
  logger.info(`worker started (schedules ${env.SCHEDULES_ENABLED ? "enabled" : "disabled"})`);

  const shutdown = async (signal: string) => {
    logger.info(`worker received ${signal}, shutting down`);
    await Promise.allSettled(workers.map((w) => w.close()));
    await closeQueues();
    await closeRedis();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error("worker failed to start", { err });
  process.exit(1);
});
