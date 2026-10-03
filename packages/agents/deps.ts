import type { Llm } from "@repo/services/llm";
import type { RunsService } from "@repo/services/runs";

/** Everything a node may touch, passed in so tests can swap each part for a fake. */
export interface AgentDeps {
  llm: Llm;
  runs: RunsService;
  now: () => Date;
  /** Market events and storms the planner may mention. Absent until Track A's services are wired. */
  activeContext?: (asOf: string) => Promise<{ events: unknown[]; storms: unknown[] }>;
}
