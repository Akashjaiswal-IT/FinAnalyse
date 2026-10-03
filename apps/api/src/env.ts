import { z } from "zod";

const envSchema = z.object({
  PORT: z.string().optional(),
  DATABASE_URL: z.string().min(1),
  NODE_ENV: z.enum(["development", "prod", "production", "test"]).default("development"),
  BASE_URL: z.string().default("http://localhost:8000"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  DEMO_TOKEN: z.string().optional(),
  /** "1" serves the agent graph from fixture data instead of the seeded services. */
  FAKE_SERVICES: z.string().optional(),
});

function createEnv(env: NodeJS.ProcessEnv) {
  const safeParseResult = envSchema.safeParse(env);
  if (!safeParseResult.success) throw new Error(safeParseResult.error.message);
  return safeParseResult.data;
}

export const env = createEnv(process.env);
