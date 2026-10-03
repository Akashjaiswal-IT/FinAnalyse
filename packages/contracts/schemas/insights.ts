import { z } from "zod";
import { Confidence, IsoDateTime } from "./common";
import { EventType, ExposureChannel, FactorDirection } from "./event";

/** How long a holding is meant to be kept: tactical positions are judged on days, core positions on weeks. */
export const Horizon = z.enum(["short", "long"]);
export type Horizon = z.infer<typeof Horizon>;

export const AlertSeverity = z.enum(["info", "watch", "warning", "critical"]);
export type AlertSeverity = z.infer<typeof AlertSeverity>;

/** A news item behind an alert or an idea, with the link the user can open. */
export const InsightSource = z.object({
  title: z.string(),
  url: z.string(),
  domain: z.string().nullable(),
  publishedAt: IsoDateTime,
  sentiment: z.number().min(-1).max(1).nullable(),
});
export type InsightSource = z.infer<typeof InsightSource>;

/**
 * Raised without a question when news about an event reaches a holding (the alert feed). `marketEventId` opens a
 * live analysis; `replayPresetId` opens the same analysis on a past event.
 */
export const Alert = z.object({
  id: z.string(),
  raisedAt: IsoDateTime,
  severity: AlertSeverity,
  eventType: EventType,
  title: z.string(),
  summary: z.string(),
  holdings: z.array(z.object({ symbol: z.string(), channel: ExposureChannel, expected: FactorDirection })).min(1),
  articleCount: z.number().int(),
  confidence: Confidence,
  sources: z.array(InsightSource),
  marketEventId: z.string().nullable(),
  replayPresetId: z.string().nullable(),
});
export type Alert = z.infer<typeof Alert>;

/** A buy or sell suggestion for the paper portfolio, with its reason and the numbers behind it. */
export const Idea = z.object({
  id: z.string(),
  side: z.enum(["buy", "sell"]),
  symbol: z.string(),
  horizon: Horizon,
  confidence: Confidence,
  headline: z.string(),
  reasons: z.array(z.string()).min(1),
  /** Forecast 5-day (short) or 20-day (long) log return and its weighted spread. */
  expectedMove: z.object({ mean: z.number(), spread: z.number() }),
  /** One-day 95% VaR of the portfolio before and after the trade, USD. */
  varBefore: z.number(),
  varAfter: z.number(),
  sizeUsd: z.number(),
  sources: z.array(InsightSource),
});
export type Idea = z.infer<typeof Idea>;
