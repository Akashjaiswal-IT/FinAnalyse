import { MemorySaver } from "@langchain/langgraph";
import { FakeLlm } from "@repo/services/llm";
import { RunsService, type StoredEvent } from "@repo/services/runs";
import type { AnswerDraft, Plan } from "@repo/contracts";
import { type NodeEnv, type RunContext } from "./context";
import { Ledger } from "./ledger";
import { AgentRuntime } from "./runner";
import type { NodeSet } from "./graph";
import type { RunStateValue } from "./state";

// Helpers for the agents tests. Not exported from the package.

export const NOW = new Date("2026-10-03T12:00:00.000Z");

type Handlers = ConstructorParameters<typeof FakeLlm>[0];

export function newRuntime(handlers: Handlers, nodes?: NodeSet) {
  const runs = new RunsService();
  const llm = new FakeLlm(handlers);
  const runtime = new AgentRuntime({ deps: { llm, runs, now: () => NOW }, checkpointer: new MemorySaver(), nodes });
  return { runtime, runs, llm };
}

export async function eventsOf(runs: RunsService, runId: string): Promise<StoredEvent[]> {
  return runs.eventsAfter(runId, 0);
}

export function makeEnv(llm: FakeLlm, over: Partial<RunContext> = {}): NodeEnv {
  const ledger = new Ledger();
  const ctx: RunContext = {
    runId: "run-1",
    threadId: "thread-1",
    query: "q",
    mode: "replay",
    asOf: "2022-02-25T03:00:00.000Z",
    portfolioId: null,
    replayEventId: null,
    marketEventId: null,
    ledger,
    deps: { llm, runs: new RunsService(), now: () => NOW },
    signal: new AbortController().signal,
    startedAtMs: Date.now(),
    totals: { tokensIn: 0, tokensOut: 0, costUsd: 0 },
    warnings: [],
    degraded: new Set(),
    emit: async () => undefined,
    ...over,
  };
  return { ctx, llm, evidence: (e) => ledger.add("planner", e), progress: () => undefined };
}

/** A model-shaped plan for tests; override only what a test cares about. */
export function modelPlan(over: Partial<Plan["event"]> = {}, rest: Partial<Plan> = {}): Plan {
  return {
    intent: "event_impact",
    event: {
      source: "replay", type: "geopolitical", subtype: "war", name: "Russian invasion of Ukraine", entities: [], externalNames: [],
      marketEventId: null, stormId: null, stormName: null, hypothetical: null, hypotheticalStorm: null, categoryOverride: null,
      ...over,
    },
    focusSymbols: [],
    focusSectors: [],
    horizonDays: 5,
    specialists: { weather: false, sentiment: true, macro: true, analogs: true },
    reallocation: false,
    source: "model",
    ...rest,
  };
}

/** What a well-behaved synthesizer returns for the evidence it was shown: cites real keys, writes no digits. */
export function goodDraft(user: string): AnswerDraft {
  const evidence = (JSON.parse(user) as { evidence: { key: string }[] }).evidence;
  const [a, b, c] = evidence.map((e) => e.key);
  const keys = [a, b, c].filter((k): k is string => Boolean(k));
  return {
    headline: `The event reaches the portfolio, with a scenario result of {{${keys[0]}}}.`,
    summary: `The main reading is {{${keys[0]}}} and the next is {{${keys[1] ?? keys[0]}}}.`,
    bullets: [
      { text: `First finding {{${keys[0]}}}.`, evidenceKeys: [keys[0] as string] },
      { text: `Second finding {{${keys[1] ?? keys[0]}}} and {{${keys[2] ?? keys[0]}}}.`, evidenceKeys: keys.slice(1).length ? keys.slice(1) : [keys[0] as string] },
    ],
    caveats: ["Forecasts come from past events and can be wrong."],
  };
}

export function emptyState(over: Partial<RunStateValue> = {}): RunStateValue {
  return {
    runId: "run-1", plan: null, previous: null, eventOut: null, weatherOut: null, sentimentOut: null, macroOut: null,
    analogsOut: null, riskOut: null, hedgingOut: null, draft: null, answer: null, verification: null,
    repairsUsed: 0, violations: [], history: [], ...over,
  };
}
export const ukraineQuery = "How will the Russian invasion of Ukraine affect our portfolio?";
export const idaQuery = "How will the forecasted Category 4 hurricane in the Gulf of Mexico affect our current energy holdings?";
