import type {
  Confidence,
  EventType,
  EvidenceBasis,
  ExposureChannel,
  FactorDirection,
  Severity,
  SourceHealth,
} from "@repo/contracts";
import type { NodeVisualStatus } from "./run-state";

// Tailwind classes for the semantic colours defined in globals.css. Colour carries meaning here:
// amber = direct/primary, blue = factor/info, violet = model output, green/red = direction, never decoration.

export const EVENT_TYPE_TONE: Record<EventType, string> = {
  geopolitical: "border-negative/40 bg-negative/10 text-negative",
  policy: "border-info/40 bg-info/10 text-info",
  macro: "border-warning/40 bg-warning/10 text-warning",
  statement: "border-model/40 bg-model/10 text-model",
  accident: "border-warning/40 bg-warning/10 text-warning",
  disaster: "border-negative/40 bg-negative/10 text-negative",
  corporate: "border-info/40 bg-info/10 text-info",
  supply_shock: "border-model/40 bg-model/10 text-model",
};

export const SEVERITY_TONE: Record<Severity, string> = {
  low: "border-border bg-muted text-muted-foreground",
  medium: "border-warning/40 bg-warning/10 text-warning",
  high: "border-negative/40 bg-negative/10 text-negative",
};

export const CONFIDENCE_TONE: Record<Confidence, string> = {
  low: "border-negative/40 bg-negative/10 text-negative",
  medium: "border-warning/40 bg-warning/10 text-warning",
  high: "border-positive/40 bg-positive/10 text-positive",
};

/** Evidence basis tells the reader how much to trust a number at a glance. */
export const BASIS_TONE: Record<EvidenceBasis, string> = {
  observed: "border-positive/40 bg-positive/10 text-positive",
  computed: "border-info/40 bg-info/10 text-info",
  model: "border-model/40 bg-model/10 text-model",
  assumption: "border-warning/40 bg-warning/10 text-warning",
};

export const CHANNEL_TONE: Record<ExposureChannel, string> = {
  direct: "border-primary/50 bg-primary/15 text-primary",
  peer: "border-model/40 bg-model/10 text-model",
  factor: "border-info/40 bg-info/10 text-info",
};

export const NODE_TONE: Record<NodeVisualStatus, { border: string; text: string; dot: string }> = {
  pending: { border: "border-border", text: "text-muted-foreground", dot: "bg-muted-foreground/40" },
  running: { border: "border-info", text: "text-info", dot: "bg-info" },
  done: { border: "border-positive/60", text: "text-positive", dot: "bg-positive" },
  skipped: { border: "border-dashed border-border", text: "text-muted-foreground", dot: "bg-muted-foreground/40" },
  degraded: { border: "border-warning", text: "text-warning", dot: "bg-warning" },
  failed: { border: "border-negative", text: "text-negative", dot: "bg-negative" },
};

export const HEALTH_TONE: Record<SourceHealth, string> = {
  ok: "text-positive",
  degraded: "text-warning",
  rate_limited: "text-warning",
  down: "text-negative",
};

export const DIRECTION_GLYPH: Record<FactorDirection, { glyph: string; tone: string; label: string }> = {
  up: { glyph: "▲", tone: "text-positive", label: "up" },
  down: { glyph: "▼", tone: "text-negative", label: "down" },
  unclear: { glyph: "–", tone: "text-muted-foreground", label: "unclear" },
};

/** Colour for a signed value the server sent (1-day change, sentiment, P&L). Zero stays neutral. */
export function signTone(value: number | null): string {
  if (value === null || value === 0) return "text-muted-foreground";
  return value > 0 ? "text-positive" : "text-negative";
}
