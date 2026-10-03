import { timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import type { AgentRuntime } from "@repo/agents";
import type { RunsService } from "@repo/services/runs";

/** What the routes need from the process that hosts them. `apps/api` sets it once at boot. */
export interface ApiRuntime {
  agents: AgentRuntime;
  runs: RunsService;
  /** When set, `runs.create` and `system.ingestNow` require this value in the `x-demo-token` header. */
  demoToken?: string;
}

let current: ApiRuntime | undefined;

export function setApiRuntime(runtime: ApiRuntime | undefined): void {
  current = runtime;
}

export function apiRuntime(): ApiRuntime {
  if (!current) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The server is still starting." });
  return current;
}

/** UNAUTHORIZED unless the header matches the configured token. No token configured means open. */
export function requireDemoToken(provided: string | undefined): void {
  const expected = current?.demoToken;
  if (!expected) return;
  const a = Buffer.from(provided ?? "");
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Missing or wrong x-demo-token." });
  }
}
