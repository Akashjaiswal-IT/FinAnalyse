import { z } from "zod";
import { IsoDate, IsoDateTime } from "./common";
import { EventType, NewsEventType } from "./event";

export const SourceName = z.enum([
  "tiingo",
  "fred",
  "alphavantage",
  "eia",
  "gdelt",
  "googlenews",
  "nhc",
  "openmeteo",
  "pinecone",
  "anthropic",
]);
export type SourceName = z.infer<typeof SourceName>;

export const SourceHealth = z.enum(["ok", "degraded", "rate_limited", "down"]);
export type SourceHealth = z.infer<typeof SourceHealth>;

export const SourceStatus = z.object({
  source: SourceName,
  status: SourceHealth,
  lastOkAt: IsoDateTime.nullable(),
  lastErrorAt: IsoDateTime.nullable(),
  lastError: z.string().nullable(),
  lastLatencyMs: z.number().nullable(),
});
export type SourceStatus = z.infer<typeof SourceStatus>;

export const SystemStatus = z.object({
  sources: z.array(SourceStatus),
  ingestLatency: z.object({
    p50Ms: z.number().nullable(),
    p95Ms: z.number().nullable(),
    count: z.number().int(),
    windowHours: z.number(),
  }),
  enrichQuota: z.object({ used: z.number().int(), max: z.number().int() }),
});
export type SystemStatus = z.infer<typeof SystemStatus>;

export const IngestNowInput = z.object({ sources: z.array(SourceName).optional() });

/** `heartbeat` is a Phase 0 addition so the stub subscription has something to yield (docs/DECISIONS.md). */
export const LiveEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heartbeat"), at: IsoDateTime }),
  z.object({
    type: z.literal("news.ingested"),
    items: z.array(z.string()),
    latencyMs: z.number(),
  }),
  z.object({
    type: z.literal("news.scored"),
    items: z.array(
      z.object({
        id: z.string(),
        sentiment: z.number(),
        relevance: z.number(),
        eventType: NewsEventType.nullable(),
      }),
    ),
  }),
  z.object({
    type: z.literal("event.detected"),
    eventId: z.string(),
    eventType: EventType,
    title: z.string(),
    articleCount: z.number().int(),
    entities: z.array(z.string()),
  }),
  z.object({
    type: z.literal("event.updated"),
    eventId: z.string(),
    eventType: EventType,
    title: z.string(),
    articleCount: z.number().int(),
    entities: z.array(z.string()),
  }),
  z.object({ type: z.literal("weather.updated"), stormIds: z.array(z.string()) }),
  z.object({
    type: z.literal("source.status"),
    source: SourceName,
    status: SourceHealth,
    detail: z.string().nullable(),
  }),
  z.object({
    type: z.literal("prices.updated"),
    symbols: z.array(z.string()),
    date: IsoDate,
  }),
]);
export type LiveEvent = z.infer<typeof LiveEvent>;
