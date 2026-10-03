import { NewsItem, NewsListInput } from "@repo/contracts";
import { NewsService } from "@repo/services/news";
import { z } from "../../schema";
import { publicProcedure, router } from "../../trpc";

// Owner: Track A.
const news = new NewsService();

export const newsRouter = router({
  list: publicProcedure
    .meta({ openapi: { method: "GET", path: "/news" } })
    .input(NewsListInput)
    .output(z.array(NewsItem))
    .query(({ input }) =>
      news.list({
        asOf: input.asOf ? new Date(input.asOf) : new Date(),
        ticker: input.ticker,
        eventType: input.eventType,
        limit: input.limit,
        before: input.before ? new Date(input.before) : undefined,
      }),
    ),
});
