import { z } from "zod";
import { ReducedValue, StateSchema } from "@langchain/langgraph";
import type {
  Answer,
  AnalogsOutput,
  AnswerDraft,
  Confidence,
  EventOutput,
  HedgingOutput,
  MacroOutput,
  Plan,
  RiskOutput,
  SentimentOutput,
  Verification,
  WeatherOutput,
} from "@repo/contracts";

/** One entry per finished run: the planner of a follow-up reads these (SPEC 5.5, rule 5). */
export const HistoryEntry = z.object({ runId: z.string(), query: z.string(), headline: z.string() });
export type HistoryEntry = z.infer<typeof HistoryEntry>;

/** A draft answer on its way to the verifier. `source: "template"` is the deterministic fallback. */
export interface Draft {
  draft: AnswerDraft;
  source: Answer["source"];
  confidence: Confidence;
}

/** What a follow-up may reuse from the previous run of the thread (what-if overrides). */
export interface Previous {
  plan: Plan | null;
  event: EventOutput | null;
  weather: WeatherOutput | null;
}

// Values are held as-is (plain JSON, so they checkpoint). The contracts schemas validate them at the
// boundaries, not here.
const slot = <T>() => z.custom<T | null>(() => true).default(null);

/** Only `history` has a reducer. Parallel nodes (weather, sentiment, macro) write disjoint keys. */
export const RunState = new StateSchema({
  runId: z.string().default(""),
  plan: slot<Plan>(),
  previous: slot<Previous>(),
  eventOut: slot<EventOutput>(),
  weatherOut: slot<WeatherOutput>(),
  sentimentOut: slot<SentimentOutput>(),
  macroOut: slot<MacroOutput>(),
  analogsOut: slot<AnalogsOutput>(),
  riskOut: slot<RiskOutput>(),
  hedgingOut: slot<HedgingOutput>(),
  draft: slot<Draft>(),
  answer: slot<Answer>(),
  verification: slot<Verification>(),
  repairsUsed: z.number().default(0),
  violations: z.array(z.string()).default(() => []),
  history: new ReducedValue(z.array(HistoryEntry).default(() => []), {
    inputSchema: HistoryEntry,
    reducer: (current, next) => [...current, next],
  }),
});

export type RunStateValue = typeof RunState.State;
export type RunStateUpdate = typeof RunState.Update;
