import { z } from "zod";

// The SDK helper (betaZodOutputFormat, 0.131.0) moves `enum` and `const` into the description text, so the
// API no longer constrains the model to the enum values. This transform keeps them and drops only the
// keywords structured outputs rejects, listing what it dropped in the description. Zod re-checks every
// reply locally, so a dropped constraint can only cost a parse failure, which degrades the node.

type Json = Record<string, unknown>;

const SUPPORTED_FORMATS = new Set(["date-time", "time", "date", "duration", "email", "hostname", "uri", "ipv4", "ipv6", "uuid"]);
const KEPT = new Set(["type", "description", "title", "enum", "const", "$ref"]);

function strict(node: unknown): Json {
  if (typeof node !== "object" || node === null) return {};
  const src = { ...(node as Json) };
  const out: Json = {};

  const defs = src["$defs"] as Json | undefined;
  if (defs) out["$defs"] = Object.fromEntries(Object.entries(defs).map(([k, v]) => [k, strict(v)]));
  delete src["$defs"];

  for (const key of Object.keys(src)) if (KEPT.has(key)) out[key] = src[key];

  const union = (src["anyOf"] ?? src["oneOf"]) as unknown[] | undefined;
  if (Array.isArray(union)) out["anyOf"] = union.map(strict);
  if (Array.isArray(src["allOf"])) out["allOf"] = (src["allOf"] as unknown[]).map(strict);

  if (src["type"] === "object") {
    out["properties"] = Object.fromEntries(
      Object.entries((src["properties"] ?? {}) as Json).map(([k, v]) => [k, strict(v)]),
    );
    out["required"] = src["required"] ?? [];
    out["additionalProperties"] = false;
  }
  if (src["type"] === "array") {
    if (src["items"] !== undefined) out["items"] = strict(src["items"]);
    if (src["minItems"] === 0 || src["minItems"] === 1) out["minItems"] = src["minItems"];
  }
  if (src["type"] === "string" && typeof src["format"] === "string" && SUPPORTED_FORMATS.has(src["format"])) {
    out["format"] = src["format"];
  }

  const dropped = Object.entries(src).filter(([key, value]) => {
    if (KEPT.has(key) || ["$defs", "anyOf", "oneOf", "allOf", "properties", "required", "additionalProperties", "items", "$schema"].includes(key)) return false;
    if (key === "format") return !SUPPORTED_FORMATS.has(value as string);
    if (key === "minItems") return value !== 0 && value !== 1;
    return true;
  });
  if (dropped.length > 0) {
    const note = `{${dropped.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ")}}`;
    out["description"] = out["description"] ? `${out["description"]}\n\n${note}` : note;
  }
  return out;
}

/** JSON Schema for structured outputs and strict tools. */
export function toLlmSchema(schema: z.ZodType): Json {
  return strict(z.toJSONSchema(schema, { reused: "ref" }));
}

/** Drop-in for `betaZodOutputFormat` that keeps enums. `parse` is called by `beta.messages.parse`. */
export function llmFormat<T>(schema: z.ZodType<T>) {
  return {
    type: "json_schema" as const,
    schema: toLlmSchema(schema),
    parse(content: string): T {
      const result = schema.safeParse(JSON.parse(content));
      if (!result.success) throw new Error(`structured output failed validation: ${result.error.message}`);
      return result.data;
    },
  };
}
