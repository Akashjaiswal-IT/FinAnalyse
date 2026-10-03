import { doublePrecision, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { tstz } from "./columns";

/** `name` is unique so the seed can upsert the demo portfolio by name. */
export const portfolios = pgTable("portfolios", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  nav: doublePrecision("nav").notNull(),
  createdAt: tstz("created_at").notNull().defaultNow(),
});

export type PortfolioRow = typeof portfolios.$inferSelect;
export type NewPortfolioRow = typeof portfolios.$inferInsert;
