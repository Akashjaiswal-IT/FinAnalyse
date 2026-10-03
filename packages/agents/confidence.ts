import { MIN_TYPE_EVENTS, type AnalogsOutput, type Confidence, type EventOutput, type SentimentOutput, type WeatherOutput } from "@repo/contracts";

const LEVELS: Confidence[] = ["low", "medium", "high"];

export interface ConfidenceInput {
  event: EventOutput | null;
  sentiment: SentimentOutput | null;
  analogs: AnalogsOutput | null;
  weather: WeatherOutput | null;
  /** True when the event is a weather disaster, so the weather node counts as a core input. */
  weatherRequired: boolean;
  /** Nodes whose evidence is flagged stale. */
  staleNodes: ReadonlySet<string>;
  hypothetical: boolean;
  /** Historical events of the event's type; null when unknown. */
  typeEventCount: number | null;
}

/** Computed, never written by the model (SPEC 5.5, rule 7): start at high, drop one level per core input that
 * is unavailable or stale and when the analog effective sample is below 4; cap at medium for hypothetical
 * events and for types with fewer than MIN_TYPE_EVENTS events. */
export function computeConfidence(i: ConfidenceInput): Confidence {
  let level = 2;
  const degraded = (name: string, out: { status: string } | null) => out === null || out.status === "unavailable" || i.staleNodes.has(name);
  if (degraded("event", i.event)) level -= 1;
  if (degraded("sentiment", i.sentiment)) level -= 1;
  if (degraded("analogs", i.analogs)) level -= 1;
  if (i.weatherRequired && degraded("weather", i.weather)) level -= 1;
  if (i.analogs?.status === "ok" && i.analogs.forecast.effectiveN < 4) level -= 1;
  if (i.hypothetical || (i.typeEventCount !== null && i.typeEventCount < MIN_TYPE_EVENTS)) level = Math.min(level, 1);
  return LEVELS[Math.max(level, 0)] as Confidence;
}
