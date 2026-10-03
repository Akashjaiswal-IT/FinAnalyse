import http from "node:http";
import { logger } from "@repo/logger";
import { AgentRuntime, createCheckpointer } from "@repo/agents";
import { llm } from "@repo/services/llm";
import { createPostgresRuns } from "@repo/services/runs/postgres";
import { setApiRuntime } from "@repo/trpc/server";
import { app as expressApplication } from "./server";

import { env } from "./env";

async function init() {
  try {
    const runs = createPostgresRuns();
    const checkpointer = await createCheckpointer(env.DATABASE_URL);
    const agents = new AgentRuntime({ deps: { llm: llm(), runs, now: () => new Date() }, checkpointer });
    setApiRuntime({ agents, runs, demoToken: env.DEMO_TOKEN || undefined });
    const failed = await runs.failStaleRunning();
    if (failed > 0) logger.info(`marked ${failed} interrupted runs as failed`);

    const server = http.createServer(expressApplication);
    const PORT: number = env.PORT ? +env.PORT : 8000;
    server.listen(PORT, () => {
      logger.info(`http server is running on PORT ${PORT}`);
    });
    process.on("SIGTERM", () => {
      agents.cancelAll();
      server.close();
    });
  } catch (err) {
    logger.error(`Error creating http server`, { err });
    process.exit(1);
  }
}

init();
