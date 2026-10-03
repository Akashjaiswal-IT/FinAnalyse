import { sql } from "drizzle-orm";
import { boolean, check, index, jsonb, pgTable, real, text, uuid, varchar } from "drizzle-orm/pg-core";
import { EVENT_TYPES, NEWS_SOURCES, inList, tstz } from "./columns";
import { marketEvents } from "./market-event";

export const newsItems = pgTable(
  "news_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: varchar("source", { length: 16 }).notNull(),
    url: text("url").notNull().unique(),
    title: text("title").notNull(),
    summary: text("summary"),
    domain: text("domain"),
    queryKey: varchar("query_key", { length: 64 }),
    publishedAt: tstz("published_at").notNull(),
    fetchedAt: tstz("fetched_at").notNull(),
    indexedAt: tstz("indexed_at"),
    prefilterMatch: boolean("prefilter_match").notNull(),
    tickers: text("tickers").array().notNull().default(sql`'{}'::text[]`),
    peerTickers: text("peer_tickers").array().notNull().default(sql`'{}'::text[]`),
    topics: text("topics").array().notNull().default(sql`'{}'::text[]`),
    sourceSentiment: real("source_sentiment"),
    tickerSentiment: jsonb("ticker_sentiment").$type<Record<string, number>>(),
    sentiment: real("sentiment"),
    relevance: real("relevance"),
    eventType: varchar("event_type", { length: 32 }),
    entitySentiment: jsonb("entity_sentiment").$type<Record<string, number>>(),
    factorDirections: jsonb("factor_directions").$type<Record<string, string>>(),
    marketEventId: uuid("market_event_id").references(() => marketEvents.id, { onDelete: "set null" }),
    scoredAt: tstz("scored_at"),
    scoreModel: varchar("score_model", { length: 64 }),
  },
  (t) => [
    check("news_items_source_check", inList(t.source, NEWS_SOURCES)),
    check("news_items_event_type_check", inList(t.eventType, [...EVENT_TYPES, "none"])),
    check("news_items_sentiment_check", sql`${t.sentiment} between -1 and 1`),
    check("news_items_relevance_check", sql`${t.relevance} between 0 and 1`),
    index("news_items_published_idx").on(t.publishedAt.desc()),
    index("news_items_event_type_published_idx").on(t.eventType, t.publishedAt.desc()),
  ],
);

export type NewsItemRow = typeof newsItems.$inferSelect;
export type NewNewsItemRow = typeof newsItems.$inferInsert;
