import type { z } from "zod";
import type { Usage } from "@repo/contracts";

export type ModelTier = "reasoning" | "fast";
/** Sonnet only: Haiku rejects the effort parameter (docs/ROADMAP.md section 5, item 8). */
export type Effort = "low" | "medium" | "high";

export interface StructuredCall<T> {
  /** Names the call in logs and routes it in the fake, for example `planner` or `notes:macro`. */
  label: string;
  tier: ModelTier;
  system: string;
  /** Data as JSON (docs/SPEC.md section 5.7). */
  user: string;
  schema: z.ZodType<T>;
  maxTokens: number;
  effort?: Effort;
  signal?: AbortSignal;
}

export type LlmFailureReason = "refusal" | "max_tokens" | "parse" | "error";

export interface LlmFailure {
  ok: false;
  reason: LlmFailureReason;
  detail: string;
  usage: Usage | null;
}

export type StructuredResult<T> =
  | { ok: true; data: T; usage: Usage; thinkingSummary: string | null }
  | LlmFailure;

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  /** The string goes back to the model as the tool result. A throw becomes an error result. */
  run: (input: never) => Promise<string> | string;
}

export interface ToolCall {
  label: string;
  tier: ModelTier;
  system: string;
  user: string;
  tools: ToolDef[];
  maxTokens: number;
  effort?: Effort;
  /** Defaults to MAX_TOOL_ITERATIONS. */
  maxIterations?: number;
  signal?: AbortSignal;
}

export type ToolsResult =
  | { ok: true; iterations: number; finalText: string; usage: Usage; thinkingSummary: string | null }
  | LlmFailure;

/** The only way the rest of the system talks to a model. `LlmService` is real, `FakeLlm` is for tests. */
export interface Llm {
  parseStructured<T>(call: StructuredCall<T>): Promise<StructuredResult<T>>;
  runTools(call: ToolCall): Promise<ToolsResult>;
}
