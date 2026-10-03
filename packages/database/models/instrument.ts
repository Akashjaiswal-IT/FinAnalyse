import { boolean, check, pgTable, text, varchar } from "drizzle-orm/pg-core";
import { inList } from "./columns";

export const instruments = pgTable(
  "instruments",
  {
    symbol: text("symbol").primaryKey(),
    name: text("name").notNull(),
    assetClass: varchar("asset_class", { length: 16 }).notNull(),
    sector: varchar("sector", { length: 32 }),
    tradable: boolean("tradable").notNull(),
    source: varchar("source", { length: 16 }).notNull(),
    sourceRef: text("source_ref"),
    proxyFor: varchar("proxy_for", { length: 32 }),
  },
  (t) => [
    check("instruments_asset_class_check", inList(t.assetClass, ["equity", "etf", "commodity"])),
    check("instruments_source_check", inList(t.source, ["tiingo", "fred"])),
  ],
);

export type InstrumentRow = typeof instruments.$inferSelect;
export type NewInstrumentRow = typeof instruments.$inferInsert;
