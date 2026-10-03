import { date, doublePrecision, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

/** FRED rows with `"."` are skipped, so `value` is never null (SPEC 6). */
export const macroObservations = pgTable(
  "macro_observations",
  {
    seriesId: text("series_id").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    value: doublePrecision("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.seriesId, t.date] })],
);

export type MacroObservationRow = typeof macroObservations.$inferSelect;
export type NewMacroObservationRow = typeof macroObservations.$inferInsert;
