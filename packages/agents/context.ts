import type { RunnableConfig } from "@langchain/core/runnables";
import type { Llm, StructuredCall, ToolCall } from "@repo/services/llm";
import { sumUsage } from "@repo/services/llm";
import { logger } from "@repo/logger";
import type { Mode, NodeName, NodeStatus, RunEvent, Usage } from "@repo/contracts";
import type { AgentDeps } from "./deps";
import { Ledger, type NewEvidence } from "./ledger";
import type { RunStateUpdate, RunStateValue } from "./state";

/** Per-run state that cannot enter the graph state: it is not serialisable (SPEC 5.5, rule 3). The graph
 * receives only `runId` through `configurable`. */
export interface RunContext {
  runId: string;
  threadId: string;
  query: string;
  mode: Mode;
  asOf: string;
  portfolioId: string | null;
  replayEventId: string | null;
  marketEventId: string | null;
  ledger: Ledger;
  deps: AgentDeps;
  signal: AbortSignal;
  startedAtMs: number;
  totals: { tokensIn: number; tokensOut: number; costUsd: number };
  warnings: string[];
  /** Nodes that ended `degraded`; any entry makes the run `partial`. */
  degraded: Set<string>;
  emit: (event: RunEvent) => Promise<void>;
}

const registry = new Map<string, RunContext>();

export function registerRun(ctx: RunContext): void {
  registry.set(ctx.runId, ctx);
}

export function unregisterRun(runId: string): void {
  registry.delete(runId);
}

export function activeRunCount(): number {
  return registry.size;
}

export function activeRunIds(): string[] {
  return [...registry.keys()];
}

export function getRunContext(config: RunnableConfig | undefined): RunContext {
  const runId = (config?.configurable as { runId?: string } | undefined)?.runId;
  const ctx = runId ? registry.get(runId) : undefined;
  if (!ctx) throw new Error(`no run context registered for run ${runId ?? "(none)"}`);
  return ctx;
}

class UsageSink {
  readonly usages: Usage[] = [];
  thinking: string | null = null;

  summed(): Usage | undefined {
    const last = this.usages.at(-1);
    if (!last) return undefined;
    return { model: last.model, ...sumUsage(this.usages) };
  }
}

/** Wraps the model client so every call lands in the node's step usage and the run totals, whether it
 * succeeded or not. */
function tracked(llm: Llm, ctx: RunContext, sink: UsageSink): Llm {
  const record = (usage: Usage | null, thinking: string | null) => {
    if (usage) {
      sink.usages.push(usage);
      ctx.totals.tokensIn += usage.tokensIn;
      ctx.totals.tokensOut += usage.tokensOut;
      ctx.totals.costUsd += usage.costUsd;
    }
    if (thinking) sink.thinking = thinking;
  };
  return {
    async parseStructured<T>(call: StructuredCall<T>) {
      const r = await llm.parseStructured({ signal: ctx.signal, ...call });
      record(r.usage, r.ok ? r.thinkingSummary : null);
      return r;
    },
    async runTools(call: ToolCall) {
      const r = await llm.runTools({ signal: ctx.signal, ...call });
      record(r.usage, r.ok ? r.thinkingSummary : null);
      return r;
    },
  };
}

export interface NodeEnv {
  ctx: RunContext;
  /** Tracked: use this, never `ctx.deps.llm`. */
  llm: Llm;
  /** Adds an evidence row produced by this node. */
  evidence: (input: NewEvidence) => string;
  progress: (message: string) => void;
}

export interface NodeOutcome {
  update: RunStateUpdate;
  status: NodeStatus;
  summary: string;
  output: unknown;
}

export type NodeImpl = (state: RunStateValue, env: NodeEnv) => Promise<NodeOutcome> | NodeOutcome;
export type Recover = (state: RunStateValue, env: NodeEnv, error: Error) => Promise<NodeOutcome> | NodeOutcome;

const OUTPUT_KEY = {
  event: "eventOut",
  weather: "weatherOut",
  sentiment: "sentimentOut",
  macro: "macroOut",
  analogs: "analogsOut",
  risk: "riskOut",
  hedging: "hedgingOut",
} as const;

/** A thrown error becomes `{ status: "unavailable", reason }` and the graph continues (SPEC 5.5, rule 4). */
export function degradedOutcome(node: NodeName, reason: string): NodeOutcome {
  const output = { status: "unavailable" as const, reason };
  const key = OUTPUT_KEY[node as keyof typeof OUTPUT_KEY];
  return {
    update: key ? ({ [key]: output } as RunStateUpdate) : {},
    status: "degraded",
    summary: `Unavailable: ${reason}`,
    output,
  };
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Wraps a node: step events with duration, usage and thinking summary, evidence persistence, and the
 * degrade-and-continue rule. */
export function instrumentNode(node: NodeName, impl: NodeImpl, recover?: Recover) {
  return async (state: RunStateValue, config?: RunnableConfig): Promise<RunStateUpdate> => {
    const ctx = getRunContext(config);
    const started = Date.now();
    const sink = new UsageSink();
    const env: NodeEnv = {
      ctx,
      llm: tracked(ctx.deps.llm, ctx, sink),
      evidence: (input) => ctx.ledger.add(node, input),
      progress: (message) => void safeEmit(ctx, { type: "step.progress", node, message }),
    };

    await safeEmit(ctx, { type: "step.started", node, at: ctx.deps.now().toISOString() });
    let outcome: NodeOutcome;
    try {
      ctx.signal.throwIfAborted();
      outcome = await impl(state, env);
    } catch (err) {
      if (ctx.signal.aborted) {
        await safeEmit(ctx, { type: "step.failed", node, error: "cancelled", durationMs: Date.now() - started });
        throw err;
      }
      const error = err instanceof Error ? err : new Error(errorMessage(err));
      logger.warn("node failed, degrading", { node, runId: ctx.runId, error: error.message });
      ctx.warnings.push(`${node}: ${error.message}`);
      try {
        outcome = recover ? await recover(state, env, error) : degradedOutcome(node, error.message);
      } catch (recoverErr) {
        outcome = degradedOutcome(node, errorMessage(recoverErr));
      }
      outcome = { ...outcome, status: "degraded" };
    }
    if (outcome.status === "degraded") ctx.degraded.add(node);

    const usage = sink.summed();
    await safeEmit(ctx, {
      type: "step.completed",
      node,
      status: outcome.status,
      durationMs: Date.now() - started,
      summary: outcome.summary,
      output: outcome.output,
      ...(usage ? { usage } : {}),
      ...(sink.thinking ? { thinkingSummary: sink.thinking } : {}),
    });
    const rows = ctx.ledger.drain(node);
    if (rows.length > 0) {
      await ctx.deps.runs.addEvidence(ctx.runId, rows).catch((e) => logger.warn("evidence not stored", { error: errorMessage(e) }));
      await safeEmit(ctx, { type: "evidence.added", evidence: rows });
    }
    return outcome.update;
  };
}

async function safeEmit(ctx: RunContext, event: RunEvent): Promise<void> {
  try {
    await ctx.emit(event);
  } catch (err) {
    logger.warn("run event not stored", { runId: ctx.runId, type: event.type, error: errorMessage(err) });
  }
}

