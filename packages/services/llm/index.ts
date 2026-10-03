import type Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { MAX_TOOL_ITERATIONS } from "@repo/contracts";
import { logger } from "@repo/logger";
import { anthropic } from "../clients/anthropic";
import { sourceRecorder, type SourceRecorder } from "../clients/redis";
import { env } from "../env";
import { addUsage, makeUsage } from "./cost";
import { llmFormat, toLlmSchema } from "./schema";
import type {
  Effort,
  Llm,
  LlmFailure,
  ModelTier,
  StructuredCall,
  StructuredResult,
  ToolCall,
  ToolsResult,
} from "./model";

export * from "./model";
export * from "./cost";
export * from "./schema";
export { FakeLlm, fakeFailure } from "./fake";

/** Opt-in server-side retry on a substitute model when the requested one declines (docs/DECISIONS.md). */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

type Message = Anthropic.Beta.Messages.BetaMessage;

function modelFor(tier: ModelTier): string {
  return tier === "reasoning" ? env.MODEL_REASONING : env.MODEL_FAST;
}

function usageOf(m: Message) {
  const u = m.usage;
  const tokensIn = u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  return makeUsage(m.model, tokensIn, u.output_tokens);
}

function thinkingOf(m: Message): string | null {
  const text = m.content
    .flatMap((b) => (b.type === "thinking" ? [b.thinking] : []))
    .join("\n")
    .trim();
  return text || null;
}

function textOf(m: Message): string {
  return m.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
}

function refusalDetail(m: Message): string {
  const d = m.stop_details;
  return d && d.type === "refusal" ? `refusal (${d.category ?? "uncategorised"})` : "refusal";
}

/** Sonnet gets explicit effort, adaptive summarized thinking and server-side fallback. Haiku gets neither,
 * and temperature 0. Sonnet rejects temperature, top_p and top_k (docs/ROADMAP.md section 5, item 8). */
function tierParams(tier: ModelTier, effort: Effort | undefined) {
  return tier === "fast"
    ? { params: { temperature: 0 }, effort: undefined }
    : {
        params: {
          thinking: { type: "adaptive" as const, display: "summarized" as const },
          fallbacks: "default" as const,
          betas: [FALLBACK_BETA],
        },
        effort: effort ?? ("medium" as const),
      };
}

/** Haiku calls (notes, classification, scoring) are optional and have a fallback, so they get a short leash;
 * Sonnet calls keep the client defaults (SPEC 5.7). */
function requestOptions(tier: ModelTier, signal: AbortSignal | undefined) {
  return tier === "fast" ? { signal, timeout: 15_000, maxRetries: 1 } : { signal };
}

function systemBlock(text: string) {
  return [{ type: "text" as const, text, cache_control: { type: "ephemeral" as const } }];
}

function failure(reason: LlmFailure["reason"], detail: string, usage: LlmFailure["usage"]): LlmFailure {
  return { ok: false, reason, detail, usage };
}

export class LlmService implements Llm {
  constructor(
    private readonly getClient: () => Anthropic = anthropic,
    private readonly record: SourceRecorder = () => undefined,
  ) {}

  async parseStructured<T>(call: StructuredCall<T>, retried = false): Promise<StructuredResult<T>> {
    const { params, effort } = tierParams(call.tier, call.effort);
    const started = Date.now();
    try {
      const message = await this.getClient().beta.messages.parse(
        {
          model: modelFor(call.tier),
          max_tokens: call.maxTokens,
          system: systemBlock(call.system),
          messages: [{ role: "user", content: call.user }],
          output_config: { ...(effort ? { effort } : {}), format: llmFormat(call.schema) },
          ...params,
        },
        requestOptions(call.tier, call.signal),
      );
      this.record(null, Date.now() - started);
      const usage = usageOf(message);
      if (message.stop_reason === "refusal") {
        logger.warn("llm refusal", { label: call.label, detail: refusalDetail(message) });
        return failure("refusal", refusalDetail(message), usage);
      }
      if (message.stop_reason === "max_tokens") {
        if (retried) return failure("max_tokens", `${call.label}: output hit ${call.maxTokens} tokens twice`, usage);
        const again = await this.parseStructured({ ...call, maxTokens: call.maxTokens * 2 }, true);
        return again.ok
          ? { ...again, usage: addUsage(usage, again.usage) }
          : { ...again, usage: again.usage ? addUsage(usage, again.usage) : usage };
      }
      if (message.parsed_output === null) return failure("parse", `${call.label}: no parsed output`, usage);
      return { ok: true, data: message.parsed_output as T, usage, thinkingSummary: thinkingOf(message) };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      logger.warn("llm call failed", { label: call.label, detail });
      this.record(err, Date.now() - started);
      return failure("error", detail, null);
    }
  }

  async runTools(call: ToolCall): Promise<ToolsResult> {
    const { params, effort } = tierParams(call.tier, call.effort);
    const maxIterations = Math.min(call.maxIterations ?? MAX_TOOL_ITERATIONS, MAX_TOOL_ITERATIONS);
    let usage: LlmFailure["usage"] = null;
    let thinking: string | null = null;
    let finalText = "";
    let iterations = 0;
    const started = Date.now();
    try {
      const runner = this.getClient().beta.messages.toolRunner(
        {
          model: modelFor(call.tier),
          max_tokens: call.maxTokens,
          system: systemBlock(call.system),
          messages: [{ role: "user", content: call.user }],
          tools: call.tools.map((t) => ({
            ...betaZodTool({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
              run: (input) => (t.run as (i: unknown) => Promise<string> | string)(input),
            }),
            input_schema: toLlmSchema(t.inputSchema) as { type: "object" },
            strict: true,
          })),
          max_iterations: maxIterations,
          output_config: effort ? { effort } : undefined,
          ...params,
        },
        { signal: call.signal },
      );
      for await (const message of runner) {
        iterations += 1;
        usage = addUsage(usage, usageOf(message));
        thinking = thinkingOf(message) ?? thinking;
        finalText = textOf(message);
        if (message.stop_reason === "refusal") return failure("refusal", refusalDetail(message), usage);
        if (message.stop_reason === "max_tokens") return failure("max_tokens", `${call.label}: output truncated`, usage);
      }
      if (!usage) return failure("error", `${call.label}: no response`, null);
      this.record(null, Date.now() - started);
      return { ok: true, iterations, finalText, usage, thinkingSummary: thinking };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      logger.warn("llm tool loop failed", { label: call.label, detail });
      this.record(err, Date.now() - started);
      return failure("error", detail, usage);
    }
  }
}

let shared: Llm | undefined;

/** The process-wide model client. Tests and drills replace it with `setLlm`. */
export function llm(): Llm {
  shared ??= new LlmService(anthropic, sourceRecorder("anthropic"));
  return shared;
}

export function setLlm(next: Llm | undefined): void {
  shared = next;
}
