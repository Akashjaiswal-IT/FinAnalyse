import { sql } from "drizzle-orm";
import { check, doublePrecision, integer, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { inList, tstz } from "./columns";
import { instruments } from "./instrument";
import { portfolios } from "./portfolio";
import { runs } from "./run";

/** P2: "Apply to paper portfolio" writes one row per action. Nothing is sent to a broker. */
export const trades = pgTable(
  "trades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => runs.id, { onDelete: "set null" }),
    symbol: text("symbol")
      .notNull()
      .references(() => instruments.symbol),
    side: varchar("side", { length: 8 }).notNull(),
    quantity: integer("quantity").notNull(),
    price: doublePrecision("price").notNull(),
    executedAt: tstz("executed_at").notNull().defaultNow(),
  },
  (t) => [
    check("trades_side_check", inList(t.side, ["buy", "sell"])),
    check("trades_quantity_check", sql`${t.quantity} > 0`),
  ],
);

export type TradeRow = typeof trades.$inferSelect;
export type NewTradeRow = typeof trades.$inferInsert;
