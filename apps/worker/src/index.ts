import { logger } from "@repo/logger";
import { env } from "./env";

// Queues, job schedulers and workers (src/jobs) land in Phase 1, Track A.
async function main() {
  logger.info(`worker started (schedules ${env.SCHEDULES_ENABLED ? "enabled" : "disabled"})`);

  const shutdown = (signal: string) => {
    logger.info(`worker received ${signal}, shutting down`);
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error("worker failed to start", { err });
  process.exit(1);
});
