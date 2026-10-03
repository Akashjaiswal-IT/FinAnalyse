import { PortfolioGetInput, PortfolioSnapshot } from "@repo/contracts";
import { PortfolioError, PortfolioService } from "@repo/services/portfolio";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../../trpc";

// Owner: Track A.
const portfolio = new PortfolioService();

export const portfolioRouter = router({
  get: publicProcedure
    .meta({ openapi: { method: "GET", path: "/portfolio" } })
    .input(PortfolioGetInput)
    .output(PortfolioSnapshot)
    .query(async ({ input }) => {
      try {
        return await portfolio.snapshot(null, input.asOf ? new Date(input.asOf) : new Date());
      } catch (error) {
        if (error instanceof PortfolioError) throw new TRPCError({ code: "NOT_FOUND", message: error.message });
        throw error;
      }
    }),
});
