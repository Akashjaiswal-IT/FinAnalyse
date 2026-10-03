import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, real, text, uuid, varchar } from "drizzle-orm/pg-core";
import { EVENT_TYPES, inList, tstz } from "./columns";

/** Live events found by detection (SPEC 5.14). */
export const marketEvents = pgTable(
  "market_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: varchar("type", { length: 32 }).notNull(),
    subtype: varchar("subtype", { length: 32 }),
    title: text("title").notNull(),
    firstSeenAt: tstz("first_seen_at").notNull(),
    lastSeenAt: tstz("last_seen_at").notNull(),
    articleCount: integer("article_count").notNull(),
    domainCount: integer("domain_count").notNull(),
    clusterZ: real("cluster_z"),
    gdeltQuery: text("gdelt_query").notNull(),
    volZ: real("vol_z"),
    toneZ: real("tone_z"),
    entities: text("entities").array().notNull().default(sql`'{}'::text[]`),
    factorDirections: jsonb("factor_directions").$type<Record<string, string>>().notNull().default({}),
    status: varchar("status", { length: 16 }).notNull(),
    topNewsIds: uuid("top_news_ids").array().notNull().default(sql`'{}'::uuid[]`),
  },
  (t) => [
    check("market_events_type_check", inList(t.type, EVENT_TYPES)),
    check("market_events_status_check", inList(t.status, ["active", "faded"])),
    index("market_events_first_seen_idx").on(t.firstSeenAt.desc()),
  ],
);

export type MarketEventRow = typeof marketEvents.$inferSelect;
export type NewMarketEventRow = typeof marketEvents.$inferInsert;
