"use client";

import { createContext, useContext } from "react";
import type { NodeName } from "@repo/contracts";
import type { RunView } from "~/lib/run-state";

/** What the drilldown sheet opens on. Chips, graph nodes, hedge rows and exposure badges each set one. */
export type DrilldownTarget =
  | { kind: "run" }
  | { kind: "node"; node: NodeName }
  | { kind: "evidence"; key: string }
  | { kind: "hedge"; index: number }
  | { kind: "exposure"; symbol: string }
  | { kind: "verification" };

interface RunContextValue {
  view: RunView;
  openDrilldown: (target: DrilldownTarget) => void;
}

const RunContext = createContext<RunContextValue | null>(null);

export const RunProvider = RunContext.Provider;

export function useRun(): RunContextValue {
  const value = useContext(RunContext);
  if (!value) throw new Error("useRun must be used inside a RunProvider");
  return value;
}
