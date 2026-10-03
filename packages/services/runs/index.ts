import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import {
  MAX_QUERY_LENGTH,
  RunEvent as RunEventSchema,
  type Evidence,
  type Mode,
  type Run,
  type RunEvent,
  type RunTotals,
  type RunsGetOutput,
} from "@repo/contracts";
import { MemoryRunsRepo } from "./memory";
import type { RunsRepo, StoredEvent } from "./model";
import { deriveSteps } from "./steps";

export * from "./model";
export * from "./memory";
export * from "./steps";

export interface CreateRunInput {
  threadId?: string;
  query: string;
  mode: Mode;
  asOf: string;
  replayEventId?: string | null;
  marketEventId?: string | null;
  portfolioId?: string | null;
}

export type CompleteRunInput = Partial<
  Pick<Run, "plan" | "eventProfile" | "answer" | "hedgePlan" | "risk" | "forecast" | "verification" | "confidence">
> & {
  status: Exclude<Run["status"], "running">;
  warnings: string[];
  totals: RunTotals;
  error?: string | null;
};

const TERMINAL: ReadonlySet<RunEvent["type"]> = new Set(["run.completed", "run.failed"]);

export class RunNotFoundError extends Error {
  constructor(runId: string) {
    super(`run ${runId} not found`);
  }
}

export class ThreadNotFoundError extends Error {
  constructor(threadId: string) {
    super(`thread ${threadId} not found`);
  }
}

export class RunsService {
  private readonly emitter = new EventEmitter();
  private readonly counters = new Map<string, number>();
  private readonly tails = new Map<string, Promise<unknown>>();

  constructor(private readonly repo: RunsRepo = new MemoryRunsRepo()) {
    this.emitter.setMaxListeners(0);
  }

  async create(input: CreateRunInput): Promise<{ runId: string; threadId: string }> {
    const query = input.query.trim().slice(0, MAX_QUERY_LENGTH);
    let threadId = input.threadId;
    if (threadId) {
      if (!(await this.repo.threadExists(threadId))) throw new ThreadNotFoundError(threadId);
    } else {
      threadId = await this.repo.createThread({ portfolioId: input.portfolioId ?? null, title: query.slice(0, 80) });
    }
    const runId = randomUUID();
    await this.repo.insertRun({
      id: runId,
      threadId,
      query,
      mode: input.mode,
      asOf: input.asOf,
      replayEventId: input.replayEventId ?? null,
      marketEventId: input.marketEventId ?? null,
      status: "running",
      plan: null,
      eventProfile: null,
      answer: null,
      hedgePlan: null,
      risk: null,
      forecast: null,
      verification: null,
      confidence: null,
      warnings: [],
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
    });
    this.counters.set(runId, 0);
    return { runId, threadId };
  }

  /** Stores the event with the next `seq`, then notifies live listeners. Appends to one run are serialised,
   * so `seq` order is also emit order. */
  appendEvent(runId: string, event: RunEvent): Promise<number> {
    const job = (this.tails.get(runId) ?? Promise.resolve()).then(async () => {
      const valid = RunEventSchema.parse(event);
      const seq = (this.counters.get(runId) ?? (await this.repo.maxSeq(runId))) + 1;
      this.counters.set(runId, seq);
      const stored: StoredEvent = { seq, event: valid, createdAt: new Date().toISOString() };
      await this.repo.insertEvent(runId, stored);
      this.emitter.emit(runId, stored);
      return seq;
    });
    this.tails.set(runId, job.catch(() => undefined));
    return job;
  }

  async addEvidence(runId: string, rows: Evidence[]): Promise<void> {
    if (rows.length > 0) await this.repo.insertEvidence(runId, rows);
  }

  async complete(runId: string, input: CompleteRunInput): Promise<void> {
    const { totals, ...rest } = input;
    await this.repo.updateRun(runId, {
      ...rest,
      status: input.status,
      tokensIn: totals.tokensIn,
      tokensOut: totals.tokensOut,
      costUsd: totals.costUsd,
      finishedAt: new Date().toISOString(),
      error: input.error ?? null,
    });
  }

  async get(runId: string): Promise<RunsGetOutput | null> {
    const run = await this.repo.getRun(runId);
    if (!run) return null;
    const [evidence, events] = await Promise.all([this.repo.listEvidence(runId), this.repo.eventsAfter(runId, 0)]);
    return { run, evidence, steps: deriveSteps(events.map((e) => e.event)) };
  }

  list(filter: { threadId?: string; limit: number }): Promise<Run[]> {
    return this.repo.listRuns(filter);
  }

  eventsAfter(runId: string, seq: number): Promise<StoredEvent[]> {
    return this.repo.eventsAfter(runId, seq);
  }

  /** Boot cleanup: a run left `running` by a crashed process becomes `failed` (SPEC 5.5, rule 6). */
  async failStaleRunning(reason = "server restarted"): Promise<number> {
    const ids = await this.repo.failRunning(reason, new Date().toISOString());
    for (const id of ids) await this.appendEvent(id, { type: "run.failed", error: reason });
    return ids.length;
  }

  /** Stored events after `lastEventId`, then live ones, until `run.completed` or `run.failed` (SPEC 5.13).
   * Subscribing before the read closes the gap between the two, and `seq` filtering removes duplicates. */
  async *stream(runId: string, lastEventId: number, signal?: AbortSignal): AsyncGenerator<StoredEvent> {
    if (!(await this.repo.getRun(runId))) throw new RunNotFoundError(runId);
    const buffer: StoredEvent[] = [];
    let wake: (() => void) | undefined;
    const onEvent = (e: StoredEvent) => {
      buffer.push(e);
      wake?.();
    };
    this.emitter.on(runId, onEvent);
    const onAbort = () => wake?.();
    signal?.addEventListener("abort", onAbort);
    try {
      let last = lastEventId;
      for (const e of await this.repo.eventsAfter(runId, last)) {
        last = e.seq;
        yield e;
        if (TERMINAL.has(e.event.type)) return;
      }
      // A client that reconnects after the last event of a finished run gets nothing more to wait for.
      if (buffer.length === 0 && (await this.repo.getRun(runId))?.status !== "running") return;
      while (!signal?.aborted) {
        const next = buffer.shift();
        if (!next) {
          await new Promise<void>((resolve) => {
            wake = resolve;
            if (buffer.length > 0 || signal?.aborted) resolve();
          });
          wake = undefined;
          continue;
        }
        if (next.seq <= last) continue;
        last = next.seq;
        yield next;
        if (TERMINAL.has(next.event.type)) return;
      }
    } finally {
      this.emitter.off(runId, onEvent);
      signal?.removeEventListener("abort", onAbort);
    }
  }
}
