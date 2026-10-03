import { MemorySaver } from "@langchain/langgraph";
import { FakeLlm } from "@repo/services/llm";
import { RunsService, type StoredEvent } from "@repo/services/runs";
import type { AnswerDraft, Plan } from "@repo/contracts";
import { type NodeEnv, type RunContext } from "./context";
import { Ledger } from "./ledger";
import { AgentRuntime } from "./runner";
import { fakeServices, type Scenario } from "./fakes";
import { fixtureNodes, type NodeSet } from "./graph";
import type { RunStateValue } from "./state";

// Helpers for the agents tests. Not exported from the package.

export const NOW = new Date("2026-10-03T12:00:00.000Z");

type Handlers = ConstructorParameters<typeof FakeLlm>[0];

export function newRuntime(handlers: Handlers, nodes?: NodeSet, scenario: Scenario = "ukraine") {
  const runs = new RunsService();
  const llm = new FakeLlm(handlers);
  const runtime = new AgentRuntime({ deps: { llm, runs, now: () => NOW, ...fakeServices(scenario) }, checkpointer: new MemorySaver(), nodes: nodes ?? fixtureNodes() });
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
    deps: { llm, runs: new RunsService(), now: () => NOW, ...fakeServices() },
    signal: new AbortController().signal,
    startedAtMs: Date.now(),
    totals: { tokensIn: 0, tokensOut: 0, costUsd: 0 },
    warnings: [],
    memo: new Map(),
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

type Call = { user: string };

const evidenceOf = (call: Call) => (JSON.parse(call.user) as { evidence: { key: string; label: string }[] }).evidence;

/** What a well-behaved synthesizer returns for the evidence it was shown: cites real keys, writes no digits. */
export function goodDraft(user: string, cite = 3): AnswerDraft {
  const evidence = (JSON.parse(user) as { evidence: { key: string }[] }).evidence;
  const keys = evidence.map((e) => e.key);
  const first = keys[0] as string;
  const groups: string[][] = [];
  for (let i = 0; i < Math.max(cite, 3); i += 3) groups.push(keys.slice(i, i + 3));
  return {
    headline: `The event reaches the portfolio, with a scenario result of {{${first}}}.`,
    summary: `The main reading is {{${first}}} and the next is {{${keys[1] ?? first}}}.`,
    bullets: groups.filter((g) => g.length > 0).map((g, n) => ({ text: `Finding ${["one", "two", "three", "four", "five", "six"][n] ?? "more"}: ${g.map((k) => `{{${k}}}`).join(" and ")}.`, evidenceKeys: g })),
    caveats: ["Forecasts come from past events and can be wrong."],
  };
}

/** A specialist note over the first evidence rows it was shown. */
export function goodNotes(call: Call) {
  const [a, b] = evidenceOf(call);
  const keys = [a, b].filter((e): e is NonNullable<typeof a> => Boolean(e)).map((e) => e.key);
  return { findings: [{ template: `The reading is ${keys.map((k) => `{{${k}}}`).join(" and ")}.`, evidenceKeys: keys }] };
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
