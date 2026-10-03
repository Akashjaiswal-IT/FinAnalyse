import { config } from "@repo/eslint-config/base";
import { boundaries } from "@repo/eslint-config/boundaries";

export default [
  ...config,
  boundaries(["agents", "trpc"]),
  {
    // The only code allowed to call the Anthropic API (docs/SPEC.md section 3, rule 5).
    files: ["llm/**", "clients/anthropic.ts"],
    ...boundaries(["agents", "trpc"], { anthropic: false }),
  },
];
