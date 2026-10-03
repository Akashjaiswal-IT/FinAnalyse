import { afterEach, describe, expect, it } from "vitest";
import { isTrackedEnvelope } from "@trpc/server";
import { AgentRuntime, fakeServices, fixtureNodes } from "@repo/agents";
import { FakeLlm } from "@repo/services/llm";
import { RunsService } from "@repo/services/runs";
import type { Plan, RunEvent } from "@repo/contracts";
import { serverRouter } from "../../index";
import { createCallerFactory } from "../../trpc";
import { setApiRuntime } from "../../runtime";

const QUERY = "How will the Russian invasion of Ukraine affect our portfolio?";
const PRESET = "geopolitical-russia-ukraine-2022";

const plan: Plan = {
  intent: "event_impact",
  event: {
    source: "replay", type: "geopolitical", subtype: "war", name: "invasion", entities: [], externalNames: [], marketEventId: null,
    stormId: null, stormName: null, hypothetical: null, hypotheticalStorm: null, categoryOverride: null,
  },
  focusSymbols: [], focusSectors: [], horizonDays: 5, reallocation: false, source: "model",
  specialists: { weather: false, sentiment: true, macro: true, analogs: true },
};

function boot(demoToken?: string, gate?: Promise<void>) {
  const runs = new RunsService();
  const llm = new FakeLlm({
    planner: async () => {
      await gate;
      return plan;
    },
    // No synthesizer script: the call fails and the run ends with the template answer.
  });
  const agents = new AgentRuntime({ deps: { llm, runs, now: () => new Date("2026-10-03T12:00:00.000Z"), ...fakeServices() }, nodes: fixtureNodes() });
  setApiRuntime({ agents, runs, demoToken });
  return { agents, runs, caller: createCallerFactory(serverRouter)({ demoToken }) };
}

afterEach(() => setApiRuntime(undefined));

describe("runs routes", () => {
  it("creates a run at once, then get and list show it", async () => {
    const { agents, caller } = boot();
    const { runId, threadId } = await caller.runs.create({ query: QUERY, mode: "replay", replayPresetId: PRESET });
    expect(runId).toMatch(/^[0-9a-f-]{36}$/);
    await agents.finished(runId);
    const got = await caller.runs.get({ runId });
    expect(got.run).toMatchObject({ id: runId, threadId, status: "partial" });
    expect(got.steps).toHaveLength(10);
    expect(got.evidence.length).toBeGreaterThan(0);
    expect((await caller.runs.list({ limit: 5 })).map((r) => r.id)).toEqual([runId]);
  });

  it("requires the demo token when one is configured", async () => {
    const { runs, agents } = boot("secret");
    const anonymous = createCallerFactory(serverRouter)({ demoToken: undefined });
    await expect(anonymous.runs.create({ query: QUERY, mode: "replay", replayPresetId: PRESET })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const wrong = createCallerFactory(serverRouter)({ demoToken: "nope" });
    await expect(wrong.runs.create({ query: QUERY, mode: "replay", replayPresetId: PRESET })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const ok = createCallerFactory(serverRouter)({ demoToken: "secret" });
    const { runId } = await ok.runs.create({ query: QUERY, mode: "replay", replayPresetId: PRESET });
    await agents.finished(runId);
    expect((await runs.get(runId))?.run.status).toBe("partial");
    // Reading is open.
    await expect(anonymous.runs.get({ runId })).resolves.toBeDefined();
  });

  it("maps bad requests, unknown runs and the concurrency limit to tRPC codes", async () => {
    let release!: () => void;
    const { agents, caller } = boot(undefined, new Promise<void>((r) => (release = r)));
    await expect(caller.runs.create({ query: QUERY, mode: "replay", replayPresetId: "nope" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.runs.create({ query: QUERY, mode: "replay" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.runs.get({ runId: "00000000-0000-4000-8000-000000000000" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.runs.create({ query: QUERY, mode: "live", threadId: "00000000-0000-4000-8000-000000000000" })).rejects.toMatchObject({ code: "NOT_FOUND" });

    const a = await caller.runs.create({ query: QUERY, mode: "replay", replayPresetId: PRESET });
    const b = await caller.runs.create({ query: QUERY, mode: "replay", replayPresetId: PRESET });
    await expect(caller.runs.create({ query: QUERY, mode: "replay", replayPresetId: PRESET })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    release();
    await Promise.all([agents.finished(a.runId), agents.finished(b.runId)]);
  });

  it("streams every event with its seq as the id, and resumes after lastEventId", async () => {
    const { agents, caller } = boot();
    const { runId } = await caller.runs.create({ query: QUERY, mode: "replay", replayPresetId: PRESET });

    const all: { id: string; event: RunEvent }[] = [];
    for await (const item of await caller.runs.stream({ runId })) {
      if (!isTrackedEnvelope(item)) throw new Error("event is not tracked");
      all.push({ id: item[0], event: item[1] as RunEvent });
    }
    await agents.finished(runId);
    expect(all[0]?.event.type).toBe("run.started");
    expect(all.at(-1)?.event.type).toBe("run.completed");
    expect(all.map((e) => e.id)).toEqual(all.map((_, i) => String(i + 1)));

    const resumed: string[] = [];
    for await (const item of await caller.runs.stream({ runId, lastEventId: "5" })) {
      if (isTrackedEnvelope(item)) resumed.push(item[0]);
    }
    expect(resumed[0]).toBe("6");
    expect(resumed.at(-1)).toBe(String(all.length));
    await expect((async () => { for await (const _ of await caller.runs.stream({ runId: "00000000-0000-4000-8000-000000000000" })) void _; })()).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
