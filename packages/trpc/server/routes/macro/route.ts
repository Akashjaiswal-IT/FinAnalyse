import { MacroSnapshot, MacroSnapshotInput } from "@repo/contracts";
import { MacroService } from "@repo/services/macro";
import { publicProcedure, router } from "../../trpc";

// Owner: Track A.
const macro = new MacroService();

export const macroRouter = router({
  snapshot: publicProcedure
    .meta({ openapi: { method: "GET", path: "/macro" } })
    .input(MacroSnapshotInput)
    .output(MacroSnapshot)
    .query(({ input }) => macro.snapshot(input.asOf ? new Date(input.asOf) : new Date())),
});
