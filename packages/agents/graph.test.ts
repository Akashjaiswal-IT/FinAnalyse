import { describe, expect, it } from "vitest";
import { fakeFailure } from "@repo/services/llm";
import type { RunEvent } from "@repo/contracts";
import { activeRunCount, defaultNodes, TooManyRunsError } from "./index";
import { eventsOf, goodDraft, idaQuery, modelPlan, newRuntime, ukraineQuery } from "./testkit";

const types = (events: { event: RunEvent }[]) => events.map((e) => e.event.type);
const stepsOf = (events: { event: RunEvent }[], type: "step.started" | "step.completed") =>
  events.flatMap((e) => (e.event.type === type ? [e.event.node] : []));

const happy = {
  planner: () => modelPlan(),
  synthesizer: (call: { user: string }) => goodDraft(call.user),
};

describe("graph run", () => {
  it("emits the full event order for one run and completes", async () => {
    const { runtime, runs } = newRuntime(happy);
    const { runId } = await runtime.start({ query: ukraineQuery, mode: "replay", replayPresetId: "geopolitical-russia-ukraine-2022" });
    await runtime.finished(runId);
    const events = await eventsOf(runs, runId);

    expect(types(events)[0]).toBe("run.started");
    expect(types(events).at(-1)).toBe("run.completed");
    const started = stepsOf(events, "step.started");
    expect(started.slice(0, 2)).toEqual(["planner", "event"]);
    expect(new Set(started.slice(2, 5))).toEqual(new Set(["weather", "sentiment", "macro"]));
    expect(started.slice(5)).toEqual(["analogs", "risk", "hedging", "synthesizer", "verifier"]);
    const weather = events.find((e) => e.event.type === "step.completed" && e.event.node === "weather")?.event;
    expect(weather).toMatchObject({ status: "skipped" });
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));

    const done = events.at(-1)?.event;
    expect(done).toMatchObject({ type: "run.completed", status: "succeeded", confidence: expect.any(String) });
    const run = (await runs.get(runId))?.run;
    expect(run).toMatchObject({ status: "succeeded", mode: "replay", replayEventId: "geopolitical-russia-ukraine-2022" });
    expect(run?.answer?.source).toBe("model");
    expect(run?.verification?.passed).toBe(true);
    expect((await runs.get(runId))?.evidence.length).toBeGreaterThan(10);
    expect(run?.costUsd).toBeGreaterThan(0);
  });

  it("runs the Ida fixture path with the weather step done", async () => {
    const { runtime, runs } = newRuntime({ ...happy, planner: () => modelPlan({ type: "disaster", subtype: "hurricane", name: "Hurricane Ida" }, { specialists: { weather: true, sentiment: true, macro: true, analogs: true } }) });
    const { runId } = await runtime.start({ query: idaQuery, mode: "replay", replayPresetId: "disaster-hurricane-ida-2021" });
    await runtime.finished(runId);
    const events = await eventsOf(runs, runId);
    const weather = events.find((e) => e.event.type === "step.completed" && e.event.node === "weather")?.event;
    expect(weather).toMatchObject({ status: "done" });
    expect((await runs.get(runId))?.run.status).toBe("succeeded");
  });

  it("ends a node that throws as degraded and still completes the run", async () => {
    const nodes = { ...defaultNodes(), sentiment: () => { throw new Error("pinecone unreachable"); } };
    const { runtime, runs } = newRuntime(happy, nodes);
    const { runId } = await runtime.start({ query: ukraineQuery, mode: "replay", replayPresetId: "geopolitical-russia-ukraine-2022" });
    await runtime.finished(runId);
    const events = await eventsOf(runs, runId);
    const sentiment = events.find((e) => e.event.type === "step.completed" && e.event.node === "sentiment")?.event;
    expect(sentiment).toMatchObject({ status: "degraded", output: { status: "unavailable", reason: "pinecone unreachable" } });
    const run = (await runs.get(runId))?.run;
    expect(run?.status).toBe("partial");
    expect(run?.warnings.join(" ")).toContain("sentiment");
    expect(run?.answer?.caveats.some((c) => /sentiment/i.test(c.rendered))).toBe(true);
    expect(run?.confidence).not.toBe("high");
  });

  it("repairs a draft with a raw digit once, then ships the template answer", async () => {
    const bad = (call: { user: string }) => ({ ...goodDraft(call.user), summary: "Losses may reach 7% soon." });
    const { runtime, runs, llm } = newRuntime({ ...happy, synthesizer: bad });
    const { runId } = await runtime.start({ query: ukraineQuery, mode: "replay", replayPresetId: "geopolitical-russia-ukraine-2022" });
    await runtime.finished(runId);
    expect(llm.count("synthesizer")).toBe(2);
    const events = await eventsOf(runs, runId);
    expect(stepsOf(events, "step.completed").filter((n) => n === "verifier")).toHaveLength(2);
    const run = (await runs.get(runId))?.run;
    expect(run?.answer?.source).toBe("template");
    expect(run?.status).toBe("partial");
    expect(run?.verification).toMatchObject({ passed: false, repairAttempted: true });
    expect(run?.answer?.summary.rendered).not.toMatch(/7%/);
  });

  it("accepts a draft that is fixed by the one repair", async () => {
    const { runtime, runs, llm } = newRuntime({
      ...happy,
      synthesizer: (call, n) => (n === 0 ? { ...goodDraft(call.user), headline: "Oil may rise 5 percent." } : goodDraft(call.user)),
    });
    const { runId } = await runtime.start({ query: ukraineQuery, mode: "replay", replayPresetId: "geopolitical-russia-ukraine-2022" });
    await runtime.finished(runId);
    expect(llm.count("synthesizer")).toBe(2);
    const run = (await runs.get(runId))?.run;
    expect(run?.answer?.source).toBe("model");
    expect(run?.verification).toMatchObject({ passed: true, repairAttempted: true });
    expect(run?.status).toBe("succeeded");
    const repairCall = JSON.parse(llm.calls.filter((c) => c.label === "synthesizer")[1]?.user ?? "{}");
    expect(repairCall.repair.violations.join(" ")).toContain("5");
  });

  it("uses the template answer when the synthesizer is refused", async () => {
    const { runtime, runs } = newRuntime({ ...happy, synthesizer: () => fakeFailure("refusal") });
    const { runId } = await runtime.start({ query: ukraineQuery, mode: "replay", replayPresetId: "geopolitical-russia-ukraine-2022" });
    await runtime.finished(runId);
    const run = (await runs.get(runId))?.run;
    expect(run?.answer?.source).toBe("template");
    expect(run?.answer?.bullets.length).toBeGreaterThan(0);
    expect(run?.status).toBe("partial");
  });

  it("falls back to the rule-based plan when the planner call fails", async () => {
    const { runtime, runs } = newRuntime({ ...happy, planner: () => fakeFailure("max_tokens") });
    const { runId } = await runtime.start({ query: ukraineQuery, mode: "replay", replayPresetId: "geopolitical-russia-ukraine-2022" });
    await runtime.finished(runId);
    const got = await runs.get(runId);
    expect(got?.steps[0]).toMatchObject({ node: "planner", status: "degraded" });
    expect(got?.run.plan).toMatchObject({ source: "fallback", intent: "event_impact", event: { type: "geopolitical" } });
    expect(got?.run.status).toBe("partial");
  });

  it("rejects a third concurrent run", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { runtime } = newRuntime({ ...happy, planner: async () => { await gate; return modelPlan(); } });
    const a = await runtime.start({ query: ukraineQuery, mode: "replay", replayPresetId: "geopolitical-russia-ukraine-2022" });
    const b = await runtime.start({ query: ukraineQuery, mode: "replay", replayPresetId: "geopolitical-russia-ukraine-2022" });
    expect(activeRunCount()).toBe(2);
    await expect(runtime.start({ query: ukraineQuery, mode: "replay", replayPresetId: "geopolitical-russia-ukraine-2022" })).rejects.toBeInstanceOf(TooManyRunsError);
    release();
    await Promise.all([runtime.finished(a.runId), runtime.finished(b.runId)]);
    expect(activeRunCount()).toBe(0);
  });

  it("keeps history on a thread for the follow-up", async () => {
    const { runtime, llm } = newRuntime(happy);
    const first = await runtime.start({ query: ukraineQuery, mode: "replay", replayPresetId: "geopolitical-russia-ukraine-2022" });
    await runtime.finished(first.runId);
    const second = await runtime.start({ query: "What if it widens?", mode: "replay", replayPresetId: "geopolitical-russia-ukraine-2022", threadId: first.threadId });
    await runtime.finished(second.runId);
    const plannerCalls = llm.calls.filter((c) => c.label === "planner");
    const context = JSON.parse(plannerCalls[1]?.user ?? "{}");
    expect(context.history).toHaveLength(1);
    expect(context.history[0].query).toBe(ukraineQuery);
    expect(context.previousPlan.event.type).toBe("geopolitical");
  });
});
