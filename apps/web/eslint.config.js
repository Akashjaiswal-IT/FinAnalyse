import { nextJsConfig } from "@repo/eslint-config/next-js";
import { boundaries } from "@repo/eslint-config/boundaries";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextJsConfig,
  // TypeScript checks props; prop-types would only add noise to shadcn components.
  { rules: { "react/prop-types": "off" } },
  // env.js runs under Node at build time.
  { files: ["env.js"], languageOptions: { globals: { process: "readonly" } } },
  // web imports only @repo/contracts and the client side of @repo/trpc (docs/SPEC.md section 3, rule 2).
  boundaries(["database", "services", "quant", "agents", "logger"], {
    extraPatterns: [
      {
        group: ["@repo/trpc/server", "@repo/trpc/server/*"],
        message: "web may import only types and the client from @repo/trpc/client.",
      },
    ],
  }),
];
