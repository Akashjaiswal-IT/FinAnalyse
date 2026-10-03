import { config } from "@repo/eslint-config/base";
import { boundaries } from "@repo/eslint-config/boundaries";

export default [...config, boundaries(["database", "services", "agents", "trpc", "logger"], { pure: true })];
