import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { tstz } from "./columns";
import { portfolios } from "./portfolio";

/** `id` is also the LangGraph `thread_id`. */
export const threads = pgTable("threads", {
  id: uuid("id").primaryKey().defaultRandom(),
  portfolioId: uuid("portfolio_id")
    .notNull()
    .references(() => portfolios.id, { onDelete: "cascade" }),
  title: text("title"),
  createdAt: tstz("created_at").notNull().defaultNow(),
});

export type ThreadRow = typeof threads.$inferSelect;
export type NewThreadRow = typeof threads.$inferInsert;
