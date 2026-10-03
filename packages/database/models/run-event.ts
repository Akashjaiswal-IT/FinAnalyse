import { integer, jsonb, pgTable, primaryKey, uuid, varchar } from "drizzle-orm/pg-core";
import { tstz } from "./columns";
import { runs } from "./run";

/** Append-only; the drilldown and stream resume read it (SPEC 6). */
export const runEvents = pgTable(
  "run_events",
  {
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    type: varchar("type", { length: 32 }).notNull(),
    node: varchar("node", { length: 32 }),
    payload: jsonb("payload").notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.seq] })],
);

export type RunEventRow = typeof runEvents.$inferSelect;
export type NewRunEventRow = typeof runEvents.$inferInsert;
