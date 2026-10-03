import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const keySchema = z.object({ ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is not set") });

let client: Anthropic | undefined;

/** Validated lazily so processes that never call the model (the worker's price jobs) need no key. */
export function anthropic(): Anthropic {
  if (!client) {
    const { ANTHROPIC_API_KEY } = keySchema.parse(process.env);
    client = new Anthropic({ apiKey: ANTHROPIC_API_KEY, maxRetries: 2, timeout: 60_000 });
  }
  return client;
}
