import { afterEach, describe, expect, it, vi } from "vitest";
import { NODE_ORDER, type RunEvent } from "@repo/contracts";
import {
  idaEvidence,
  idaNodeOutputs,
  idaRunEvents,
  ukraineEvidence,
  ukraineNodeOutputs,
  ukraineRunEvents,
} from "@repo/contracts/fixtures";
import { applyRunEvent, initialRunView, isRunActive, reduceRunEvents } from "./run-state";

afterEach(() => vi.restoreAllMocks());

const fixtures = [
  { name: "Ida", events: idaRunEvents, evidence: idaEvidence, outputs: idaNodeOutputs, weather: "done" },
  { name: "Ukraine", events: ukraineRunEvents, evidence: ukraineEvidence, outputs: ukraineNodeOutputs, weather: "skipped" },
] as const;

describe.each(fixtures)("$name fixture run", ({ events, evidence, weather }) => {
  const view = reduceRunEvents(events);

  it("ends succeeded with all ten nodes finished and none pending or running", () => {
    expect(view.phase).toBe("succeeded");
    for (const node of NODE_ORDER) {
      expect(["done", "skipped", "degraded"]).toContain(view.nodes[node].status);
      expect(view.nodes[node].durationMs).not.toBeNull();
    }
    expect(view.nodes.weather.status).toBe(weather);
  });

  it("collects every evidence row by key, in order", () => {
    expect(view.evidence.map((e) => e.key)).toEqual(evidence.map((e) => e.key));
    for (const e of evidence) expect(view.evidenceByKey[e.key]).toEqual(e);
  });

  it("exposes the verified answer, hedge plan, risk report and totals", () => {
    expect(view.answer?.source).toBe("model");
    expect(view.hedgePlan?.actions.length).toBeGreaterThan(0);
    expect(view.risk?.channels.length).toBeGreaterThan(0);
    expect(view.verification?.passed).toBe(true);
    expect(view.totals?.costUsd).toBeGreaterThan(0);
    expect(view.confidence).toBe("medium");
  });

  it("keeps LLM-authored text off the screen until run.completed", () => {
    const beforeCompleted = reduceRunEvents(events.slice(0, -1));
    expect(beforeCompleted.phase).toBe("running");
    expect(beforeCompleted.nodes.synthesizer.status).toBe("done");
    expect(beforeCompleted.nodes.hedging.status).toBe("done");
    expect(beforeCompleted.answer).toBeNull();
    expect(beforeCompleted.hedgePlan).toBeNull();
  });

  it("shows the event profile and portfolio exposure as soon as their nodes complete", () => {
    const afterEvent = events.findIndex((e) => e.type === "step.completed" && e.node === "event");
    expect(reduceRunEvents(events.slice(0, afterEvent)).eventProfile).toBeNull();
    expect(reduceRunEvents(events.slice(0, afterEvent + 1)).eventProfile?.title).toBeTruthy();

    const afterRisk = events.findIndex((e) => e.type === "step.completed" && e.node === "risk");
    expect(reduceRunEvents(events.slice(0, afterRisk + 1)).risk?.channels.length).toBeGreaterThan(0);
  });

  it("reports the running nodes mid-run, including the parallel branch", () => {
    const upToBranch = events.findIndex((e) => e.type === "step.started" && e.node === "macro");
    const mid = reduceRunEvents(events.slice(0, upToBranch + 1));
    expect(mid.nodes.weather.status).toBe("running");
    expect(mid.nodes.sentiment.status).toBe("running");
    expect(mid.nodes.macro.status).toBe("running");
    expect(mid.nodes.analogs.status).toBe("pending");
    expect(isRunActive(mid)).toBe(true);
  });
});

describe("applyRunEvent", () => {
  const started: RunEvent = { type: "run.started", runId: "r1", mode: "replay", asOf: "2022-02-25T03:00:00.000Z", query: "q" };

  it("starts from an idle view with every node pending", () => {
    const view = initialRunView();
    expect(view.phase).toBe("idle");
    expect(Object.values(view.nodes).every((n) => n.status === "pending")).toBe(true);
  });

  it("resets everything when a new run starts", () => {
    const finished = reduceRunEvents(ukraineRunEvents);
    const next = applyRunEvent(finished, started);
    expect(next.phase).toBe("running");
    expect(next.evidence).toEqual([]);
    expect(next.answer).toBeNull();
    expect(next.nodes.planner.status).toBe("pending");
  });

  it("marks a node degraded or failed and counts a repeated start (the verifier repair loop)", () => {
    let view = applyRunEvent(initialRunView(), started);
    view = applyRunEvent(view, { type: "step.started", node: "synthesizer", at: "2026-10-03T08:00:00.000Z" });
    view = applyRunEvent(view, { type: "step.completed", node: "synthesizer", status: "degraded", durationMs: 10, summary: "s", output: null });
    expect(view.nodes.synthesizer.status).toBe("degraded");
    view = applyRunEvent(view, { type: "step.started", node: "synthesizer", at: "2026-10-03T08:00:01.000Z" });
    expect(view.nodes.synthesizer.status).toBe("running");
    expect(view.nodes.synthesizer.starts).toBe(2);

    view = applyRunEvent(view, { type: "step.failed", node: "weather", error: "boom", durationMs: 5 });
    expect(view.nodes.weather.status).toBe("failed");
    expect(view.nodes.weather.error).toBe("boom");
  });

  it("records step progress messages", () => {
    let view = applyRunEvent(initialRunView(), started);
    view = applyRunEvent(view, { type: "step.started", node: "hedging", at: "2026-10-03T08:00:00.000Z" });
    view = applyRunEvent(view, { type: "step.progress", node: "hedging", message: "Simulating" });
    expect(view.nodes.hedging.progress).toEqual(["Simulating"]);
  });

  it("ends failed on run.failed and keeps the error", () => {
    const view = applyRunEvent(applyRunEvent(initialRunView(), started), { type: "run.failed", error: "server restarted" });
    expect(view.phase).toBe("failed");
    expect(view.error).toBe("server restarted");
    expect(isRunActive(view)).toBe(false);
  });

  it("drops an output that does not match its contract instead of crashing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let view = applyRunEvent(initialRunView(), started);
    view = applyRunEvent(view, { type: "step.completed", node: "event", status: "done", durationMs: 1, summary: "s", output: { status: "ok", profile: {} } });
    expect(view.eventProfile).toBeNull();
    expect(view.nodes.event.status).toBe("done");
    expect(warn).toHaveBeenCalledOnce();
  });

  it("does not mutate the previous view", () => {
    const before = applyRunEvent(initialRunView(), started);
    const snapshot = JSON.stringify(before);
    applyRunEvent(before, { type: "step.started", node: "planner", at: "2026-10-03T08:00:00.000Z" });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
