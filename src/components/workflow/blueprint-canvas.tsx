"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef } from "react";
import {
  Background,
  ConnectionMode,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type HandleType,
  type Node,
  type NodeChange,
  type NodeProps,
  type OnConnect,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { boardColor } from "@/lib/board-palette";
import { cn } from "@/lib/utils";
import type {
  WorkflowStatusDTO,
  WorkflowTransitionDTO,
} from "@/actions/workflow";

type StatusNodeData = { status: WorkflowStatusDTO; selected: boolean };

const SIDES = [
  { id: "top", position: Position.Top },
  { id: "right", position: Position.Right },
  { id: "bottom", position: Position.Bottom },
  { id: "left", position: Position.Left },
] as const;

const HANDLE_CLASS =
  "!h-3 !w-3 !border-2 !bg-background !border-muted-foreground/80";

function StatusNode({ data }: NodeProps<Node<StatusNodeData>>) {
  const palette = boardColor(data.status.color);
  return (
    <div
      className={cn(
        "min-w-[9rem] rounded-lg border px-3 py-2.5 shadow-sm",
        palette.soft,
        palette.border,
        data.selected && "ring-2 ring-primary",
      )}
    >
      {SIDES.map((side) => (
        <Fragment key={side.id}>
          <Handle
            type="source"
            id={`${side.id}-out`}
            position={side.position}
            className={HANDLE_CLASS}
          />
          <Handle
            type="target"
            id={`${side.id}-in`}
            position={side.position}
            className={cn(HANDLE_CLASS, "!opacity-0")}
            style={{ width: 18, height: 18 }}
          />
        </Fragment>
      ))}
      <p className={cn("text-s font-medium", palette.text)}>{data.status.name}</p>
    </div>
  );
}

const NODE_TYPES = { status: StatusNode };

export function BlueprintCanvas({
  statuses,
  transitions,
  selectedStatusId,
  onSelectStatus,
  onMoveStatus,
  onConnectStatuses,
  onReconnectTransition,
}: {
  statuses: WorkflowStatusDTO[];
  transitions: WorkflowTransitionDTO[];
  selectedStatusId: string | null;
  onSelectStatus: (id: string | null) => void;
  onMoveStatus: (id: string, x: number, y: number) => void;
  onConnectStatuses: (
    fromId: string,
    toId: string,
    sourceHandle: string | null,
    targetHandle: string | null,
  ) => void;
  onReconnectTransition: (
    transitionId: string,
    fromId: string,
    toId: string,
    sourceHandle: string | null,
    targetHandle: string | null,
  ) => void;
}) {
  const synced = useMemo(
    () => buildGraph(statuses, transitions, selectedStatusId),
    [statuses, transitions, selectedStatusId],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(synced.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(synced.edges);
  const dragFromId = useRef<string | null>(null);
  const dragFromHandle = useRef<string | null>(null);
  const reconnectEnd = useRef<HandleType | null>(null);

  useEffect(() => {
    setNodes(synced.nodes);
    setEdges(synced.edges);
  }, [setEdges, setNodes, synced]);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);
      for (const change of changes) {
        if (change.type !== "position" || !change.position || change.dragging) {
          continue;
        }
        if (change.id.startsWith("status:")) {
          onMoveStatus(change.id.slice("status:".length), change.position.x, change.position.y);
        }
      }
    },
    [onMoveStatus, onNodesChange],
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      const pair = directedPair(connection, dragFromId.current, dragFromHandle.current);
      if (pair) {
        onConnectStatuses(pair.from, pair.to, pair.sourceHandle, pair.targetHandle);
      }
    },
    [onConnectStatuses],
  );

  const onReconnect = useCallback(
    (oldEdge: Edge, connection: Connection) => {
      const transitionId =
        typeof oldEdge.data?.transitionId === "string"
          ? oldEdge.data.transitionId
          : null;
      if (!transitionId) return;

      const oldFrom = nodeStatusId(oldEdge.source);
      const oldTo = nodeStatusId(oldEdge.target);
      const a = nodeStatusId(connection.source);
      const b = nodeStatusId(connection.target);
      if (!oldFrom || !oldTo || !a || !b) return;

      const movingTarget = reconnectEnd.current === "target";
      const from = movingTarget ? oldFrom : a === oldTo ? b : a;
      const to = movingTarget ? (a === oldFrom ? b : a) : oldTo;
      if (!from || !to || from === to) return;

      const dropped = directedHandles(connection, from, a);
      const sourceHandle = movingTarget
        ? sideOf(oldEdge.sourceHandle)
        : dropped.sourceHandle;
      const targetHandle = movingTarget
        ? dropped.targetHandle
        : sideOf(oldEdge.targetHandle);

      onReconnectTransition(transitionId, from, to, sourceHandle, targetHandle);
    },
    [onReconnectTransition],
  );

  return (
    <div className="h-[min(36rem,70vh)] overflow-hidden rounded-xl border border-border bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onReconnect={onReconnect}
        onReconnectStart={(_e, _edge, handleType) => {
          reconnectEnd.current = handleType;
        }}
        onReconnectEnd={() => {
          reconnectEnd.current = null;
        }}
        onConnectStart={(_e, params) => {
          dragFromId.current = nodeStatusId(params.nodeId);
          dragFromHandle.current = sideOf(params.handleId);
        }}
        onConnectEnd={() => {
          dragFromId.current = null;
          dragFromHandle.current = null;
        }}
        edgesReconnectable
        reconnectRadius={16}
        connectionRadius={10}
        nodeTypes={NODE_TYPES}
        onNodeClick={(_e, node) => {
          onSelectStatus(nodeStatusId(node.id));
        }}
        onEdgeClick={(_e, edge) => {
          onSelectStatus(nodeStatusId(edge.source));
        }}
        onPaneClick={() => onSelectStatus(null)}
        nodesConnectable
        connectionMode={ConnectionMode.Loose}
        isValidConnection={(connection) => {
          const a = nodeStatusId(connection.source);
          const b = nodeStatusId(connection.target);
          return Boolean(a && b && a !== b);
        }}
        fitView
        colorMode="dark"
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}

