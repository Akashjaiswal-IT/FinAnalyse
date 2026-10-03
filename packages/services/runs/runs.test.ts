import { describe, expect, it } from "vitest";
import { ukraineEvidence, ukraineRunEvents } from "@repo/contracts/fixtures";
import type { RunEvent } from "@repo/contracts";
import { RunNotFoundError, RunsService, ThreadNotFoundError, type StoredEvent } from "./index";

const ASOF = "2022-02-25T03:00:00.000Z";
const started = (runId: string): RunEvent => ({ type: "run.started", runId, mode: "replay", asOf: ASOF, query: "q" });
const progress = (message: string): RunEvent => ({ type: "step.progress", node: "planner", message });
const failed: RunEvent = { type: "run.failed", error: "boom" };

async function newRun(svc = new RunsService()) {
  const { runId, threadId } = await svc.create({ query: "How will it affect us?", mode: "replay", asOf: ASOF });
  return { svc, runId, threadId };
}

async function collect(gen: AsyncGenerator<StoredEvent>): Promise<StoredEvent[]> {
  const out: StoredEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe("RunsService", () => {
  it("creates a thread and a running run", async () => {
    const { svc, runId, threadId } = await newRun();
    const got = await svc.get(runId);
    expect(got?.run).toMatchObject({ id: runId, threadId, status: "running", mode: "replay" });
    expect(got?.steps).toHaveLength(10);
    expect((await svc.create({ query: "again", mode: "live", asOf: ASOF, threadId })).threadId).toBe(threadId);
  });

  it("rejects an unknown thread and truncates a long query", async () => {
    const svc = new RunsService();
    await expect(svc.create({ query: "q", mode: "live", asOf: ASOF, threadId: "00000000-0000-4000-8000-000000000000" })).rejects.toBeInstanceOf(ThreadNotFoundError);
    const { runId } = await svc.create({ query: "x".repeat(900), mode: "live", asOf: ASOF });
    expect((await svc.get(runId))?.run.query).toHaveLength(500);
  });

  it("assigns contiguous seq even when appends are concurrent, and returns events after a seq", async () => {
    const { svc, runId } = await newRun();
    const seqs = await Promise.all([1, 2, 3, 4, 5].map((i) => svc.appendEvent(runId, progress(`m${i}`))));
    expect(seqs).toEqual([1, 2, 3, 4, 5]);
    const after = await svc.eventsAfter(runId, 3);
    expect(after.map((e) => e.seq)).toEqual([4, 5]);
    expect(after.map((e) => (e.event.type === "step.progress" ? e.event.message : ""))).toEqual(["m4", "m5"]);
  });

  it("rejects an event that does not match the contract", async () => {
    const { svc, runId } = await newRun();
    await expect(svc.appendEvent(runId, { type: "step.progress", node: "nope" } as unknown as RunEvent)).rejects.toThrow();
  });

  it("derives steps from the stored events and returns evidence", async () => {
    const { svc, runId } = await newRun();
    for (const e of ukraineRunEvents) await svc.appendEvent(runId, e);
    await svc.addEvidence(runId, ukraineEvidence);
    await svc.addEvidence(runId, ukraineEvidence);
    const got = await svc.get(runId);
    expect(got?.evidence).toHaveLength(ukraineEvidence.length);
    expect(got?.steps.map((s) => s.status)).toEqual(["done", "done", "skipped", "done", "done", "done", "done", "done", "done", "done"]);
    expect(got?.steps[0]?.thinkingSummary).toBeTruthy();
  });

  it("completes a run with totals", async () => {
    const { svc, runId } = await newRun();
    await svc.complete(runId, { status: "succeeded", warnings: ["w"], totals: { tokensIn: 10, tokensOut: 5, costUsd: 0.01, durationMs: 100 }, confidence: "medium" });
    expect((await svc.get(runId))?.run).toMatchObject({ status: "succeeded", tokensIn: 10, costUsd: 0.01, confidence: "medium", warnings: ["w"] });
    expect((await svc.get(runId))?.run.finishedAt).not.toBeNull();
  });

  it("lists newest first, optionally per thread", async () => {
    const svc = new RunsService();
    const a = await newRun(svc);
    await new Promise((r) => setTimeout(r, 5));
    const b = await newRun(svc);
    expect((await svc.list({ limit: 10 })).map((r) => r.id)).toEqual([b.runId, a.runId]);
    expect((await svc.list({ limit: 10, threadId: a.threadId })).map((r) => r.id)).toEqual([a.runId]);
  });

  it("marks runs left running as failed at boot", async () => {
    const { svc, runId } = await newRun();
    expect(await svc.failStaleRunning()).toBe(1);
    expect((await svc.get(runId))?.run).toMatchObject({ status: "failed", error: "server restarted" });
    expect(await svc.failStaleRunning()).toBe(0);
    expect((await svc.eventsAfter(runId, 0)).map((e) => e.event.type)).toEqual(["run.failed"]);
  });
});

describe("RunsService.stream", () => {
  it("replays stored events, then follows live ones until the run ends", async () => {
    const { svc, runId } = await newRun();
    await svc.appendEvent(runId, started(runId));
    await svc.appendEvent(runId, progress("a"));
    const reader = collect(svc.stream(runId, 0));
    await new Promise((r) => setTimeout(r, 5));
    await svc.appendEvent(runId, progress("b"));
    await svc.appendEvent(runId, failed);
    const seen = await reader;
    expect(seen.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    expect(seen.at(-1)?.event.type).toBe("run.failed");
  });

  it("resumes after lastEventId without repeating events", async () => {
    const { svc, runId } = await newRun();
    for (const m of ["a", "b", "c"]) await svc.appendEvent(runId, progress(m));
    await svc.appendEvent(runId, failed);
    await svc.complete(runId, { status: "failed", warnings: [], totals: { tokensIn: 0, tokensOut: 0, costUsd: 0, durationMs: 0 } });
    expect((await collect(svc.stream(runId, 2))).map((e) => e.seq)).toEqual([3, 4]);
    expect(await collect(svc.stream(runId, 4))).toEqual([]);
  });

  it("does not repeat an event that is both stored and buffered", async () => {
    const { svc, runId } = await newRun();
    const gen = svc.stream(runId, 0);
    const first = gen.next();
    await svc.appendEvent(runId, progress("a"));
    await svc.appendEvent(runId, failed);
    expect((await first).value?.seq).toBe(1);
    const rest: number[] = [];
    for await (const e of gen) rest.push(e.seq);
    expect(rest).toEqual([2]);
  });

  it("stops when the signal aborts and rejects an unknown run", async () => {
    const { svc, runId } = await newRun();
    const controller = new AbortController();
    const reader = collect(svc.stream(runId, 0, controller.signal));
    await new Promise((r) => setTimeout(r, 5));
    controller.abort();
    expect(await reader).toEqual([]);
    await expect(collect(svc.stream("00000000-0000-4000-8000-000000000000", 0))).rejects.toBeInstanceOf(RunNotFoundError);
  });
});
