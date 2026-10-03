import { check, doublePrecision, index, integer, pgTable, primaryKey, text, varchar } from "drizzle-orm/pg-core";
import { inList, tstz } from "./columns";
import { storms } from "./storm";

export const stormPoints = pgTable(
  "storm_points",
  {
    stormId: text("storm_id")
      .notNull()
      .references(() => storms.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 16 }).notNull(),
    issuedAt: tstz("issued_at").notNull(),
    validAt: tstz("valid_at").notNull(),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    windKt: integer("wind_kt").notNull(),
    pressureMb: integer("pressure_mb"),
    status: varchar("status", { length: 8 }),
    recordId: varchar("record_id", { length: 4 }),
  },
  (t) => [
    primaryKey({ columns: [t.stormId, t.kind, t.issuedAt, t.validAt] }),
    check("storm_points_kind_check", inList(t.kind, ["observed", "forecast"])),
    index("storm_points_valid_at_idx").on(t.validAt),
  ],
);

export type StormPointRow = typeof stormPoints.$inferSelect;
export type NewStormPointRow = typeof stormPoints.$inferInsert;
