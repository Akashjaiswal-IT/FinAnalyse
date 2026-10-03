import { z } from "zod";

export const IsoDateTime = z.iso.datetime();
export const IsoDate = z.iso.date();

export const Mode = z.enum(["live", "replay"]);
export type Mode = z.infer<typeof Mode>;

export const Confidence = z.enum(["low", "medium", "high"]);
export type Confidence = z.infer<typeof Confidence>;

export const Unit = z.enum([
  "pct",
  "pct_signed",
  "usd",
  "kt",
  "bpd",
  "days",
  "score",
  "z",
  "ratio",
  "count",
  "category",
  "date",
  "text",
]);
export type Unit = z.infer<typeof Unit>;

export const NodeName = z.enum([
  "planner",
  "event",
  "weather",
  "sentiment",
  "macro",
  "analogs",
  "risk",
  "hedging",
  "synthesizer",
  "verifier",
]);
export type NodeName = z.infer<typeof NodeName>;

export const NodeStatus = z.enum(["done", "skipped", "degraded"]);
export type NodeStatus = z.infer<typeof NodeStatus>;

/** Returned by a node for an input it could not read. Nodes never substitute invented values. */
export const Unavailable = z.object({
  status: z.literal("unavailable"),
  reason: z.string(),
});
export type Unavailable = z.infer<typeof Unavailable>;

export const Skipped = z.object({ status: z.literal("skipped") });
export type Skipped = z.infer<typeof Skipped>;

/** Text authored with `{{E12}}` placeholders plus the server-side rendering of it. */
export const TemplateText = z.object({
  template: z.string(),
  rendered: z.string(),
});
export type TemplateText = z.infer<typeof TemplateText>;

export const Sector = z.enum([
  "energy",
  "refiner",
  "commodity_proxy",
  "gold",
  "tech",
  "semis",
  "banks",
  "defense",
  "aerospace",
  "airlines",
  "consumer",
  "rates",
  "fx",
  "china",
  "agriculture",
  "market",
  "factor",
]);
export type Sector = z.infer<typeof Sector>;

export const AssetClass = z.enum(["equity", "etf", "commodity"]);
export type AssetClass = z.infer<typeof AssetClass>;
