import { doublePrecision, integer, pgTable, text } from "drizzle-orm/pg-core";

export const refineries = pgTable("refineries", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  company: text("company").notNull(),
  ticker: text("ticker"),
  state: text("state").notNull(),
  padd: integer("padd").notNull(),
  lat: doublePrecision("lat").notNull(),
  lon: doublePrecision("lon").notNull(),
  capacityBpd: integer("capacity_bpd").notNull(),
});

export type RefineryRow = typeof refineries.$inferSelect;
export type NewRefineryRow = typeof refineries.$inferInsert;
