import { idaEvidence, idaNodeOutputs, ukraineEvidence, ukraineNodeOutputs } from "@repo/contracts/fixtures";
import type { Evidence } from "@repo/contracts";
import type { NodeImpl } from "../context";
import { forecastTag, TAG } from "../tags";

// Phase 1 stand-ins for the seven data nodes: each returns the contracts fixture output and registers the fixture
// evidence rows it produced, so the real planner, synthesizer and verifier run against a complete ledger.
// Replaced node by node in Phase 2.

interface Fixture {
  evidence: Evidence[];
  outputs: typeof idaNodeOutputs | typeof ukraineNodeOutputs;
  tags: Record<string, string>;
}

const UKRAINE: Fixture = {
  evidence: ukraineEvidence,
  outputs: ukraineNodeOutputs,
  tags: {
    E1: TAG.eventTitle, E2: TAG.eventVolZ, E3: TAG.eventToneZ, E4: TAG.eventArticles, E7: TAG.macroVix,
    E9: forecastTag("WTI"), E10: forecastTag("GLD"), E11: forecastTag("SPY"), E14: TAG.analogsEffectiveN,
    E15: TAG.riskNav, E16: TAG.riskVar1d, E17: TAG.riskScenarioPnl, E18: TAG.exposedDirect, E19: TAG.exposedFactor,
    E21: TAG.hedgeAfterPnl, E22: TAG.hedgeGross,
  },
};

const IDA: Fixture = {
  evidence: idaEvidence,
  outputs: idaNodeOutputs,
  tags: {
    E2: TAG.eventTitle, E3: TAG.eventVolZ, E4: TAG.eventToneZ, E12: TAG.macroVix,
    E13: forecastTag("GULF_GASOLINE"), E14: forecastTag("WTI"), E15: forecastTag("HH_NATGAS"), E16: TAG.analogsEffectiveN,
    E17: TAG.riskNav, E18: TAG.riskVar1d, E19: TAG.riskScenarioPnl, E20: TAG.exposedDirect,
    E22: TAG.hedgeAfterPnl, E23: TAG.hedgeGross,
  },
};

type DataNode = "event" | "weather" | "sentiment" | "macro" | "analogs" | "risk" | "hedging";

export const DATA_NODES: readonly DataNode[] = ["event", "weather", "sentiment", "macro", "analogs", "risk", "hedging"];

export function stubNode(node: DataNode): NodeImpl {
  return (state, env) => {
    const fixture = state.plan?.event.type === "disaster" || env.ctx.replayEventId?.includes("ida") ? IDA : UKRAINE;
    for (const row of fixture.evidence.filter((e) => e.producedBy === node)) env.ctx.ledger.restore(row, fixture.tags[row.key]);
    const output = fixture.outputs[node];
    return {
      update: { [`${node}Out`]: output },
      status: output.status === "skipped" ? "skipped" : "done",
      summary: `Fixture ${node} output`,
      output,
    };
  };
}
