import { bigint, date, doublePrecision, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { instruments } from "./instrument";

/** FRED factors store the value in all four prices and in `adj_close` (SPEC 6). */
export const priceBars = pgTable(
  "price_bars",
  {
    symbol: text("symbol")
      .notNull()
      .references(() => instruments.symbol, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    open: doublePrecision("open").notNull(),
    high: doublePrecision("high").notNull(),
    low: doublePrecision("low").notNull(),
    close: doublePrecision("close").notNull(),
    adjClose: doublePrecision("adj_close").notNull(),
    volume: bigint("volume", { mode: "number" }),
  },
  (t) => [primaryKey({ columns: [t.symbol, t.date] })],
);

export type PriceBarRow = typeof priceBars.$inferSelect;
export type NewPriceBarRow = typeof priceBars.$inferInsert;
