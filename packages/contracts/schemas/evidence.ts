import { z } from "zod";
import { IsoDateTime, Unit } from "./common";

export const EvidenceKind = z.enum([
  "price",
  "news",
  "weather",
  "macro",
  "analog",
  "computation",
  "model",
  "assumption",
  "portfolio",
]);
export type EvidenceKind = z.infer<typeof EvidenceKind>;

export const EvidenceBasis = z.enum(["observed", "computed", "model", "assumption"]);
export type EvidenceBasis = z.infer<typeof EvidenceBasis>;

/** Keys are `E1`, `E2`, ... per run. */
export const EvidenceKey = z.string().regex(/^E\d+$/);

export const Evidence = z.object({
  key: EvidenceKey,
  kind: EvidenceKind,
  label: z.string(),
  value: z.number().nullable(),
  textValue: z.string().nullable(),
  unit: Unit.nullable(),
  basis: EvidenceBasis,
  source: z.string(),
  sourceRef: z.string().nullable(),
  asOf: IsoDateTime.nullable(),
  stale: z.boolean(),
  producedBy: z.string(),
  payload: z.unknown().nullable(),
});
export type Evidence = z.infer<typeof Evidence>;
