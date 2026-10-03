import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { logger } from "@repo/logger";
import {
  EARLIEST_REPLAY_AS_OF,
  MAX_CONCURRENT_RUNS,
  REPLAY_PRESETS,
  type Mode,
  type RunEvent,
} from "@repo/contracts";
import { activeRunCount, registerRun, unregisterRun, type RunContext } from "./context";
import type { AgentDeps } from "./deps";
import { buildGraph, defaultNodes, type NodeSet } from "./graph";
import { Ledger } from "./ledger";
import type { RunStateValue } from "./state";

export class TooManyRunsError extends Error {
  constructor() {
    super(`At most ${MAX_CONCURRENT_RUNS} runs at a time; try again when one finishes.`);
  }
}

/** The request cannot be turned into a run (bad preset, replay without a time, ...). */
export class InvalidRunError extends Error {}

export class ThreadBusyError extends Error {
  constructor() {
    super("This thread already has a run in progress.");
  }
}

export interface StartRunInput {
  query: string;
  mode: Mode;
  asOf?: string;
  replayPresetId?: string;
  marketEventId?: string;
  threadId?: string;
  portfolioId?: string;
}

export interface RuntimeOptions {
  deps: AgentDeps;
  checkpointer?: BaseCheckpointSaver;
  nodes?: NodeSet;
}

/** Runs the agent graph in-process (SPEC 5.5, rule 6): at most two runs at a time, one per thread. */
export class AgentRuntime {
  private readonly graph: ReturnType<typeof buildGraph>;
  private readonly deps: AgentDeps;
  private readonly finishedRuns = new Map<string, Promise<void>>();
  private readonly busyThreads = new Set<string>();
  private readonly controller = new AbortController();

  constructor(options: RuntimeOptions) {
    this.deps = options.deps;
    this.graph = buildGraph(options.nodes ?? defaultNodes(), options.checkpointer);
  }

  private resolveAsOf(input: StartRunInput): { asOf: string; replayEventId: string | null } {
    const preset = input.replayPresetId ? REPLAY_PRESETS.find((p) => p.id === input.replayPresetId) : undefined;
    if (input.replayPresetId && !preset) throw new InvalidRunError(`Unknown replay preset ${input.replayPresetId}.`);
    if (input.mode === "live") return { asOf: this.deps.now().toISOString(), replayEventId: null };
    const asOf = input.asOf ?? preset?.asOf;
    if (!asOf) throw new InvalidRunError("Replay needs an as-of time or a preset.");
    const t = Date.parse(asOf);
    if (Number.isNaN(t) || t < Date.parse(EARLIEST_REPLAY_AS_OF) || t > this.deps.now().getTime()) {
      throw new InvalidRunError("Replay as-of must be between 2017-01-01 and now.");
    }
    return { asOf: new Date(t).toISOString(), replayEventId: preset?.id ?? null };
  }

  /** Creates the run and returns at once; the graph continues in the background. */
  async start(input: StartRunInput): Promise<{ runId: string; threadId: string }> {
    if (activeRunCount() >= MAX_CONCURRENT_RUNS) throw new TooManyRunsError();
    if (input.threadId && this.busyThreads.has(input.threadId)) throw new ThreadBusyError();
    const { asOf, replayEventId } = this.resolveAsOf(input);
    const { runId, threadId } = await this.deps.runs.create({
      threadId: input.threadId,
      query: input.query,
      mode: input.mode,
      asOf,
      replayEventId,
      marketEventId: input.marketEventId ?? null,
      portfolioId: input.portfolioId ?? null,
    });
    const ctx: RunContext = {
      runId,
      threadId,
      query: input.query.trim(),
      mode: input.mode,
      asOf,
      portfolioId: input.portfolioId ?? null,
      replayEventId,
      marketEventId: input.marketEventId ?? null,
      ledger: new Ledger(),
      deps: this.deps,
      signal: this.controller.signal,
      startedAtMs: Date.now(),
      totals: { tokensIn: 0, tokensOut: 0, costUsd: 0 },
      warnings: [],
      memo: new Map(),
      degraded: new Set(),
      emit: async (event: RunEvent) => void (await this.deps.runs.appendEvent(runId, event)),
    };
    registerRun(ctx);
    this.busyThreads.add(threadId);
    const done = this.execute(ctx).finally(() => {
      unregisterRun(runId);
      this.busyThreads.delete(threadId);
      setTimeout(() => this.finishedRuns.delete(runId), 60_000).unref();
    });
    this.finishedRuns.set(runId, done);
    return { runId, threadId };
  }

  /** Resolves when the run has stored its last event. For scripts and tests. */
  finished(runId: string): Promise<void> {
    return this.finishedRuns.get(runId) ?? Promise.resolve();
  }

  /** Aborts every run in flight (api shutdown). */
  cancelAll(): void {
    this.controller.abort();
  }

  private async execute(ctx: RunContext): Promise<void> {
    try {
      await ctx.emit({ type: "run.started", runId: ctx.runId, mode: ctx.mode, asOf: ctx.asOf, query: ctx.query });
      const final = (await this.graph.invoke(
        { runId: ctx.runId },
        { configurable: { thread_id: ctx.threadId, runId: ctx.runId }, signal: ctx.signal },
      )) as RunStateValue;
      await this.complete(ctx, final);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error("run failed", { runId: ctx.runId, error });
      await ctx.emit({ type: "run.failed", error }).catch(() => undefined);
      await this.deps.runs
        .complete(ctx.runId, {
          status: "failed",
          warnings: ctx.warnings,
          totals: { ...ctx.totals, durationMs: Date.now() - ctx.startedAtMs },
          error,
        })
        .catch((e) => logger.error("run row not closed", { runId: ctx.runId, error: String(e) }));
    }
  }

  private async complete(ctx: RunContext, final: RunStateValue): Promise<void> {
    const answer = final.answer;
    if (!answer) throw new Error("the graph finished without an answer");
    const status = answer.source === "template" || ctx.degraded.size > 0 ? "partial" : "succeeded";
    const totals = { ...ctx.totals, durationMs: Date.now() - ctx.startedAtMs };
    const eventProfile = final.eventOut?.status === "ok" ? final.eventOut.profile : null;
    const hedgePlan = final.hedgingOut?.status === "ok" ? final.hedgingOut.plan : null;
    const risk = final.riskOut?.status === "ok" ? final.riskOut.report : null;
    const forecast = final.analogsOut?.status === "ok" ? final.analogsOut.forecast : null;
    const warnings = [...ctx.warnings];
    await ctx.emit({
      type: "run.completed",
      status,
      answer,
      eventProfile,
      hedgePlan,
      risk,
      forecast,
      confidence: answer.confidence,
      warnings,
      totals,
    });
    await this.deps.runs.complete(ctx.runId, {
      status,
      plan: final.plan,
      eventProfile,
      answer,
      hedgePlan,
      risk,
      forecast,
      verification: final.verification,
      confidence: answer.confidence,
      warnings,
      totals,
    });
  }
}
