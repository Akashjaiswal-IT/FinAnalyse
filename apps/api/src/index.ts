import http from "node:http";
import { logger } from "@repo/logger";
import { AgentRuntime, createCheckpointer, createServices } from "@repo/agents";
import { llm } from "@repo/services/llm";
import { createPostgresRuns } from "@repo/services/runs/postgres";
import { subscribeLive } from "@repo/services/system";
import { publishLiveEvent, setApiRuntime } from "@repo/trpc/server";
import { app as expressApplication } from "./server";

import { env } from "./env";

async function init() {
  try {
    const runs = createPostgresRuns();
    const checkpointer = await createCheckpointer(env.DATABASE_URL);
    const fake = env.FAKE_SERVICES === "1";
    if (fake) logger.warn("FAKE_SERVICES=1: the agents read fixture data, not market data");
    const agents = new AgentRuntime({ deps: { llm: llm(), runs, now: () => new Date(), ...createServices(fake) }, checkpointer });
    setApiRuntime({ agents, runs, demoToken: env.DEMO_TOKEN || undefined });
    // The worker publishes on Redis; until Track A's relay lands this fails and the feed carries heartbeats only.
    subscribeLive(publishLiveEvent).catch((err) => logger.warn("live relay not running", { error: String(err) }));
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
