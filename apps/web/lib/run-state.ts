import {
  EventOutput,
  NODE_ORDER,
  Plan,
  RiskOutput,
  SentimentOutput,
  Verification,
  WeatherOutput,
  type Answer,
  type Confidence,
  type EventProfile,
  type Evidence,
  type Forecast,
  type HedgePlan,
  type Mode,
  type NodeName,
  type RiskReport,
  type RunEvent,
  type RunStatus,
  type RunTotals,
  type Usage,
} from "@repo/contracts";
import type { ZodType } from "zod";

/** Node colours in the graph: the contract's three completion statuses plus the two live ones. */
export type NodeVisualStatus = "pending" | "running" | "done" | "skipped" | "degraded" | "failed";

export interface NodeView {
  node: NodeName;
  status: NodeVisualStatus;
  startedAt: string | null;
  durationMs: number | null;
  summary: string | null;
  /** Raw `step.completed` output, shown in the drilldown. Typed copies of some outputs live on `RunView`. */
  output: unknown;
  usage: Usage | null;
  thinkingSummary: string | null;
  error: string | null;
  progress: string[];
  /** The verifier can send the run back to the synthesizer once, so a node can start twice. */
  starts: number;
}

export type RunPhase = "idle" | RunStatus;

export interface RunView {
  phase: RunPhase;
  runId: string | null;
  mode: Mode | null;
  asOf: string | null;
  query: string | null;
  nodes: Record<NodeName, NodeView>;
  evidence: Evidence[];
  evidenceByKey: Record<string, Evidence>;
  plan: Plan | null;
  eventProfile: EventProfile | null;
  otherEvents: EventProfile[];
  weather: WeatherOutput | null;
  sentiment: SentimentOutput | null;
  risk: RiskReport | null;
  verification: Verification | null;
  /**
   * Set only by `run.completed`. The synthesizer's and hedging node's own output can still be rejected by
   * the verifier, and LLM-authored text must not reach the screen before that check (SPEC 5.6).
   */
  answer: Answer | null;
  hedgePlan: HedgePlan | null;
  forecast: Forecast | null;
  confidence: Confidence | null;
  warnings: string[];
  totals: RunTotals | null;
  error: string | null;
}

function pendingNode(node: NodeName): NodeView {
  return {
    node,
    status: "pending",
    startedAt: null,
    durationMs: null,
    summary: null,
    output: null,
    usage: null,
    thinkingSummary: null,
    error: null,
    progress: [],
    starts: 0,
  };
}

export function initialRunView(): RunView {
  const nodes = {} as Record<NodeName, NodeView>;
  for (const node of NODE_ORDER) nodes[node] = pendingNode(node);
  return {
    phase: "idle",
    runId: null,
    mode: null,
    asOf: null,
    query: null,
    nodes,
    evidence: [],
    evidenceByKey: {},
    plan: null,
    eventProfile: null,
    otherEvents: [],
    weather: null,
    sentiment: null,
    risk: null,
    verification: null,
    answer: null,
    hedgePlan: null,
    forecast: null,
    confidence: null,
    warnings: [],
    totals: null,
    error: null,
  };
}

/** Validates a node's `unknown` output. A mismatch means the contract drifted: warn once and show nothing. */
function parsed<T>(schema: ZodType<T>, node: NodeName, output: unknown): T | null {
  const result = schema.safeParse(output);
  if (result.success) return result.data;
  console.warn(`[run-state] ${node} output does not match its contract`, result.error.issues.slice(0, 3));
  return null;
}

/** The typed pieces of a node output that the panels read before the run completes. */
function absorbOutput(node: NodeName, output: unknown): Partial<RunView> {
  switch (node) {
    case "planner":
      return { plan: parsed(Plan, node, output) };
    case "event": {
      const o = parsed(EventOutput, node, output);
      return o?.status === "ok" ? { eventProfile: o.profile, otherEvents: o.others } : {};
    }
    case "weather":
      return { weather: parsed(WeatherOutput, node, output) };
    case "sentiment":
      return { sentiment: parsed(SentimentOutput, node, output) };
    case "risk": {
      const o = parsed(RiskOutput, node, output);
      return o?.status === "ok" ? { risk: o.report } : {};
    }
    case "verifier":
      return { verification: parsed(Verification, node, output) };
    default:
      return {};
  }
}

function withNode(view: RunView, node: NodeName, patch: Partial<NodeView>): Record<NodeName, NodeView> {
  return { ...view.nodes, [node]: { ...view.nodes[node], ...patch } };
}

/** Folds one `RunEvent` into the view. Pure, so the same function serves the fixture player and the API. */
export function applyRunEvent(view: RunView, event: RunEvent): RunView {
  switch (event.type) {
    case "run.started":
      return {
        ...initialRunView(),
        phase: "running",
        runId: event.runId,
        mode: event.mode,
        asOf: event.asOf,
        query: event.query,
      };

    case "step.started":
      return {
        ...view,
        nodes: withNode(view, event.node, {
          status: "running",
          startedAt: event.at,
          error: null,
          progress: [],
          starts: view.nodes[event.node].starts + 1,
        }),
      };

    case "step.progress":
      return {
        ...view,
        nodes: withNode(view, event.node, { progress: [...view.nodes[event.node].progress, event.message] }),
      };

    case "step.completed":
      return {
        ...view,
        ...absorbOutput(event.node, event.output),
        nodes: withNode(view, event.node, {
          status: event.status,
          durationMs: event.durationMs,
          summary: event.summary,
          output: event.output,
          usage: event.usage ?? null,
          thinkingSummary: event.thinkingSummary ?? null,
          error: null,
        }),
      };

    case "step.failed":
      return {
        ...view,
        nodes: withNode(view, event.node, { status: "failed", durationMs: event.durationMs, error: event.error }),
      };

    case "evidence.added": {
      const byKey = { ...view.evidenceByKey };
      for (const e of event.evidence) byKey[e.key] = e;
      return { ...view, evidenceByKey: byKey, evidence: Object.values(byKey) };
    }

    case "run.completed":
      return {
        ...view,
        phase: event.status,
        answer: event.answer,
        eventProfile: event.eventProfile ?? view.eventProfile,
        hedgePlan: event.hedgePlan,
        risk: event.risk ?? view.risk,
        forecast: event.forecast,
        confidence: event.confidence,
        warnings: event.warnings,
        totals: event.totals,
      };

    case "run.failed":
      return { ...view, phase: "failed", error: event.error };
  }
}

export function reduceRunEvents(events: readonly RunEvent[]): RunView {
  return events.reduce(applyRunEvent, initialRunView());
}

export function isRunActive(view: RunView): boolean {
  return view.phase === "running";
}
