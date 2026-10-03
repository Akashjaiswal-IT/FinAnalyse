import { z } from "zod";
import { Confidence, Sector, Skipped, TemplateText, Unavailable } from "./common";
import { EvidenceKey } from "./evidence";
import { HypotheticalStormParams, HubForecast, AtRiskRefinery, Storm, TrackLabel } from "./weather";
import { MacroSnapshot } from "./macro";
import { AnalogMatch, Forecast } from "./analog";
import { EventProfile, EventType, HypotheticalEventParams } from "./event";
import { RiskReport, HedgePlan } from "./portfolio";

export const Intent = z.enum([
  "event_impact",
  "portfolio_risk",
  "hedge",
  "what_if",
  "news_scan",
  "explain",
  "out_of_scope",
]);
export type Intent = z.infer<typeof Intent>;

export const EventSource = z.enum(["live", "replay", "hypothetical", "none"]);
export type EventSource = z.infer<typeof EventSource>;

/** Output of the planner LLM call (and of the rule-based fallback). */
export const Plan = z.object({
  intent: Intent,
  event: z.object({
    source: EventSource,
    type: EventType.nullable(),
    subtype: z.string().nullable(),
    name: z.string().nullable().describe("the event as named in the question"),
    entities: z.array(z.string()).describe("universe symbols named in the question"),
    externalNames: z.array(z.string()).describe("non-universe companies named in the question"),
    marketEventId: z.string().nullable(),
    stormId: z.string().nullable(),
    stormName: z.string().nullable(),
    hypothetical: HypotheticalEventParams.nullable(),
    hypotheticalStorm: HypotheticalStormParams.nullable(),
    categoryOverride: z.number().int().min(1).max(5).nullable(),
  }),
  focusSymbols: z.array(z.string()),
  focusSectors: z.array(z.string()),
  horizonDays: z.number().int().positive().default(5),
  specialists: z.object({
    weather: z.boolean(),
    sentiment: z.boolean(),
    macro: z.boolean(),
    analogs: z.boolean(),
  }),
  reallocation: z.boolean(),
  source: z.enum(["model", "fallback"]).default("model"),
});
export type Plan = z.infer<typeof Plan>;

/** 1 to 3 short findings written by a specialist LLM call. Numbers never come from here. */
export const Notes = z.object({
  findings: z
    .array(z.object({ template: z.string(), evidenceKeys: z.array(EvidenceKey).min(1) }))
    .min(1)
    .max(3),
});
export type Notes = z.infer<typeof Notes>;

export const Finding = z.object({
  text: TemplateText,
  evidenceKeys: z.array(EvidenceKey),
});
export type Finding = z.infer<typeof Finding>;

const Ok = z.literal("ok");

/** For `news_scan`, `others` holds up to two more events, listed with their exposure only. */
export const EventOutput = z.union([
  z.object({
    status: Ok,
    profile: EventProfile,
    others: z.array(EventProfile).max(2),
    findings: z.array(Finding),
  }),
  Unavailable,
  Skipped,
]);
export type EventOutput = z.infer<typeof EventOutput>;

export const WeatherOutput = z.union([
  z.object({
    status: Ok,
    storm: Storm,
    forecastLabel: TrackLabel.nullable(),
    currentCategory: z.number().int(),
    peakCategory: z.number().int(),
    landfallAt: z.string().nullable(),
    landfallRegion: z.string().nullable(),
    refineriesAtRisk: z.number().int(),
    gulfCapAtRisk: z.number().describe("fraction of PADD 3 capacity"),
    companyCapAtRisk: z.record(z.string(), z.number()),
    atRisk: z.array(AtRiskRefinery),
    hubs: z.array(HubForecast).nullable(),
    /** The weather features of the analog model (SPEC 5.9) for this storm, for the `analogs` node. */
    features: z
      .object({
        windKt: z.number().nullable(),
        capAtRisk: z.number().nullable(),
        offshoreExposure: z.number().nullable(),
      })
      .optional(),
    findings: z.array(Finding),
  }),
  Unavailable,
  Skipped,
]);
export type WeatherOutput = z.infer<typeof WeatherOutput>;

export const SentimentOutput = z.union([
  z.object({
    status: Ok,
    sectors: z.array(z.object({ sector: Sector, score: z.number(), n: z.number().int() })),
    peerGroups: z.array(z.object({ symbols: z.array(z.string()), score: z.number(), n: z.number().int() })),
    holdings: z.array(z.object({ symbol: z.string(), score: z.number(), n: z.number().int() })),
    gdelt: z
      .object({ toneZ: z.number().nullable(), volZ: z.number().nullable() })
      .describe("copied from the event profile; computed once by the event node (SPEC 5.9)"),
    newsIds: z.array(z.string()),
    findings: z.array(Finding),
  }),
  Unavailable,
  Skipped,
]);
export type SentimentOutput = z.infer<typeof SentimentOutput>;

export const MacroOutput = z.union([
  z.object({ status: Ok, snapshot: MacroSnapshot, findings: z.array(Finding) }),
  Unavailable,
  Skipped,
]);
export type MacroOutput = z.infer<typeof MacroOutput>;

export const AnalogsOutput = z.union([
  z.object({
    status: Ok,
    forecast: Forecast,
    parallels: z.object({
      sameType: z.array(AnalogMatch).max(3),
      otherType: z.array(AnalogMatch).max(3),
    }),
    findings: z.array(Finding),
  }),
  Unavailable,
  Skipped,
]);
export type AnalogsOutput = z.infer<typeof AnalogsOutput>;

export const RiskOutput = z.union([
  z.object({ status: Ok, report: RiskReport }),
  Unavailable,
  Skipped,
]);
export type RiskOutput = z.infer<typeof RiskOutput>;

export const HedgingOutput = z.union([
  z.object({ status: Ok, plan: HedgePlan }),
  Unavailable,
  Skipped,
]);
export type HedgingOutput = z.infer<typeof HedgingOutput>;

/** Output of the synthesizer LLM call: templates only. */
export const AnswerDraft = z.object({
  headline: z.string(),
  summary: z.string(),
  bullets: z.array(z.object({ text: z.string(), evidenceKeys: z.array(EvidenceKey).min(1) })),
  caveats: z.array(z.string()),
});
export type AnswerDraft = z.infer<typeof AnswerDraft>;

export const Answer = z.object({
  headline: TemplateText,
  summary: TemplateText,
  bullets: z.array(z.object({ text: TemplateText, evidenceKeys: z.array(EvidenceKey) })),
  caveats: z.array(TemplateText),
  confidence: Confidence,
  badges: z.object({ replay: z.boolean(), hypothetical: z.boolean() }),
  source: z.enum(["model", "template"]),
});
export type Answer = z.infer<typeof Answer>;

export const VerificationCheck = z.object({
  name: z.enum(["placeholders", "digits", "hedge_limits", "universe", "caveats"]),
  passed: z.boolean(),
  violations: z.array(z.string()),
});

export const Verification = z.object({
  passed: z.boolean(),
  repairAttempted: z.boolean(),
  checks: z.array(VerificationCheck),
  appendedCaveats: z.array(z.string()),
});
export type Verification = z.infer<typeof Verification>;
