import { z } from "zod";
import { Confidence, IsoDateTime, Mode, NodeName, NodeStatus } from "./common";
import { Evidence } from "./evidence";
import { Answer, Plan, Verification } from "./agents";
import { Forecast } from "./analog";
import { EventProfile } from "./event";
import { HedgePlan, RiskReport } from "./portfolio";

export const RunStatus = z.enum(["running", "succeeded", "partial", "failed"]);
export type RunStatus = z.infer<typeof RunStatus>;

export const Usage = z.object({
  model: z.string(),
  tokensIn: z.number().int(),
  tokensOut: z.number().int(),
  costUsd: z.number(),
});
export type Usage = z.infer<typeof Usage>;

export const RunTotals = z.object({
  tokensIn: z.number().int(),
  tokensOut: z.number().int(),
  costUsd: z.number(),
  durationMs: z.number().int(),
});
export type RunTotals = z.infer<typeof RunTotals>;

export const RunEvent = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("run.started"),
    runId: z.string(),
    mode: Mode,
    asOf: IsoDateTime,
    query: z.string(),
  }),
  z.object({ type: z.literal("step.started"), node: NodeName, at: IsoDateTime }),
  z.object({ type: z.literal("step.progress"), node: NodeName, message: z.string() }),
  z.object({
    type: z.literal("step.completed"),
    node: NodeName,
    status: NodeStatus,
    durationMs: z.number().int(),
    summary: z.string(),
    output: z.unknown(),
    usage: Usage.optional(),
    thinkingSummary: z.string().optional(),
  }),
  z.object({
    type: z.literal("step.failed"),
    node: NodeName,
    error: z.string(),
    durationMs: z.number().int(),
  }),
  z.object({ type: z.literal("evidence.added"), evidence: z.array(Evidence) }),
  z.object({
    type: z.literal("run.completed"),
    status: RunStatus,
    answer: Answer.nullable(),
    eventProfile: EventProfile.nullable(),
    hedgePlan: HedgePlan.nullable(),
    risk: RiskReport.nullable(),
    forecast: Forecast.nullable(),
    confidence: Confidence.nullable(),
    warnings: z.array(z.string()),
    totals: RunTotals,
  }),
  z.object({ type: z.literal("run.failed"), error: z.string() }),
]);
export type RunEvent = z.infer<typeof RunEvent>;
export type RunEventType = RunEvent["type"];

export const RunsCreateInput = z.object({
  threadId: z.uuid().optional(),
  query: z.string().min(1).max(500),
  mode: Mode,
  asOf: IsoDateTime.optional(),
  replayPresetId: z.string().optional(),
  marketEventId: z.uuid().optional(),
});
export type RunsCreateInput = z.infer<typeof RunsCreateInput>;

export const RunsCreateOutput = z.object({ runId: z.uuid(), threadId: z.uuid() });
export type RunsCreateOutput = z.infer<typeof RunsCreateOutput>;

export const Step = z.object({
  node: NodeName,
  status: z.enum(["pending", "running", "done", "skipped", "degraded", "failed"]),
  startedAt: IsoDateTime.nullable(),
  durationMs: z.number().int().nullable(),
  summary: z.string().nullable(),
  output: z.unknown().nullable(),
  usage: Usage.nullable(),
  thinkingSummary: z.string().nullable(),
  error: z.string().nullable(),
});
export type Step = z.infer<typeof Step>;

export const Run = z.object({
  id: z.uuid(),
  threadId: z.uuid(),
  query: z.string(),
  mode: Mode,
  asOf: IsoDateTime,
  replayEventId: z.string().nullable(),
  marketEventId: z.string().nullable(),
  status: RunStatus,
  plan: Plan.nullable(),
  eventProfile: EventProfile.nullable(),
  answer: Answer.nullable(),
  hedgePlan: HedgePlan.nullable(),
  risk: RiskReport.nullable(),
  forecast: Forecast.nullable(),
  verification: Verification.nullable(),
  confidence: Confidence.nullable(),
  warnings: z.array(z.string()),
  tokensIn: z.number().int(),
  tokensOut: z.number().int(),
  costUsd: z.number(),
  startedAt: IsoDateTime,
  finishedAt: IsoDateTime.nullable(),
  error: z.string().nullable(),
});
export type Run = z.infer<typeof Run>;

export const RunsGetInput = z.object({ runId: z.uuid() });
export const RunsGetOutput = z.object({
  run: Run,
  evidence: z.array(Evidence),
  steps: z.array(Step),
});
export type RunsGetOutput = z.infer<typeof RunsGetOutput>;

export const RunsListInput = z.object({
  threadId: z.uuid().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
export const RunsListOutput = z.array(Run);

export const RunsStreamInput = z.object({
  runId: z.uuid(),
  lastEventId: z.string().optional(),
});
