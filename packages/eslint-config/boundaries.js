const APPS = ["api", "worker"];
const NODE_BUILTINS = [
  "node:*",
  "fs",
  "fs/*",
  "path",
  "os",
  "net",
  "http",
  "https",
  "child_process",
  "crypto",
  "stream",
  "worker_threads",
];

/**
 * Enforces the dependency rules in docs/SPEC.md section 3.
 *
 * @param {string[]} forbid  @repo packages (without scope) this package must not import. Apps are always forbidden.
 * @param {{ pure?: boolean, browser?: boolean, anthropic?: boolean, extraPatterns?: object[] }} [options]
 *   pure: no I/O, no clock, no unseeded randomness (quant). browser: no Node builtins (contracts).
 *   anthropic: forbid @anthropic-ai/* (everything except services/llm).
 * @returns {import("eslint").Linter.Config}
 */
export function boundaries(forbid, options = {}) {
  const { pure = false, browser = false, anthropic = true, extraPatterns = [] } = options;
  const patterns = [...APPS, ...forbid].map((name) => ({
    group: [`@repo/${name}`, `@repo/${name}/*`],
    message: `Forbidden dependency: this package must not import @repo/${name} (docs/SPEC.md section 3).`,
  }));
  if (anthropic) {
    patterns.push({
      group: ["@anthropic-ai/*"],
      message: "Only packages/services/llm calls the Anthropic API.",
    });
  }
  if (pure || browser) {
    patterns.push({
      group: NODE_BUILTINS,
      message: pure
        ? "quant is pure: no I/O."
        : "contracts is browser-safe: no Node builtins.",
    });
  }

  const rules = {
    "no-restricted-imports": ["error", { patterns: [...patterns, ...extraPatterns] }],
  };
  if (pure) {
    rules["no-restricted-properties"] = [
      "error",
      { object: "Date", property: "now", message: "quant never reads the clock." },
      { object: "Math", property: "random", message: "quant has no unseeded randomness." },
      { object: "performance", property: "now", message: "quant never reads the clock." },
    ];
    rules["no-restricted-syntax"] = [
      "error",
      {
        selector: "NewExpression[callee.name='Date'][arguments.length=0]",
        message: "quant never reads the clock.",
      },
    ];
  }
  return { rules };
}
