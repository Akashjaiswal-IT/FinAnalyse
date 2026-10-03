import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { AnswerDraft, EventClassification, HedgeSubmission, Notes, Plan } from "@repo/contracts";
import { costUsd } from "./cost";
import { FakeLlm, fakeFailure } from "./fake";
import { llmFormat, toLlmSchema } from "./schema";
import { LlmService, type StructuredCall } from "./index";

const Out = z.object({ answer: z.string() });

function message(over: Record<string, unknown> = {}) {
  return {
    model: "claude-sonnet-5-5",
    stop_reason: "end_turn",
    stop_details: null,
    content: [{ type: "thinking", thinking: "weighed the options" }, { type: "text", text: '{"answer":"ok"}' }],
    usage: { input_tokens: 1_000, output_tokens: 500, cache_creation_input_tokens: null, cache_read_input_tokens: null },
    ...over,
  };
}

function serviceWith(parse: ReturnType<typeof vi.fn>, toolRunner: ReturnType<typeof vi.fn> = vi.fn()) {
  const client = { beta: { messages: { parse, toolRunner } } } as unknown as Anthropic;
  return new LlmService(() => client);
}

const call = (over: Partial<StructuredCall<{ answer: string }>> = {}): StructuredCall<{ answer: string }> => ({
  label: "planner",
  tier: "reasoning",
  system: "system",
  user: "{}",
  schema: Out,
  maxTokens: 4_000,
  effort: "low",
  ...over,
});

