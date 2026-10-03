import { sql } from "drizzle-orm";
import { check, doublePrecision, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { instruments } from "./instrument";
import { portfolios } from "./portfolio";

/** Negative weight means short; cash = 1 - sum of weights (SPEC 6). */
export const positions = pgTable(
  "positions",
  {
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    symbol: text("symbol")
      .notNull()
      .references(() => instruments.symbol),
    targetWeight: doublePrecision("target_weight").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.portfolioId, t.symbol] }),
    check("positions_target_weight_check", sql`${t.targetWeight} <> 0`),
  ],
);

export type PositionRow = typeof positions.$inferSelect;
export type NewPositionRow = typeof positions.$inferInsert;
