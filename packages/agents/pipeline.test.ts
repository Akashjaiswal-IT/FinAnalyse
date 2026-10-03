import { describe, expect, it } from "vitest";
import { HEDGE_LIMITS, HEDGE_MENU, type HedgePlan, type RunEvent } from "@repo/contracts";
import { type ToolCall } from "@repo/services/llm";
import { defaultNodes } from "./graph";
import { eventsOf, goodDraft, goodNotes, idaQuery, modelPlan, newRuntime, ukraineQuery } from "./testkit";

/** The hedging tool loop of a well-behaved model: simulate the best-fitting suggestion, then submit it. */
async function hedgeLikeAModel(call: ToolCall): Promise<void> {
  const ctx = JSON.parse(call.user) as {
    suggestions: { symbol: string; side: "buy" | "sell"; maxQuantity: number }[];
    evidence: { key: string }[];
  };
  const pick = ctx.suggestions.find((s) => s.maxQuantity > 0);
  if (!pick) return;
  const action = { symbol: pick.symbol, side: pick.side, quantity: Math.max(1, Math.floor(pick.maxQuantity / 2)) };
  const simulate = call.tools.find((t) => t.name === "simulate_hedges");
  const submit = call.tools.find((t) => t.name === "submit_plan");
  const simulated = JSON.parse(await simulate?.run({ actions: [action] } as never) as string);
  if (simulated.error) throw new Error(simulated.error);
  const key = ctx.evidence[0]?.key as string;
  await submit?.run({
    actions: [{ type: "hedge", ...action, timing: "now", orderType: "market", exitTrigger: "Unwind when the event risk fades.", rationale: `The best-fitting offset to the exposed holdings; the market reading is {{${key}}}.`, evidenceKeys: [key] }],
    summary: "The hedge moves the scenario result to {{AFTER_PNL}} at a gross notional of {{GROSS}}.",
  } as never);
}

const handlers = (plan = modelPlan()) => ({
  planner: () => plan,
  "notes:weather": goodNotes,
  "notes:sentiment": goodNotes,
  "notes:macro": goodNotes,
  "notes:analogs": goodNotes,
  event_classification: () => ({ type: "geopolitical", subtype: "war", entities: ["LMT", "TSLA"], externalNames: ["Airbus"], affectedSectors: ["defense"], factorDirections: [] }),
  synthesizer: (call: { user: string }) => goodDraft(call.user, 12),
});
const tools = { hedging: hedgeLikeAModel };

const stepStatus = (events: { event: RunEvent }[]) =>
  Object.fromEntries(events.flatMap((e) => (e.event.type === "step.completed" ? [[e.event.node, e.event.status]] : [])));