describe("LlmService.parseStructured", () => {
  it("sends explicit effort, summarized adaptive thinking and fallbacks on Sonnet, with no temperature", async () => {
    const parse = vi.fn().mockResolvedValue(message());
    const result = await serviceWith(parse).parseStructured(call());
    const body = parse.mock.calls[0]?.[0];
    expect(body.output_config.effort).toBe("low");
    expect(body.output_config.format).toBeDefined();
    expect(body.thinking).toEqual({ type: "adaptive", display: "summarized" });
    expect(body.fallbacks).toBe("default");
    expect(body.betas).toContain("server-side-fallback-2026-07-01");
    expect(body).not.toHaveProperty("temperature");
    expect(body.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(result).toMatchObject({ ok: true, data: { answer: "ok" }, thinkingSummary: "weighed the options" });
  });

  it("sends temperature 0 and no effort, thinking or fallbacks on Haiku", async () => {
    const parse = vi.fn().mockResolvedValue(message({ model: "claude-haiku-4-5", content: [{ type: "text", text: '{"answer":"ok"}' }] }));
    const result = await serviceWith(parse).parseStructured(call({ tier: "fast", effort: undefined }));
    const body = parse.mock.calls[0]?.[0];
    expect(body.temperature).toBe(0);
    expect(parse.mock.calls[0]?.[1]).toMatchObject({ timeout: 15_000, maxRetries: 1 });
    expect(body.output_config).not.toHaveProperty("effort");
    expect(body).not.toHaveProperty("thinking");
    expect(body).not.toHaveProperty("fallbacks");
    expect(result).toMatchObject({ ok: true, thinkingSummary: null });
  });

  it("prices usage from MODEL_PRICES", async () => {
    const parse = vi.fn().mockResolvedValue(message());
    const result = await serviceWith(parse).parseStructured(call());
    expect(result.ok && result.usage.costUsd).toBeCloseTo((1_000 * 2 + 500 * 10) / 1e6, 10);
    expect(costUsd("claude-haiku-4-5-20251001", 1_000_000, 1_000_000)).toBe(6);
    expect(costUsd("unknown-model", 1, 1)).toBe(0);
  });

  it("degrades on a refusal without reading content", async () => {
    const parse = vi.fn().mockResolvedValue(
      message({ stop_reason: "refusal", stop_details: { type: "refusal", category: "general_harms" }, content: [] }),
    );
    const result = await serviceWith(parse).parseStructured(call());
    expect(result).toMatchObject({ ok: false, reason: "refusal" });
    expect(!result.ok && result.detail).toContain("general_harms");
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("retries once at double max_tokens, then degrades", async () => {
    const truncated = message({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"answer":"cut o' }] });
    const parse = vi.fn().mockResolvedValueOnce(truncated).mockResolvedValueOnce(message());
    const recovered = await serviceWith(parse).parseStructured(call());
    expect(parse.mock.calls.map((c) => c[0].max_tokens)).toEqual([4_000, 8_000]);
    expect(recovered.ok && recovered.usage.tokensIn).toBe(2_000);

    const stuck = vi.fn().mockResolvedValue(truncated);
    const failed = await serviceWith(stuck).parseStructured(call());
    expect(stuck).toHaveBeenCalledTimes(2);
    expect(failed).toMatchObject({ ok: false, reason: "max_tokens" });
  });

  it("sends a format without a parse function and reports a reply that fails validation", async () => {
    const parse = vi.fn().mockResolvedValue(message({ content: [{ type: "text", text: '{"answer":5}' }] }));
    const result = await serviceWith(parse).parseStructured(call());
    expect(parse.mock.calls[0]?.[0].output_config.format).not.toHaveProperty("parse");
    expect(result).toMatchObject({ ok: false, reason: "parse" });
    expect(result.ok === false && result.usage?.tokensIn).toBe(1_000);
  });

  it("returns a failure instead of throwing when the API call throws", async () => {
    const parse = vi.fn().mockRejectedValue(new Error("529 overloaded"));
    const result = await serviceWith(parse).parseStructured(call());
    expect(result).toMatchObject({ ok: false, reason: "error", detail: "529 overloaded" });
  });
});

describe("LlmService.runTools", () => {
  it("builds strict tools, caps iterations at six and sums usage", async () => {
    const toolRunner = vi.fn().mockReturnValue(
      (async function* () {
        yield message({ stop_reason: "tool_use" });
        yield message({ content: [{ type: "text", text: "done" }] });
      })(),
    );
    const result = await serviceWith(vi.fn(), toolRunner).runTools({
      label: "hedging",
      tier: "reasoning",
      system: "s",
      user: "{}",
      tools: [{ name: "simulate_hedges", description: "d", inputSchema: z.object({ n: z.number() }), run: () => "ok" }],
      maxTokens: 16_000,
      effort: "medium",
      maxIterations: 20,
    });
    const body = toolRunner.mock.calls[0]?.[0];
    expect(body.max_iterations).toBe(6);
    expect(body.tools[0]).toMatchObject({ name: "simulate_hedges", strict: true });
    expect(body.output_config).toEqual({ effort: "medium" });
    expect(result).toMatchObject({ ok: true, iterations: 2, finalText: "done" });
    expect(result.ok && result.usage.tokensIn).toBe(2_000);
  });

  it("degrades on a refusal inside the loop", async () => {
    const toolRunner = vi.fn().mockReturnValue(
      (async function* () {
        yield message({ stop_reason: "refusal", stop_details: { type: "refusal", category: null } });
      })(),
    );
    const result = await serviceWith(vi.fn(), toolRunner).runTools({
      label: "hedging", tier: "reasoning", system: "s", user: "{}", tools: [], maxTokens: 100,
    });
    expect(result).toMatchObject({ ok: false, reason: "refusal" });
  });
});

describe("structured output schemas", () => {
  it.each([
    ["Plan", Plan],
    ["Notes", Notes],
    ["EventClassification", EventClassification],
    ["AnswerDraft", AnswerDraft],
    ["HedgeSubmission", HedgeSubmission],
  ])("%s converts to a strict JSON schema", (_name, schema) => {
    const format = llmFormat(schema as z.ZodType);
    const text = JSON.stringify(format.schema);
    expect(format.type).toBe("json_schema");
    for (const banned of ["minimum", "maximum", "exclusiveMinimum", "pattern", "minLength", "$schema"]) {
      expect(text).not.toContain(`"${banned}":`);
    }
  });

  it("keeps enums, which the SDK helper moves into the description", () => {
    const json = toLlmSchema(z.object({ side: z.enum(["buy", "sell"]), n: z.number().int().positive() }));
    expect(json).toMatchObject({
      additionalProperties: false,
      required: ["side", "n"],
      properties: { side: { type: "string", enum: ["buy", "sell"] }, n: { type: "integer" } },
    });
  });

  it("validates the reply against the Zod schema", () => {
    const format = llmFormat(Out);
    expect(format.parse('{"answer":"x"}')).toEqual({ answer: "x" });
    expect(() => format.parse('{"answer":1}')).toThrow(/validation/);
  });
});

describe("FakeLlm", () => {
  it("validates handler output against the call's schema and routes by label", async () => {
    const fake = new FakeLlm({ planner: () => ({ answer: "x" }), bad: () => ({ nope: 1 }), refused: () => fakeFailure("refusal") });
    expect(await fake.parseStructured(call())).toMatchObject({ ok: true, data: { answer: "x" } });
    expect(await fake.parseStructured(call({ label: "bad" }))).toMatchObject({ ok: false, reason: "parse" });
    expect(await fake.parseStructured(call({ label: "refused" }))).toMatchObject({ ok: false, reason: "refusal" });
    expect(await fake.parseStructured(call({ label: "unscripted" }))).toMatchObject({ ok: false, reason: "error" });
    expect(fake.count("planner")).toBe(1);
  });
});
