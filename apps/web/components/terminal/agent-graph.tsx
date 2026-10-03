"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTheme } from "next-themes";
import {
  BadgeCheck,
  Brain,
  Check,
  Circle,
  CircleX,
  CloudLightning,
  History,
  Landmark,
  LoaderCircle,
  Minus,
  Newspaper,
  PenLine,
  Radar,
  Scale,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { GRAPH_EDGES, NODE_ORDER, type NodeName } from "@repo/contracts";
import { Card } from "~/components/ui/card";
import { cn } from "~/lib/utils";
import { formatDuration } from "~/lib/display";
import { NODE_TONE } from "~/lib/tone";
import type { NodeView, NodeVisualStatus } from "~/lib/run-state";
import { SectionLabel } from "./bits";
import { useRun } from "./run-context";

// Fixed layout: the graph has the same shape on every run (SPEC 5.5), so each node has a fixed cell.
// Columns run left to right; the three specialists that run in parallel share column 2.
const NODE_W = 100;
const NODE_H = 50;
const COL = 107;
const ROW = 62;
const CELL: Record<NodeName, readonly [col: number, row: number]> = {
  planner: [0, 1],
  event: [1, 1],
  weather: [2, 0],
  sentiment: [2, 1],
  macro: [2, 2],
  analogs: [3, 1],
  risk: [4, 1],
  hedging: [5, 1],
  synthesizer: [6, 1],
  verifier: [7, 1],
};

const NODE_ICON: Record<NodeName, typeof Check> = {
  planner: Brain,
  event: Radar,
  weather: CloudLightning,
  sentiment: Newspaper,
  macro: Landmark,
  analogs: History,
  risk: ShieldAlert,
  hedging: Scale,
  synthesizer: PenLine,
  verifier: BadgeCheck,
};

type AgentNodeData = { view: NodeView };
type AgentFlowNode = Node<AgentNodeData, "agent">;

const STATUS_ICON: Record<NodeVisualStatus, typeof Check> = {
  pending: Circle,
  running: LoaderCircle,
  done: Check,
  skipped: Minus,
  degraded: TriangleAlert,
  failed: CircleX,
};

function statusText(view: NodeView): string {
  switch (view.status) {
    case "pending":
      return "pending";
    case "running":
      return "running";
    case "skipped":
      return "skipped";
    case "failed":
      return "failed";
    case "degraded":
      return "degraded";
    case "done":
      return view.durationMs === null ? "done" : formatDuration(view.durationMs);
  }
}

function AgentNode({ data }: NodeProps<AgentFlowNode>) {
  const { view } = data;
  const tone = NODE_TONE[view.status];
  const Icon = STATUS_ICON[view.status];
  const AgentIcon = NODE_ICON[view.node];
  return (
    <>
      <Handle type="target" position={Position.Left} isConnectable={false} className="size-px! min-h-0! min-w-0! border-0! bg-transparent!" />
      <button
        type="button"
        aria-label={`${view.node}: ${statusText(view)}. Open step details`}
        title={view.durationMs === null ? undefined : `${view.node}: ${statusText(view)}, ${formatDuration(view.durationMs)}`}
        data-status={view.status}
        className={cn(
          "relative flex w-full cursor-pointer flex-col justify-center gap-1.5 rounded-lg border bg-card px-2.5 text-left transition-colors duration-300 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          tone.border,
          view.status === "running" && "animate-node-pulse bg-info/10",
          view.status === "done" && "bg-positive/[0.06]",
          view.status === "degraded" && "bg-warning/[0.06]",
          view.status === "failed" && "bg-negative/[0.08]",
        )}
        style={{ height: NODE_H }}
      >
        <span className="flex items-center gap-1.5 truncate text-[11px] leading-none font-medium text-foreground">
          <AgentIcon className={cn("size-3.5 shrink-0", view.status === "pending" ? "text-muted-foreground" : tone.text)} aria-hidden />
          {view.node}
        </span>
        <span className={cn("flex items-center gap-1 font-mono text-[10px] leading-none", tone.text)}>
          <Icon className={cn("size-2.5 shrink-0", view.status === "running" && "animate-spin")} aria-hidden />
          <span className="truncate">{statusText(view)}</span>
        </span>
        {view.starts > 1 && (
          <span className="absolute top-1 right-1.5 font-mono text-[9px] leading-none text-warning" title={`Ran ${view.starts} times`}>
            ×{view.starts}
          </span>
        )}
      </button>
      <Handle type="source" position={Position.Right} isConnectable={false} className="size-px! min-h-0! min-w-0! border-0! bg-transparent!" />
    </>
  );
}

const nodeTypes = { agent: AgentNode };

const MUTED = "color-mix(in oklch, var(--foreground) 22%, transparent)";

function isFinished(s: NodeVisualStatus) {
  return s === "done" || s === "degraded";
}

/** Edge colour follows the run: animated into a running node, green once both ends finished, dashed around a skip. */
function edgeLook(source: NodeVisualStatus, target: NodeVisualStatus): { animated: boolean; color: string; style: CSSProperties } {
  if (target === "running") return { animated: true, color: "var(--info)", style: { stroke: "var(--info)", strokeWidth: 1.75 } };
  if (source === "skipped" || target === "skipped") {
    return { animated: false, color: MUTED, style: { stroke: MUTED, strokeWidth: 1.25, strokeDasharray: "4 3" } };
  }
  if (isFinished(source) && target !== "pending") {
    return { animated: false, color: "var(--positive)", style: { stroke: "var(--positive)", strokeWidth: 1.5 } };
  }
  return { animated: false, color: MUTED, style: { stroke: MUTED, strokeWidth: 1.25 } };
}

/** React Flow fits the view once; refit whenever the panel is resized. */
function RefitOnResize() {
  const { fitView } = useReactFlow();
  const width = useStore((s) => s.width);
  useEffect(() => {
    void fitView({ padding: 0.05, maxZoom: 1.3 });
  }, [width, fitView]);
  return null;
}

const LEGEND: readonly NodeVisualStatus[] = ["pending", "running", "done", "skipped", "degraded", "failed"];

export function AgentGraph() {
  const { view, openDrilldown } = useRun();
  const { resolvedTheme } = useTheme();
  // React Flow puts the mode on its wrapper as a class; the server cannot know the theme, so the first render
  // matches it ("dark") and the real mode follows after mount instead of failing hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const nodes = useMemo<AgentFlowNode[]>(
    () =>
      NODE_ORDER.map((name) => ({
        id: name,
        type: "agent",
        position: { x: CELL[name][0] * COL, y: CELL[name][1] * ROW },
        width: NODE_W,
        height: NODE_H,
        draggable: false,
        selectable: false,
        data: { view: view.nodes[name] },
      })),
    [view.nodes],
  );

  const edges = useMemo<Edge[]>(
    () =>
      GRAPH_EDGES.map(([source, target]) => {
        const look = edgeLook(view.nodes[source].status, view.nodes[target].status);
        return {
          id: `${source}-${target}`,
          source,
          target,
          animated: look.animated,
          style: look.style,
          markerEnd: { type: MarkerType.ArrowClosed, color: look.color, width: 14, height: 14 },
        };
      }),
    [view.nodes],
  );

  const finished = NODE_ORDER.filter((n) => view.nodes[n].status !== "pending" && view.nodes[n].status !== "running").length;
  const running = view.phase === "running";

  return (
    <Card className="relative gap-0 overflow-hidden py-0">
      {view.phase !== "idle" && (
        <div className="absolute inset-x-0 top-0 h-0.5 bg-muted" aria-hidden>
          <div
            className={cn("h-full transition-[width] duration-500", running ? "bg-info" : "bg-positive")}
            style={{ width: `${(100 * finished) / NODE_ORDER.length}%` }}
          />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b px-3 py-2">
        <span className="flex items-center gap-2">
          <SectionLabel>Agent graph</SectionLabel>
          {view.phase !== "idle" && (
            <span className="font-mono text-[10px] text-muted-foreground">
              {finished}/{NODE_ORDER.length} steps
            </span>
          )}
        </span>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground" aria-label="Legend">
          {LEGEND.map((s) => (
            <li key={s} className="flex items-center gap-1">
              <span className={cn("size-1.5 rounded-full", NODE_TONE[s].dot)} aria-hidden />
              {s}
            </li>
          ))}
        </ul>
      </div>
      <div className="h-52 w-full" role="group" aria-label="Agent graph">
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            // Opening the drilldown is the node's only interaction. Registering a click handler on the flow is
            // also what gives the nodes pointer events: React Flow disables them on nodes that cannot be
            // selected or dragged and have no handler, so a click would land on the pane instead.
            onNodeClick={(_, node) => openDrilldown({ kind: "node", node: node.data.view.node })}
            colorMode={mounted && resolvedTheme === "light" ? "light" : "dark"}
            fitView
            fitViewOptions={{ padding: 0.05, maxZoom: 1.3 }}
            minZoom={0.3}
            maxZoom={1.5}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            preventScrolling={false}
          >
            <Background variant={BackgroundVariant.Dots} gap={14} size={1} color="color-mix(in oklch, var(--foreground) 10%, transparent)" />
            <RefitOnResize />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </Card>
  );
}
