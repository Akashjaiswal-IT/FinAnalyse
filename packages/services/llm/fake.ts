import { MAX_TOOL_ITERATIONS } from "@repo/contracts";
import { env } from "../env";
import { makeUsage } from "./cost";
import type { Llm, LlmFailure, StructuredCall, StructuredResult, ToolCall, ToolsResult } from "./model";

const FAILURE = Symbol("fake-llm-failure");

interface FakeFailure {
  [FAILURE]: true;
  reason: LlmFailure["reason"];
  detail: string;
}

/** Return this from a handler to make that call fail the way the real service does. */
export function fakeFailure(reason: LlmFailure["reason"], detail = `fake ${reason}`): FakeFailure {
  return { [FAILURE]: true, reason, detail };
}

const isFailure = (v: unknown): v is FakeFailure => typeof v === "object" && v !== null && FAILURE in v;

type StructuredHandler = (call: StructuredCall<unknown>, n: number) => unknown;
type ToolHandler = (call: ToolCall, n: number) => Promise<void> | void;

export interface FakeCall {
  kind: "structured" | "tools";
  label: string;
  user: string;
}

/** Scripted stand-in for `LlmService`. A label with no handler fails with reason `error`, so a missing
 * script shows up as a degraded node, not a crash. */
export class FakeLlm implements Llm {
  readonly calls: FakeCall[] = [];
  private readonly counts = new Map<string, number>();

  constructor(
    private readonly structured: Record<string, StructuredHandler> = {},
    private readonly tools: Record<string, ToolHandler> = {},
  ) {}

  private next(label: string): number {
    const n = this.counts.get(label) ?? 0;
    this.counts.set(label, n + 1);
    return n;
  }

  count(label: string): number {
    return this.counts.get(label) ?? 0;
  }

  async parseStructured<T>(call: StructuredCall<T>): Promise<StructuredResult<T>> {
    this.calls.push({ kind: "structured", label: call.label, user: call.user });
    const n = this.next(call.label);
    const usage = makeUsage(call.tier === "reasoning" ? env.MODEL_REASONING : env.MODEL_FAST, Math.ceil((call.system.length + call.user.length) / 4), 100);
    const handler = this.structured[call.label];
    if (!handler) return { ok: false, reason: "error", detail: `fake: no handler for ${call.label}`, usage: null };
    try {
      const out = await handler(call as StructuredCall<unknown>, n);
      if (isFailure(out)) return { ok: false, reason: out.reason, detail: out.detail, usage };
      const parsed = call.schema.safeParse(out);
      if (!parsed.success) return { ok: false, reason: "parse", detail: parsed.error.message, usage };
      return { ok: true, data: parsed.data, usage, thinkingSummary: call.tier === "reasoning" ? "fake thinking summary" : null };
    } catch (err) {
      return { ok: false, reason: "error", detail: err instanceof Error ? err.message : String(err), usage };
    }
  }

  async runTools(call: ToolCall): Promise<ToolsResult> {
    this.calls.push({ kind: "tools", label: call.label, user: call.user });
    const n = this.next(call.label);
    const usage = makeUsage(call.tier === "reasoning" ? env.MODEL_REASONING : env.MODEL_FAST, Math.ceil((call.system.length + call.user.length) / 4), 200);
    const handler = this.tools[call.label];
    if (!handler) return { ok: false, reason: "error", detail: `fake: no tool handler for ${call.label}`, usage: null };
    try {
      await handler(call, n);
      return { ok: true, iterations: Math.min(call.maxIterations ?? MAX_TOOL_ITERATIONS, MAX_TOOL_ITERATIONS), finalText: "", usage, thinkingSummary: "fake thinking summary" };
    } catch (err) {
      return { ok: false, reason: "error", detail: err instanceof Error ? err.message : String(err), usage };
    }
  }
}
