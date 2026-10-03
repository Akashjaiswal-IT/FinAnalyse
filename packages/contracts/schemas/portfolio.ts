import { z } from "zod";
import { IsoDateTime, Sector, TemplateText } from "./common";
import { EvidenceKey } from "./evidence";

export const PositionView = z.object({
  symbol: z.string(),
  name: z.string(),
  sector: Sector.nullable(),
  targetWeight: z.number(),
  quantity: z.number().int(),
  price: z.number(),
  value: z.number(),
  weight: z.number(),
  change1d: z.number().nullable(),
});
export type PositionView = z.infer<typeof PositionView>;

export const PortfolioSnapshot = z.object({
  portfolioId: z.string(),
  name: z.string(),
  asOf: IsoDateTime,
  nav: z.number(),
  cash: z.number(),
  positions: z.array(PositionView),
});
export type PortfolioSnapshot = z.infer<typeof PortfolioSnapshot>;

export const PortfolioGetInput = z.object({ asOf: IsoDateTime.optional() });

export const FactorExposure = z.object({
  holding: z.string(),
  factor: z.string(),
  beta: z.number(),
  r2: z.number(),
});
export type FactorExposure = z.infer<typeof FactorExposure>;

export const VarCvar = z.object({ var95: z.number(), cvar95: z.number() });

export const RiskSnapshot = z.object({
  var1d: VarCvar,
  var5d: VarCvar,
  energyBeta: z.number().describe("sleeve beta to the mapped commodity factors"),
  scenarioPnl: z.number(),
});
export type RiskSnapshot = z.infer<typeof RiskSnapshot>;

export const RiskReport = z.object({
  asOf: IsoDateTime,
  nav: z.number(),
  var1d: VarCvar,
  var5d: VarCvar,
  exposures: z.array(FactorExposure),
  topFactorExposures: z.array(z.object({ factor: z.string(), beta: z.number() })),
  correlations: z.object({
    symbols: z.array(z.string()),
    matrix: z.array(z.array(z.number())),
  }),
  scenario: z.object({
    pnl: z.number(),
    pctNav: z.number(),
    perHolding: z.array(z.object({ symbol: z.string(), pnl: z.number() })),
  }),
  analogPnl: z
    .object({ weightedMean: z.number(), worst: z.number(), n: z.number().int() })
    .nullable(),
  gamma: z.object({ value: z.number(), se: z.number().nullable(), n: z.number().int() }),
});
export type RiskReport = z.infer<typeof RiskReport>;

export const HedgeActionType = z.enum(["hedge", "reallocation"]);
export const Side = z.enum(["buy", "sell"]);
export const Timing = z.enum(["now", "before_landfall", "staged"]);
export const OrderType = z.enum(["market", "limit"]);

/** What the model submits through the `submit_plan` tool: templates only. */
export const HedgeActionDraft = z.object({
  type: HedgeActionType,
  symbol: z.string(),
  side: Side,
  quantity: z.number().int().positive(),
  timing: Timing,
  orderType: OrderType,
  exitTrigger: z.string(),
  rationale: z.string(),
  evidenceKeys: z.array(EvidenceKey).min(1),
});
export type HedgeActionDraft = z.infer<typeof HedgeActionDraft>;

export const HedgeAction = HedgeActionDraft.extend({
  notional: z.number(),
  exitTrigger: TemplateText,
  rationale: TemplateText,
});
export type HedgeAction = z.infer<typeof HedgeAction>;

export const HedgeSubmission = z.object({
  actions: z.array(HedgeActionDraft),
  summary: z.string(),
});
export type HedgeSubmission = z.infer<typeof HedgeSubmission>;

export const LimitViolation = z.object({
  rule: z.enum(["gross_notional", "single_action", "adv", "integer_quantity", "menu", "universe"]),
  symbol: z.string().nullable(),
  message: z.string(),
});
export type LimitViolation = z.infer<typeof LimitViolation>;

export const HedgePlan = z.object({
  source: z.enum(["model", "fallback"]),
  actions: z.array(HedgeAction),
  summary: TemplateText,
  grossNotional: z.number(),
  before: RiskSnapshot,
  after: RiskSnapshot,
  violations: z.array(LimitViolation),
});
export type HedgePlan = z.infer<typeof HedgePlan>;
