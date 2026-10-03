import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/contracts",
      "packages/quant",
      "packages/agents",
      "packages/services",
      "packages/trpc",
      "apps/api",
      "apps/worker",
    ],
  },
});
