import { z } from "zod";

// Shared variables only. Each client validates its own keys on first use, so the api
// does not need worker-only keys and the reverse (docs/SPEC.md section 3, rule 9).
const envSchema = z.object({
  REDIS_URL: z.string().default("redis://localhost:6379"),
  MODEL_REASONING: z.string().default("claude-sonnet-5-5"),
  MODEL_FAST: z.string().default("claude-haiku-4-5"),
  DISABLE_SOURCES: z
    .string()
    .default("")
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean)),
});

function createEnv(env: NodeJS.ProcessEnv) {
  const safeParseResult = envSchema.safeParse(env);
  if (!safeParseResult.success) throw new Error(safeParseResult.error.message);
  return safeParseResult.data;
}

export const env = createEnv(process.env);
