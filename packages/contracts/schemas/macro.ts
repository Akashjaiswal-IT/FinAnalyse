import { z } from "zod";
import { IsoDate, IsoDateTime } from "./common";

export const MacroObservation = z.object({
  seriesId: z.string(),
  date: IsoDate,
  value: z.number(),
});
export type MacroObservation = z.infer<typeof MacroObservation>;

export const InventoryFlag = z.enum(["tight", "normal", "loose"]);
export const VixFlag = z.enum(["calm", "elevated", "stressed"]);

const Inventory = z.object({
  value: z.number(),
  fiveYearAvg: z.number(),
  deviation: z.number().describe("fraction vs the 5-year same-week average"),
  flag: InventoryFlag,
});

/** Inventories are null when the portfolio has no energy exposure (SPEC 5.5). */
export const MacroSnapshot = z.object({
  asOf: IsoDateTime,
  gasolineStocks: Inventory.nullable(),
  crudeStocks: Inventory.nullable(),
  vix: z.object({ value: z.number(), z: z.number().nullable(), flag: VixFlag }),
  yield10y: z.object({ value: z.number(), change20d: z.number() }),
  dollarIndex: z.object({ value: z.number(), change20d: z.number() }),
  fedFunds: z.number(),
});
export type MacroSnapshot = z.infer<typeof MacroSnapshot>;

export const MacroSnapshotInput = z.object({ asOf: IsoDateTime.optional() });
