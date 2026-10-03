import { describe, expect, it } from "vitest";
import { FakeLlm, fakeFailure } from "@repo/services/llm";
import type { EventType, Plan } from "@repo/contracts";
import { classifyEventByKeywords, rulePlan } from "./fallbacks";
import { plannerNode, normalizePlan } from "./nodes/planner";
import { emptyState, makeEnv, modelPlan } from "./testkit";

// One question per event type (SPEC 2, 5.14): the manager's wording, the type the planner must reach, and
// the model-shaped plan a good LLM returns for it.
const CASES: { type: EventType; subtype: string; question: string; entities: string[]; external: string[] }[] = [
  { type: "geopolitical", subtype: "war", question: "How will the Russian invasion of Ukraine affect our portfolio?", entities: [], external: [] },
  { type: "policy", subtype: "tariff", question: "What does the new US tariff package mean for our tech holdings?", entities: [], external: [] },
  { type: "macro", subtype: "rates", question: "How would a surprise rate hike affect our bank and bond holdings?", entities: [], external: [] },
  { type: "statement", subtype: "central_bank", question: "The Fed chair said rates will stay higher for longer: what does that mean for us?", entities: [], external: [] },
  { type: "accident", subtype: "industrial", question: "Our competitor just had a refinery explosion: what is our exposure?", entities: [], external: [] },
  { type: "disaster", subtype: "hurricane", question: "How will the forecasted Category 4 hurricane in the Gulf of Mexico affect our current energy holdings?", entities: [], external: [] },
  { type: "corporate", subtype: "failure", question: "Silicon Valley Bank just collapsed: how does that hit JPM and BAC?", entities: ["JPM", "BAC"], external: ["Silicon Valley Bank"] },
  { type: "supply_shock", subtype: "production_cut", question: "OPEC+ just announced a surprise production cut: what happens to XOM and our energy holdings?", entities: ["XOM"], external: [] },
];

const base = (question: string, over: Partial<Parameters<typeof rulePlan>[0]> = {}) => ({
  query: question, mode: "replay" as const, replayEventId: null, marketEventId: null, previousPlan: null, ...over,
});

describe.each(CASES)("planner: $type", ({ type, subtype, question, entities, external }) => {
  it("the rule-based plan reaches the right type, subtype and entities", () => {
    const plan = rulePlan(base(question));
    expect(plan).toMatchObject({ intent: "event_impact", source: "fallback", event: { type, subtype, source: "replay" } });
    expect(plan.event.entities).toEqual(expect.arrayContaining(entities));
    expect(plan.event.externalNames).toEqual(expect.arrayContaining(external));
    expect(plan.specialists.weather).toBe(type === "disaster");
    expect(classifyEventByKeywords(question)?.type).toBe(type);
  });

  it("uses the model's plan, passes the context and guards the output", async () => {
    const llm = new FakeLlm({
      planner: () => modelPlan(
        { type, subtype, entities: [...entities, "TSLA"], externalNames: ["Shell", "Unknown Corp"], source: "live" },
        { focusSymbols: ["tsla", ...entities.map((e) => e.toLowerCase())] },
      ),
    });
    const env = makeEnv(llm, { query: question, mode: "replay" });
    const out = await plannerNode(emptyState(), env);
    const plan = (out as { output: Plan }).output;
    expect(out.status).toBe("done");
    expect(plan.source).toBe("model");
    expect(plan.event.type).toBe(type);
    expect(plan.event.source).toBe("replay");
    expect(plan.event.entities).toEqual(entities);
    expect(plan.event.externalNames).toEqual(["Shell"]);
    expect(plan.focusSymbols).toEqual(entities);
    expect(plan.specialists.weather).toBe(type === "disaster");
    const sent = JSON.parse(llm.calls[0]?.user ?? "{}");
    expect(sent).toMatchObject({ question, mode: "replay" });
    expect(sent.portfolio.length).toBeGreaterThan(10);
  });

  it("falls back to the rule-based plan when the model fails", async () => {
    const env = makeEnv(new FakeLlm({ planner: () => fakeFailure("refusal") }), { query: question, mode: "live" });
    const out = await plannerNode(emptyState(), env);
    expect(out.status).toBe("degraded");
    expect((out.output as Plan).event).toMatchObject({ type, source: "live" });
  });
});

