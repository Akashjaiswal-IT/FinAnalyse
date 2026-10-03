import { TRPCError, tracked } from "@trpc/server";
import {
  RunsCreateInput,
  RunsCreateOutput,
  RunsGetInput,
  RunsGetOutput,
  RunsListInput,
  RunsListOutput,
  RunsStreamInput,
} from "@repo/contracts";
import { InvalidRunError, ThreadBusyError, TooManyRunsError } from "@repo/agents";
import { RunNotFoundError, ThreadNotFoundError } from "@repo/services/runs";
import { publicProcedure, router } from "../../trpc";
import { apiRuntime, requireDemoToken } from "../../runtime";

function mapError(err: unknown): never {
  if (err instanceof TooManyRunsError || err instanceof ThreadBusyError) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: err.message });
  }
  if (err instanceof InvalidRunError) throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
  if (err instanceof ThreadNotFoundError || err instanceof RunNotFoundError) {
    throw new TRPCError({ code: "NOT_FOUND", message: err.message });
  }
  throw err;
}

export const runsRouter = router({
  create: publicProcedure
    .meta({ openapi: { method: "POST", path: "/runs", tags: ["runs"], summary: "Start a run; returns at once" } })
    .input(RunsCreateInput)
    .output(RunsCreateOutput)
    .mutation(async ({ ctx, input }) => {
      requireDemoToken(ctx.demoToken);
      try {
        return await apiRuntime().agents.start(input);
      } catch (err) {
        return mapError(err);
      }
    }),

  get: publicProcedure
    .meta({ openapi: { method: "GET", path: "/runs/{runId}", tags: ["runs"] } })
    .input(RunsGetInput)
    .output(RunsGetOutput)
    .query(async ({ input }) => {
      const found = await apiRuntime().runs.get(input.runId);
      if (!found) throw new TRPCError({ code: "NOT_FOUND", message: `run ${input.runId} not found` });
      return found;
    }),

  list: publicProcedure
    .meta({ openapi: { method: "GET", path: "/runs", tags: ["runs"] } })
    .input(RunsListInput)
    .output(RunsListOutput)
    .query(({ input }) => apiRuntime().runs.list(input)),

  // Stored events after `lastEventId`, then live ones, until the run ends. Each event is tracked by its
  // seq, so a reconnect resumes where it stopped (SPEC 5.13).
  stream: publicProcedure.input(RunsStreamInput).subscription(async function* ({ input, signal }) {
    const last = Number(input.lastEventId ?? 0);
    try {
      for await (const stored of apiRuntime().runs.stream(input.runId, Number.isFinite(last) ? last : 0, signal)) {
        yield tracked(String(stored.seq), stored.event);
      }
    } catch (err) {
      mapError(err);
    }
  }),
});
