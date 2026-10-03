import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, real, text, uuid, varchar } from "drizzle-orm/pg-core";
import { analogEvents } from "./analog-event";
import { inList, tstz } from "./columns";
import { marketEvents } from "./market-event";
import { threads } from "./thread";

/** jsonb columns are validated with `@repo/contracts` schemas by `services/runs` (SPEC 6). */
export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    mode: varchar("mode", { length: 16 }).notNull(),
    asOf: tstz("as_of").notNull(),
    replayEventId: text("replay_event_id").references(() => analogEvents.id),
    marketEventId: uuid("market_event_id").references(() => marketEvents.id, { onDelete: "set null" }),
    status: varchar("status", { length: 16 }).notNull(),
    plan: jsonb("plan"),
    eventProfile: jsonb("event_profile"),
    answer: jsonb("answer"),
    hedgePlan: jsonb("hedge_plan"),
    risk: jsonb("risk"),
    forecast: jsonb("forecast"),
    verification: jsonb("verification"),
    confidence: varchar("confidence", { length: 8 }),
    warnings: jsonb("warnings").$type<string[]>().notNull().default([]),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    costUsd: real("cost_usd").notNull().default(0),
    startedAt: tstz("started_at").notNull().defaultNow(),
    finishedAt: tstz("finished_at"),
    error: text("error"),
  },
  (t) => [
    check("runs_query_length_check", sql`char_length(${t.query}) <= 500`),
    check("runs_mode_check", inList(t.mode, ["live", "replay"])),
    check("runs_status_check", inList(t.status, ["running", "succeeded", "partial", "failed"])),
    check("runs_confidence_check", inList(t.confidence, ["low", "medium", "high"])),
    index("runs_thread_started_idx").on(t.threadId, t.startedAt),
  ],
);

export type RunRow = typeof runs.$inferSelect;
export type NewRunRow = typeof runs.$inferInsert;
