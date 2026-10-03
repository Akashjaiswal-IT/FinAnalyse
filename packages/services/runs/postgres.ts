import { db } from "@repo/database";
import { RunsService } from "./index";
import { DrizzleRunsRepo } from "./drizzle";

/** The runs service on the shared Postgres connection, for the api process. */
export const createPostgresRuns = () => new RunsService(new DrizzleRunsRepo(db));
