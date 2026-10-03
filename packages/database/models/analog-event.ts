import { sql } from "drizzle-orm";
import { check, date, index, jsonb, pgTable, real, text, varchar } from "drizzle-orm/pg-core";
import { EVENT_TYPES, inList, tstz } from "./columns";
import { storms } from "./storm";

export interface AnalogFeaturesJson {
  volZ: number | null;
  toneZ: number | null;
  vixZ: number | null;
  windKt: number | null;
  capAtRisk: number | null;
  offshoreExposure: number | null;
}

/** Log returns from t0 per symbol; null where data is missing. */
export type ReactionsJson = Record<string, { d1: number | null; d5: number | null; d20: number | null }>;

/** Historical events of every type (SPEC 6, 10.5). */
export const analogEvents = pgTable(
  "analog_events",
  {
    id: text("id").primaryKey(),
    type: varchar("type", { length: 32 }).notNull(),
    subtype: varchar("subtype", { length: 32 }),
    name: text("name").notNull(),
    stormId: text("storm_id").references(() => storms.id),
    firstReportAt: tstz("first_report_at").notNull(),
    featureAt: tstz("feature_at").notNull(),
    t0: date("t0", { mode: "string" }).notNull(),
    landfallAt: tstz("landfall_at"),
    region: varchar("region", { length: 64 }),
    entities: text("entities").array().notNull().default(sql`'{}'::text[]`),
    affectedSectors: text("affected_sectors").array().notNull().default(sql`'{}'::text[]`),
    gdeltQuery: text("gdelt_query").notNull(),
    features: jsonb("features").$type<AnalogFeaturesJson>().notNull(),
    companyCapAtRisk: jsonb("company_cap_at_risk").$type<Record<string, number>>(),
    reactions: jsonb("reactions").$type<ReactionsJson>().notNull(),
    realizedUntil: date("realized_until", { mode: "string" }).notNull(),
    outageDays: real("outage_days"),
    description: text("description").notNull(),
    sources: jsonb("sources").$type<string[]>().notNull().default([]),
  },
  (t) => [
    check("analog_events_type_check", inList(t.type, EVENT_TYPES)),
    index("analog_events_realized_until_idx").on(t.realizedUntil),
  ],
);

export type AnalogEventRow = typeof analogEvents.$inferSelect;
export type NewAnalogEventRow = typeof analogEvents.$inferInsert;
