import { check, integer, pgTable, text, varchar } from "drizzle-orm/pg-core";
import { inList } from "./columns";

export const storms = pgTable(
  "storms",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    season: integer("season").notNull(),
    source: varchar("source", { length: 16 }).notNull(),
  },
  (t) => [check("storms_source_check", inList(t.source, ["hurdat2", "nhc"]))],
);

export type StormRow = typeof storms.$inferSelect;
export type NewStormRow = typeof storms.$inferInsert;
