import { IngestNowInput, SourceName, SystemStatus } from "@repo/contracts";
import { SystemService } from "@repo/services/system";
import { requireDemoToken } from "../../runtime";
import { z, zodUndefinedModel } from "../../schema";
import { publicProcedure, router } from "../../trpc";

// Owner: Track A.
const system = new SystemService();

export const systemRouter = router({
  status: publicProcedure
    .meta({ openapi: { method: "GET", path: "/system/status" } })
    .input(zodUndefinedModel)
    .output(SystemStatus)
    .query(() => system.status()),
  ingestNow: publicProcedure
    .meta({ openapi: { method: "POST", path: "/system/ingest" } })
    .input(IngestNowInput)
    .output(z.object({ queued: z.array(SourceName) }))
    .mutation(async ({ input, ctx }) => {
      requireDemoToken(ctx.demoToken);
      return { queued: await system.ingestNow(input.sources) };
    }),
});
