import { config } from "@repo/eslint-config/base";
import { boundaries } from "@repo/eslint-config/boundaries";

export default [...config, boundaries(["database", "services", "quant", "agents", "trpc", "logger"], { browser: true })];
