import { NODE_ORDER, type RunEvent, type Step } from "@repo/contracts";

/** The step list of a run, derived from its events (SPEC 7: `runs.get` returns steps derived from events). */
export function deriveSteps(events: readonly RunEvent[]): Step[] {
  const steps = new Map<string, Step>(
    NODE_ORDER.map((node) => [
      node,
      { node, status: "pending", startedAt: null, durationMs: null, summary: null, output: null, usage: null, thinkingSummary: null, error: null },
    ]),
  );
  for (const e of events) {
    if (e.type === "step.started") {
      const s = steps.get(e.node);
      if (s) steps.set(e.node, { ...s, status: "running", startedAt: e.at });
    } else if (e.type === "step.completed") {
      const s = steps.get(e.node);
      if (s) {
        steps.set(e.node, {
          ...s,
          status: e.status,
          durationMs: e.durationMs,
          summary: e.summary,
          output: e.output ?? null,
          usage: e.usage ?? null,
          thinkingSummary: e.thinkingSummary ?? null,
        });
      }
    } else if (e.type === "step.failed") {
      const s = steps.get(e.node);
      if (s) steps.set(e.node, { ...s, status: "failed", durationMs: e.durationMs, error: e.error });
    }
  }
  return [...steps.values()];
}
