import { z } from "zod";
import { IsoDateTime, Sector } from "./common";

// The market event is the centre of the design (SPEC 5.14).

export const EventType = z.enum([
  "geopolitical",
  "policy",
  "macro",
  "statement",
  "accident",
  "disaster",
  "corporate",
  "supply_shock",
]);
export type EventType = z.infer<typeof EventType>;

/** Event type of a news item; `none` marks news that is not about a market-moving event. */
export const NewsEventType = z.enum([...EventType.options, "none"]);
export type NewsEventType = z.infer<typeof NewsEventType>;

export const FactorName = z.enum(["MARKET", "WTI", "HH_NATGAS", "GULF_GASOLINE", "GOLD", "RATES", "USD"]);
export type FactorName = z.infer<typeof FactorName>;

export const FactorDirection = z.enum(["up", "down", "unclear"]);
export type FactorDirection = z.infer<typeof FactorDirection>;

// Lists of entries instead of records: structured LLM output handles them reliably.
export const FactorDirectionEntry = z.object({ factor: FactorName, direction: FactorDirection });
export type FactorDirectionEntry = z.infer<typeof FactorDirectionEntry>;

export const Severity = z.enum(["low", "medium", "high"]);
export type Severity = z.infer<typeof Severity>;

/** `assumed`: news features come from the plan's severity (hypothetical events, SPEC 5.12). */
export const NewsBasis = z.enum(["observed", "assumed", "unavailable"]);
export type NewsBasis = z.infer<typeof NewsBasis>;

export const EventProfile = z.object({
  id: z.string().describe("market event id, analog id or `hypothetical`"),
  source: z.enum(["live", "replay", "hypothetical"]),
  type: EventType,
  subtype: z.string().nullable(),
  title: z.string().describe("top article title or analog name; never LLM-written"),
  firstReportAt: IsoDateTime.nullable(),
  entities: z.array(z.string()).describe("universe symbols directly involved"),
  externalNames: z.array(z.string()).describe("non-universe companies, keys of EXTERNAL_PEERS"),
  peerSymbols: z.array(z.string()),
  affectedSectors: z.array(Sector),
  factorDirections: z.array(FactorDirectionEntry),
  articleCount: z.number().int().nullable(),
  domainCount: z.number().int().nullable(),
  gdeltQuery: z.string().nullable(),
  volZ: z.number().nullable(),
  toneZ: z.number().nullable(),
  newsBasis: NewsBasis,
  severity: Severity,
  topNewsIds: z.array(z.string()),
});
export type EventProfile = z.infer<typeof EventProfile>;

/** Haiku classification of the top news hits when the event comes from a news search. */
export const EventClassification = z.object({
  type: EventType,
  subtype: z.string().nullable(),
  entities: z.array(z.string()),
  externalNames: z.array(z.string()),
  affectedSectors: z.array(Sector),
  factorDirections: z.array(FactorDirectionEntry),
});
export type EventClassification = z.infer<typeof EventClassification>;

/** A what-if event supplied by the plan; every field becomes evidence with basis `assumption`. */
export const HypotheticalEventParams = EventClassification.extend({ severity: Severity });
export type HypotheticalEventParams = z.infer<typeof HypotheticalEventParams>;

export const MarketEventStatus = z.enum(["active", "faded"]);
export type MarketEventStatus = z.infer<typeof MarketEventStatus>;

/** A live event found by detection (SPEC 5.14). */
export const MarketEvent = z.object({
  id: z.uuid(),
  type: EventType,
  subtype: z.string().nullable(),
  title: z.string(),
  firstSeenAt: IsoDateTime,
  lastSeenAt: IsoDateTime,
  articleCount: z.number().int(),
  domainCount: z.number().int(),
  clusterZ: z.number().nullable().describe("ranks the event feed only; never a forecast feature"),
  gdeltQuery: z.string(),
  volZ: z.number().nullable(),
  toneZ: z.number().nullable(),
  entities: z.array(z.string()),
  factorDirections: z.array(FactorDirectionEntry),
  status: MarketEventStatus,
  topNewsIds: z.array(z.string()),
});
export type MarketEvent = z.infer<typeof MarketEvent>;

export const ExposureChannel = z.enum(["direct", "peer", "factor"]);
export type ExposureChannel = z.infer<typeof ExposureChannel>;

export const ChannelReason = z.enum([
  "named_in_news",
  "named_in_plan",
  "capacity_at_risk",
  "peer_group",
  "external_peer",
  "shared_sector",
  "factor_beta",
]);
export type ChannelReason = z.infer<typeof ChannelReason>;

export const ChannelLink = z.object({
  channel: ExposureChannel,
  reason: ChannelReason,
  detail: z.string().describe("the peer, external name, sector or factor that matched"),
  evidenceKeys: z.array(z.string()),
});
export type ChannelLink = z.infer<typeof ChannelLink>;

export const HoldingExposure = z.object({
  symbol: z.string(),
  channels: z.array(ChannelLink).min(1),
  expectedSign: FactorDirection.describe("sign only; the size always comes from the forecast"),
});
export type HoldingExposure = z.infer<typeof HoldingExposure>;

/** `events.list` row: the event plus the held symbols it touches. */
export const MarketEventView = MarketEvent.extend({
  touchedHoldings: z.array(z.object({ symbol: z.string(), channels: z.array(ExposureChannel).min(1) })),
});
export type MarketEventView = z.infer<typeof MarketEventView>;

export const EventsListInput = z.object({
  asOf: IsoDateTime.optional(),
  type: EventType.optional(),
  status: MarketEventStatus.optional(),
});
export type EventsListInput = z.infer<typeof EventsListInput>;

export const EventsGetInput = z.object({ eventId: z.uuid() });
