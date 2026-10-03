import { EventsGetInput, EventsListInput, MarketEvent, MarketEventView, NewsItem } from "@repo/contracts";
import { EventsService } from "@repo/services/events";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../../trpc";

// Owner: Track A.
const events = new EventsService();

export const eventsRouter = router({
  list: publicProcedure
    .meta({ openapi: { method: "GET", path: "/events" } })
    .input(EventsListInput)
    .output(z.array(MarketEventView))
    .query(({ input }) => events.list(input, input.asOf ? new Date(input.asOf) : new Date())),
  get: publicProcedure
    .meta({ openapi: { method: "GET", path: "/events/{eventId}" } })
    .input(EventsGetInput)
    .output(MarketEvent.extend({ topNews: z.array(NewsItem) }))
    .query(async ({ input }) => {
      const event = await events.get(input.eventId);
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "No such event." });
      return event;
    }),
});
