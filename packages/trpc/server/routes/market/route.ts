import { Instrument, MarketBarsInput, PriceBar } from "@repo/contracts";
import { MarketService } from "@repo/services/market";
import { z, zodUndefinedModel } from "../../schema";
import { publicProcedure, router } from "../../trpc";

// Owner: Track A.
const market = new MarketService();

export const marketRouter = router({
  instruments: publicProcedure
    .meta({ openapi: { method: "GET", path: "/market/instruments" } })
    .input(zodUndefinedModel)
    .output(z.array(Instrument))
    .query(() => market.instruments()),

  bars: publicProcedure
    .meta({ openapi: { method: "GET", path: "/market/bars" } })
    .input(MarketBarsInput)
    .output(z.array(PriceBar))
    .query(({ input }) => market.bars(input.symbol, input.from, input.asOf ? new Date(input.asOf) : new Date())),
});
