import { AnalogEvent, AnalogsListInput } from "@repo/contracts";
import { AnalogsService } from "@repo/services/analogs";
import { z } from "../../schema";
import { publicProcedure, router } from "../../trpc";

// Owner: Track A.
const analogs = new AnalogsService();

export const analogsRouter = router({
  list: publicProcedure
    .meta({ openapi: { method: "GET", path: "/analogs" } })
    .input(AnalogsListInput)
    .output(z.array(AnalogEvent))
    .query(({ input }) => analogs.list(input.type)),
});
