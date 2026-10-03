import { afterAll, beforeAll } from "vitest";
import { db, inArray } from "@repo/database";
import { portfolios, threads } from "@repo/database/schema";
import { DEMO_PORTFOLIO } from "@repo/contracts";
import { DrizzleRunsRepo } from "./drizzle";
import type { NewThread, RunsRepo } from "./model";
import { runsServiceSuite } from "./suite";

// Needs the compose Postgres with migrations applied (`pnpm db:migrate`), as CI does.
const createdThreads: string[] = [];

class TrackingRepo extends DrizzleRunsRepo implements RunsRepo {
  override async createThread(input: NewThread): Promise<string> {
    const id = await super.createThread(input);
    createdThreads.push(id);
    return id;
  }
}

beforeAll(async () => {
  await db.insert(portfolios).values({ name: DEMO_PORTFOLIO.name, nav: DEMO_PORTFOLIO.nav }).onConflictDoNothing();
});

afterAll(async () => {
  if (createdThreads.length > 0) await db.delete(threads).where(inArray(threads.id, createdThreads));
});

runsServiceSuite("Postgres", () => new TrackingRepo(db));
