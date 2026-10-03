import type { PortfolioSnapshot, RunEvent } from "@repo/contracts";
import {
  FIXTURE_RUN_ID,
  FIXTURE_RUN_ID_UKRAINE,
  buildFixturePortfolio,
  idaRunEvents,
  ukraineRunEvents,
} from "@repo/contracts/fixtures";

// Phase 1 builds on the contracts fixtures (packages/contracts/fixtures). Every value in them is hand-built
// development data, labelled "fixture" in its evidence rows. Phase 2 swaps these reads for the real API.

export interface FixtureRun {
  presetId: string;
  runId: string;
  events: readonly RunEvent[];
}

const FIXTURE_RUNS: readonly FixtureRun[] = [
  { presetId: "geopolitical-russia-ukraine-2022", runId: FIXTURE_RUN_ID_UKRAINE, events: ukraineRunEvents },
  { presetId: "disaster-hurricane-ida-2021", runId: FIXTURE_RUN_ID, events: idaRunEvents },
];

export function fixtureRunForPreset(presetId: string | null): FixtureRun | null {
  return FIXTURE_RUNS.find((r) => r.presetId === presetId) ?? null;
}

export function hasFixtureRun(presetId: string): boolean {
  return fixtureRunForPreset(presetId) !== null;
}

/** The fixture portfolio at an as-of. Live mode has no as-of, so it reads the most recent fixture date. */
export function fixturePortfolioAt(asOf: string | null): PortfolioSnapshot {
  return buildFixturePortfolio(asOf ?? "2022-02-25T03:00:00.000Z");
}
