import { Backtest } from "@repo/contracts";
import type { BacktestService } from "@repo/services/backtest";
import { zodUndefinedModel } from "../../schema";
import { publicProcedure, router } from "../../trpc";

// Owner: Track C.

/** The service is created on the first request, so importing the router never opens a database connection. */
let postgres: Promise<BacktestService> | undefined;
const defaultService = (): Promise<BacktestService> => {
  postgres ??= import("@repo/services/backtest/postgres").then((m) => m.createPostgresBacktests());
  return postgres;
};

/** `getService` is injectable so the route can be tested without Postgres. */
export const createBacktestRouter = (getService: () => Promise<BacktestService>) =>
  router({
    // The newest leave-one-out backtest (SPEC 7), or null before `pnpm backtest --save` has run once: the
    // reliability page shows its empty state.
    latest: publicProcedure
      .meta({
        openapi: {
          method: "GET",
          path: "/backtest/latest",
          tags: ["backtest"],
          summary: "The newest leave-one-out backtest, or null when none was saved",
        },
      })
      .input(zodUndefinedModel)
      .output(Backtest.nullable())
      .query(async () => (await getService()).latest()),
  });

export const backtestRouter = createBacktestRouter(defaultService);