describe("rule-based plan: other intents", () => {
  it("reads a what-if as hypothetical with severity and assumptions", () => {
    const plan = rulePlan(base("What if China blockades Taiwan?", { mode: "live" }));
    expect(plan.intent).toBe("what_if");
    expect(plan.event).toMatchObject({ source: "hypothetical", type: "geopolitical" });
    expect(plan.event.hypothetical?.severity).toBe("medium");
    expect(plan.event.hypothetical?.factorDirections.length).toBeGreaterThan(0);
  });

  it("reads a what-if hurricane as a hypothetical storm with the category", () => {
    const plan = rulePlan(base("What if a Category 4 hurricane hits Port Arthur in 48 hours?", { mode: "live" }));
    expect(plan.event).toMatchObject({ source: "hypothetical", type: "disaster", hypotheticalStorm: { category: 4, region: "LA_WEST", hoursToLandfall: 48 } });
    expect(plan.specialists.weather).toBe(true);
  });

  it("reuses the previous event for a follow-up and records the category override", () => {
    const previous = rulePlan(base(CASES[5]?.question ?? "", { mode: "live" }));
    const plan = rulePlan(base("What if it only reaches Category 2?", { mode: "live", previousPlan: previous }));
    expect(plan.intent).toBe("what_if");
    expect(plan.event).toMatchObject({ type: "disaster", subtype: "hurricane", source: "live", categoryOverride: 2 });
  });

  it("reads a news scan, a hedge request and an off-topic question", () => {
    expect(rulePlan(base("What is moving our portfolio today?", { mode: "live" }))).toMatchObject({ intent: "news_scan", event: { source: "live" } });
    expect(rulePlan(base("How should we hedge our airline exposure?", { mode: "live" })).intent).toBe("hedge");
    const off = rulePlan(base("Give me a recipe for lentil soup", { mode: "live" }));
    expect(off).toMatchObject({ intent: "out_of_scope", event: { source: "none" } });
    expect(off.specialists).toEqual({ weather: false, sentiment: false, macro: false, analogs: false });
  });

  it("keeps a market event id for a live run", () => {
    const id = "00000000-0000-4000-8000-0000000000e1";
    expect(rulePlan(base("Analyse this event", { mode: "live", marketEventId: id })).event.marketEventId).toBe(id);
  });
});

describe("normalizePlan", () => {
  it("forces the weather specialist for a hurricane and the live source in live mode", () => {
    const plan = normalizePlan(modelPlan({ type: "disaster", subtype: "hurricane", source: "replay" }), "live", null);
    expect(plan.specialists.weather).toBe(true);
    expect(plan.event.source).toBe("live");
  });

  it("turns off every specialist for an out-of-scope question", () => {
    const plan = normalizePlan(modelPlan({}, { intent: "out_of_scope" }), "live", null);
    expect(plan.event.source).toBe("none");
    expect(plan.specialists).toEqual({ weather: false, sentiment: false, macro: false, analogs: false });
  });

  it("repairs an unknown landfall region", () => {
    const plan = normalizePlan(modelPlan({ type: "disaster", subtype: "hurricane", hypotheticalStorm: { category: 3, region: "MARS", hoursToLandfall: 24 } }), "live", null);
    expect(plan.event.hypotheticalStorm?.region).toBe("LA_WEST");
  });
});

describe("assumptions", () => {
  it("records a stated hurricane category as user evidence", async () => {
    const env = makeEnv(new FakeLlm({ planner: () => modelPlan({ type: "disaster", subtype: "hurricane" }) }), { query: CASES[5]?.question ?? "" });
    await plannerNode(emptyState(), env);
    const [row] = env.ctx.ledger.all();
    expect(row).toMatchObject({ key: "E1", kind: "assumption", basis: "assumption", source: "user", value: 4, unit: "category" });
  });
});
