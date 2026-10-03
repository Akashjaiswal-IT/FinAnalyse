import { boolean, check, doublePrecision, jsonb, pgTable, primaryKey, text, uuid, varchar } from "drizzle-orm/pg-core";
import { inList, tstz } from "./columns";
import { runs } from "./run";

export const evidence = pgTable(
  "evidence",
  {
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 16 }).notNull(),
    kind: varchar("kind", { length: 32 }).notNull(),
    label: text("label").notNull(),
    value: doublePrecision("value"),
    textValue: text("text_value"),
    unit: varchar("unit", { length: 16 }),
    basis: varchar("basis", { length: 16 }).notNull(),
    source: varchar("source", { length: 64 }).notNull(),
    sourceRef: text("source_ref"),
    asOf: tstz("as_of"),
    stale: boolean("stale").notNull().default(false),
    producedBy: varchar("produced_by", { length: 32 }).notNull(),
    payload: jsonb("payload"),
  },
  (t) => [
    primaryKey({ columns: [t.runId, t.key] }),
    check("evidence_basis_check", inList(t.basis, ["observed", "computed", "model", "assumption"])),
  ],
);

export type EvidenceRow = typeof evidence.$inferSelect;
export type NewEvidenceRow = typeof evidence.$inferInsert;
