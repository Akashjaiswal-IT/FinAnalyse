import { jsonb, pgTable, uuid } from "drizzle-orm/pg-core";
import { tstz } from "./columns";

export const backtests = pgTable("backtests", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: tstz("created_at").notNull().defaultNow(),
  config: jsonb("config").notNull(),
  metrics: jsonb("metrics").notNull(),
  predictions: jsonb("predictions").notNull(),
});

export type BacktestRow = typeof backtests.$inferSelect;
export type NewBacktestRow = typeof backtests.$inferInsert;