function nodeStatusId(id: string | null | undefined): string | null {
  return id?.startsWith("status:") ? id.slice("status:".length) : null;
}

const HANDLE_IDS = ["top", "right", "bottom", "left"] as const;

function sideOf(id: string | null | undefined): string | null {
  if (!id) return null;
  const side = id.replace(/-in$|-out$/, "");
  return (HANDLE_IDS as readonly string[]).includes(side) ? side : null;
}

function directedHandles(
  connection: Connection,
  fromId: string,
  sourceNodeId: string | null,
): { sourceHandle: string | null; targetHandle: string | null } {
  const swapped = Boolean(sourceNodeId && fromId !== sourceNodeId);
  return {
    sourceHandle: sideOf(
      swapped ? connection.targetHandle : connection.sourceHandle,
    ),
    targetHandle: sideOf(
      swapped ? connection.sourceHandle : connection.targetHandle,
    ),
  };
}

function directedPair(
  connection: Connection,
  startId: string | null,
  startHandle: string | null,
): {
  from: string;
  to: string;
  sourceHandle: string | null;
  targetHandle: string | null;
} | null {
  const a = nodeStatusId(connection.source);
  const b = nodeStatusId(connection.target);
  const from = startId ?? a;
  const to = from === a ? b : a;
  if (!from || !to || from === to) return null;
  const handles = directedHandles(connection, from, a);
  return {
    from,
    to,
    sourceHandle: startHandle ?? handles.sourceHandle,
    targetHandle: handles.targetHandle,
  };
}

function buildGraph(
  statuses: WorkflowStatusDTO[],
  transitions: WorkflowTransitionDTO[],
  selectedStatusId: string | null,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = statuses.map((status, index) => ({
    id: `status:${status.id}`,
    type: "status",
    position: {
      x: status.canvasX ?? index * 280,
      y: status.canvasY ?? 80,
    },
    data: { status, selected: selectedStatusId === status.id },
  }));

  const edges: Edge[] = transitions.flatMap((transition) => {
    if (!transition.fromStatusId) {
      return statuses
        .filter((s) => s.id !== transition.toStatusId)
        .map((s) =>
          edgeFor(s.id, transition.toStatusId, transition, selectedStatusId, statuses),
        );
    }
    return [
      edgeFor(
        transition.fromStatusId,
        transition.toStatusId,
        transition,
        selectedStatusId,
        statuses,
      ),
    ];
  });

  return { nodes, edges };
}

function edgeFor(
  fromId: string,
  toId: string,
  transition: WorkflowTransitionDTO,
  selectedStatusId: string | null,
  statuses: WorkflowStatusDTO[],
): Edge {
  const selected = selectedStatusId === fromId;
  const from = statuses.find((s) => s.id === fromId);
  const to = statuses.find((s) => s.id === toId);
  const storedSource = decodeHandle(transition.canvasX);
  const storedTarget = decodeHandle(transition.canvasY);
  const picked = pickHandles(from, to);
  return {
    id: `e:${fromId}:${toId}:${transition.id}`,
    source: `status:${fromId}`,
    target: `status:${toId}`,
    sourceHandle: `${storedSource ?? picked.sourceHandle}-out`,
    targetHandle: `${storedTarget ?? picked.targetHandle}-in`,
    reconnectable: true,
    data: { transitionId: transition.id },
    markerEnd: { type: MarkerType.ArrowClosed },
    style: selected
      ? { stroke: "var(--primary)", strokeWidth: 2 }
      : undefined,
  };
}

/** canvasX/Y on a transition store the chosen connectors (1–4), not a point. */
const HANDLE_ORDER = ["top", "right", "bottom", "left"] as const;

export function encodeHandle(id: string | null | undefined): number | null {
  const side = sideOf(id);
  if (!side) return null;
  return HANDLE_ORDER.indexOf(side as (typeof HANDLE_ORDER)[number]) + 1;
}

function decodeHandle(value: number | null | undefined): string | null {
  if (value == null || Number.isNaN(Number(value))) return null;
  const n = Math.round(Number(value));
  if (n < 1 || n > 4) return null;
  return HANDLE_ORDER[n - 1];
}

function pickHandles(
  from: WorkflowStatusDTO | undefined,
  to: WorkflowStatusDTO | undefined,
): { sourceHandle: string; targetHandle: string } {
  const dx = (to?.canvasX ?? 0) - (from?.canvasX ?? 0);
  const dy = (to?.canvasY ?? 0) - (from?.canvasY ?? 0);
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0
      ? { sourceHandle: "right", targetHandle: "left" }
      : { sourceHandle: "left", targetHandle: "right" };
  }
  return dy >= 0
    ? { sourceHandle: "bottom", targetHandle: "top" }
    : { sourceHandle: "top", targetHandle: "bottom" };
}
