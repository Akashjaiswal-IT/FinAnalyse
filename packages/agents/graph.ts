import { END, START, StateGraph, type BaseCheckpointSaver } from "@langchain/langgraph";
import type { NodeName } from "@repo/contracts";
import { instrumentNode, type NodeImpl, type Recover } from "./context";
import { analogsNode } from "./nodes/analogs";
import { eventNode } from "./nodes/event";
import { hedgingNode } from "./nodes/hedging";
import { macroNode } from "./nodes/macro";
import { plannerNode, plannerRecover } from "./nodes/planner";
import { riskNode } from "./nodes/risk";
import { sentimentNode } from "./nodes/sentiment";
import { DATA_NODES, stubNode } from "./nodes/stubs";
import { weatherNode } from "./nodes/weather";
import { synthesizerNode, synthesizerRecover } from "./nodes/synthesizer";
import { verifierNode, verifierRecover } from "./nodes/verifier";
import { RunState, type RunStateValue } from "./state";

export type NodeSet = Record<NodeName, NodeImpl>;

/** The ten nodes. */
export const defaultNodes = (): NodeSet => ({
  planner: plannerNode,
  event: eventNode,
  weather: weatherNode,
  sentiment: sentimentNode,
  macro: macroNode,
  analogs: analogsNode,
  risk: riskNode,
  hedging: hedgingNode,
  synthesizer: synthesizerNode,
  verifier: verifierNode,
});

/** The real planner, synthesizer and verifier around fixture outputs for the seven data nodes. For tests of the
 * orchestration (event order, degradation, repair) that must not depend on service data. */
export const fixtureNodes = (): NodeSet => ({
  planner: plannerNode,
  event: stubNode("event"),
  weather: stubNode("weather"),
  sentiment: stubNode("sentiment"),
  macro: stubNode("macro"),
  analogs: stubNode("analogs"),
  risk: stubNode("risk"),
  hedging: stubNode("hedging"),
  synthesizer: synthesizerNode,
  verifier: verifierNode,
});

const RECOVER: Partial<Record<NodeName, Recover>> = {
  planner: plannerRecover,
  synthesizer: synthesizerRecover,
  verifier: verifierRecover,
};

/** After the verifier: end, or one repair pass through the synthesizer (SPEC 5.5). */
export function afterVerifier(state: RunStateValue): "synthesizer" | typeof END {
  return state.answer === null ? "synthesizer" : END;
}

/** The graph has the same shape on every run, so the UI graph is stable (SPEC 5.5). */
export function buildGraph(nodes: NodeSet, checkpointer?: BaseCheckpointSaver) {
  const wrap = (name: NodeName) => instrumentNode(name, nodes[name], RECOVER[name]);
  return new StateGraph(RunState)
    .addNode("planner", wrap("planner"))
    .addNode("event", wrap("event"))
    .addNode("weather", wrap("weather"))
    .addNode("sentiment", wrap("sentiment"))
    .addNode("macro", wrap("macro"))
    .addNode("analogs", wrap("analogs"))
    .addNode("risk", wrap("risk"))
    .addNode("hedging", wrap("hedging"))
    .addNode("synthesizer", wrap("synthesizer"))
    .addNode("verifier", wrap("verifier"))
    .addEdge(START, "planner")
    .addEdge("planner", "event")
    .addEdge("event", "weather")
    .addEdge("event", "sentiment")
    .addEdge("event", "macro")
    .addEdge(["weather", "sentiment", "macro"], "analogs")
    .addEdge("analogs", "risk")
    .addEdge("risk", "hedging")
    .addEdge("hedging", "synthesizer")
    .addEdge("synthesizer", "verifier")
    .addConditionalEdges("verifier", afterVerifier, ["synthesizer", END])
    .compile({ checkpointer });
}

export { DATA_NODES };
