import type { MacroObservation, MacroSnapshot } from "@repo/contracts";
import { notImplemented } from "../not-implemented";

/** FRED series and EIA weekly inventories from Postgres. Weekly series lag 5 days (SPEC 5.1). */
export class MacroService {
  /** `energyExposure` false leaves the inventories null (SPEC 5.5). */
  async snapshot(asOf: Date, energyExposure = true): Promise<MacroSnapshot> {
    return notImplemented(asOf, energyExposure);
  }

  async series(id: string, from: string | undefined, asOf: Date): Promise<MacroObservation[]> {
    return notImplemented(id, from, asOf);
  }
}