describe("full pipeline with the real nodes and fake services", () => {
  it("answers the Ukraine replay: weather skipped, three exposure channels, hedges inside the limits", async () => {
    const { runtime, runs, llm } = newRuntime(handlers(), defaultNodes(), "ukraine");
    (llm as unknown as { tools: unknown }).tools = tools;
    const { runId } = await runtime.start({ query: ukraineQuery, mode: "replay", replayPresetId: "geopolitical-russia-ukraine-2022" });
    await runtime.finished(runId);
    const got = await runs.get(runId);
    const events = await eventsOf(runs, runId);
    const run = got?.run;
    expect(run?.error).toBeNull();
    expect(stepStatus(events)).toMatchObject({ planner: "done", event: "done", weather: "skipped", sentiment: "done", macro: "done", analogs: "done", risk: "done", hedging: "done", synthesizer: "done", verifier: "done" });
    expect(run?.status).toBe("succeeded");
    expect(run?.verification?.passed).toBe(true);
    expect(got?.evidence.length).toBeGreaterThanOrEqual(20);

    const profile = run?.eventProfile;
    expect(profile).toMatchObject({ id: "geopolitical-russia-ukraine-2022", source: "replay", type: "geopolitical", newsBasis: "observed" });
    expect(profile?.volZ).toBeCloseTo(6.8);

    const channels = new Set(run?.risk?.channels.flatMap((c) => c.channels.map((l) => l.channel)));
    expect(channels.has("direct") && channels.has("factor")).toBe(true);
    expect(run?.risk?.channels.find((c) => c.symbol === "LMT")?.channels[0]).toMatchObject({ channel: "direct", reason: "named_in_news" });
    expect(run?.risk?.channels.every((c) => c.channels.every((l) => l.evidenceKeys.length > 0 && l.evidenceKeys.every((k) => got?.evidence.some((e) => e.key === k))))).toBe(true);
    expect(run?.risk?.scenario.perHolding.length).toBeGreaterThan(10);
    expect(run?.risk?.scenario.pnl).toBeCloseTo(run?.risk?.scenario.perHolding.reduce((s, h) => s + h.pnl, 0) ?? 0, 6);

    const plan = run?.hedgePlan as HedgePlan;
    expect(plan.source).toBe("model");
    expect(plan.actions.length).toBeGreaterThan(0);
    expect(plan.grossNotional).toBeLessThanOrEqual(HEDGE_LIMITS.grossNotionalMaxPctNav * (run?.risk?.nav ?? 0));
    for (const a of plan.actions) {
      expect(a.notional).toBeLessThanOrEqual(HEDGE_LIMITS.singleActionMaxPctNav * (run?.risk?.nav ?? 0));
      expect(HEDGE_MENU as readonly string[]).toContain(a.symbol);
      expect(a.rationale.rendered).not.toContain("{{");
    }
    // The answer cites at least 8 distinct evidence rows (GATE B2).
    const cited = new Set(run?.answer?.bullets.flatMap((b) => b.evidenceKeys));
    expect(cited.size).toBeGreaterThanOrEqual(8);
    expect(run?.answer?.source).toBe("model");
    expect(run?.forecast?.analogs.length).toBeGreaterThan(0);
    expect(run?.forecast?.groupsUsed).toEqual(expect.arrayContaining(["type", "news", "regime"]));
  });

  it("answers the Ida replay with the weather node: refineries at risk become direct exposures", async () => {
    const plan = modelPlan({ type: "disaster", subtype: "hurricane", name: "Hurricane Ida" }, { specialists: { weather: true, sentiment: true, macro: true, analogs: true } });
    const { runtime, runs, llm } = newRuntime(handlers(plan), defaultNodes(), "ida");
    (llm as unknown as { tools: unknown }).tools = tools;
    const { runId } = await runtime.start({ query: idaQuery, mode: "replay", replayPresetId: "disaster-hurricane-ida-2021" });
    await runtime.finished(runId);
    const got = await runs.get(runId);
    const events = await eventsOf(runs, runId);
    expect(stepStatus(events).weather).toBe("done");
    const weather = events.find((e) => e.event.type === "step.completed" && e.event.node === "weather")?.event;
    const out = weather?.type === "step.completed" ? (weather.output as { status: string; storm: { name: string }; forecastLabel: string; refineriesAtRisk: number; gulfCapAtRisk: number; companyCapAtRisk: Record<string, number>; peakCategory: number; landfallRegion: string; features: { capAtRisk: number } }) : null;
    expect(out).toMatchObject({ status: "ok", forecastLabel: "perfect_forecast_replay" });
    expect(out?.storm.name).toBe("Ida");
    expect(out?.refineriesAtRisk).toBeGreaterThan(0);
    expect(out?.gulfCapAtRisk).toBeGreaterThan(0);
    expect(out?.gulfCapAtRisk).toBeLessThanOrEqual(1);
    expect(out?.peakCategory).toBeGreaterThanOrEqual(3);
    expect(out?.features.capAtRisk).toBe(out?.gulfCapAtRisk);

    const atRisk = Object.keys(out?.companyCapAtRisk ?? {});
    expect(atRisk.length).toBeGreaterThan(0);
    for (const symbol of atRisk.filter((s) => got?.run.risk?.channels.some((c) => c.symbol === s))) {
      expect(got?.run.risk?.channels.find((c) => c.symbol === symbol)?.channels.some((l) => l.channel === "direct" && l.reason === "capacity_at_risk")).toBe(true);
    }
    expect(got?.run.forecast?.groupsUsed).toContain("weather");
    expect(got?.run.answer?.caveats.some((c) => /perfect-forecast/.test(c.rendered))).toBe(true);
    expect(got?.run.answer?.caveats.some((c) => /flooding/.test(c.rendered))).toBe(true);
    expect(got?.run.answer?.badges.replay).toBe(true);
  });

  it("builds a hypothetical storm and caps the confidence at medium", async () => {
    const plan = modelPlan(
      { source: "hypothetical", type: "disaster", subtype: "hurricane", hypotheticalStorm: { category: 4, region: "LA_WEST", hoursToLandfall: 48 }, name: "hypothetical hurricane" },
      { intent: "what_if", specialists: { weather: true, sentiment: true, macro: true, analogs: true } },
    );
    const { runtime, runs, llm } = newRuntime(handlers(plan), defaultNodes(), "ida");
    (llm as unknown as { tools: unknown }).tools = tools;
    const { runId } = await runtime.start({ query: "What if a Category 4 hurricane hits Port Arthur in 48 hours?", mode: "live" });
    await runtime.finished(runId);
    const got = await runs.get(runId);
    expect(got?.run.eventProfile).toMatchObject({ source: "hypothetical", newsBasis: "assumed", severity: "high" });
    expect(got?.evidence.find((e) => e.label === "Event")).toMatchObject({ basis: "assumption", source: "user" });
    expect(got?.run.answer?.badges.hypothetical).toBe(true);
    expect(got?.run.confidence).not.toBe("high");
    expect(got?.run.answer?.caveats.some((c) => /hypothetical/i.test(c.rendered))).toBe(true);
  });

  it("falls back to the rule-based hedge when the model submits nothing", async () => {
    const { runtime, runs } = newRuntime(handlers(), defaultNodes(), "ukraine");
    const { runId } = await runtime.start({ query: ukraineQuery, mode: "replay", replayPresetId: "geopolitical-russia-ukraine-2022" });
    await runtime.finished(runId);
    const got = await runs.get(runId);
    expect(got?.run.hedgePlan?.source).toBe("fallback");
    expect(got?.steps.find((s) => s.node === "hedging")?.status).toBe("degraded");
    expect(got?.run.status).toBe("partial");
    expect(got?.run.verification?.checks.filter((c) => !c.passed && c.name !== "caveats")).toEqual([]);
    expect(got?.run.verification?.passed).toBe(true);
  });
});
