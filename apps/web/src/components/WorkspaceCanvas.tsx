import type { CanvasGraph, GraphBoundary, GraphNode, WorkspaceSettings } from "@graphcode/graph-model";
import {
  applyNodeChanges,
  Background,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { agentStatusLabel, gitChangeLabel, gitWorktreeLabel } from "../displayLabels";
import { nodePalette } from "../graphStyles";
import { BoundaryNodeCard } from "./BoundaryNodeCard";
import { GraphNodeCard } from "./GraphNodeCard";

type WorkspaceCanvasProps = {
  canvas: CanvasGraph | null;
  theme: WorkspaceSettings["general"]["theme"];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  selectedBoundaryId: string | null;
  drawBoundaryMode: boolean;
  drawEdgeMode: boolean;
  onSelectNode: (nodeId: string) => void;
  onSelectEdge: (edgeId: string) => void;
  onSelectBoundary: (boundaryId: string) => void;
  onOpenNode: (nodeId: string) => void;
  onPersistLayout: (nodeId: string, position: { x: number; y: number }, size: { width: number; height: number }) => void;
  onPersistBoundaryLayout: (
    boundaryId: string,
    position: { x: number; y: number },
    size: { width: number; height: number },
    memberLayouts?: MemberLayout[]
  ) => void;
  onBoundaryDraft: (draft: { position: { x: number; y: number }; size: { width: number; height: number } }) => void;
  onEdgeDraft: (draft: { sourceNodeId: string; targetNodeId: string }) => void;
};

const nodeTypes = {
  graphNode: GraphNodeCard,
  boundaryNode: BoundaryNodeCard
};

export function WorkspaceCanvas(props: WorkspaceCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkspaceCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function WorkspaceCanvasInner({
  canvas,
  theme,
  selectedNodeId,
  selectedEdgeId,
  selectedBoundaryId,
  drawBoundaryMode,
  drawEdgeMode,
  onSelectNode,
  onSelectEdge,
  onSelectBoundary,
  onOpenNode,
  onPersistLayout,
  onPersistBoundaryLayout,
  onBoundaryDraft,
  onEdgeDraft
}: WorkspaceCanvasProps) {
  const { fitView, screenToFlowPosition, setCenter } = useReactFlow();
  const resolvedTheme = useResolvedCanvasTheme(theme);
  const canvasColors = canvasThemeColors(resolvedTheme);
  const nodesRef = useRef<Node[]>([]);
  const draftRectRef = useRef<BoundaryDraftRect | null>(null);
  const boundaryDragRef = useRef<BoundaryDragState | null>(null);
  const handleResizeEndRef = useRef((_: string, __: { width: number; height: number }) => {});
  const handleBoundaryResizeEndRef = useRef((_: string, __: { width: number; height: number }) => {});
  const initialNodes = useMemo(
    () =>
      toFlowNodes(
        canvas,
        selectedNodeId,
        selectedBoundaryId,
        (nodeId, size) => handleResizeEndRef.current(nodeId, size),
        (boundaryId, size) => handleBoundaryResizeEndRef.current(boundaryId, size)
      ),
    [canvas, selectedBoundaryId, selectedNodeId]
  );
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [draftRect, setDraftRect] = useState<BoundaryDraftRect | null>(null);
  const edges = useMemo(() => toFlowEdges(canvas, selectedEdgeId, resolvedTheme), [canvas, resolvedTheme, selectedEdgeId]);
  const flowNodes = useMemo(() => (draftRect ? [...nodes, toDraftBoundaryNode(draftRect)] : nodes), [draftRect, nodes]);

  const persistLayout = useCallback(
    (nodeId: string, position: { x: number; y: number }, size: { width: number; height: number }) => {
      setNodes((currentNodes) => {
        const nextNodes = currentNodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                position,
                style: { ...node.style, width: size.width, height: size.height },
                data: {
                  ...node.data,
                  node: {
                    ...(node.data as { node: GraphNode }).node,
                    position,
                    size
                  }
                }
              }
            : node
        );
        nodesRef.current = nextNodes;
        return nextNodes;
      });
      onPersistLayout(nodeId, position, size);
    },
    [onPersistLayout]
  );

  const persistBoundaryLayout = useCallback(
    (boundaryId: string, position: { x: number; y: number }, size: { width: number; height: number }, memberLayouts?: MemberLayout[]) => {
      setNodes((currentNodes) => {
        const nextNodes = currentNodes.map((node) =>
          node.id === boundaryId
            ? {
                ...node,
                position,
                style: { ...node.style, width: size.width, height: size.height },
                data: {
                  ...node.data,
                  boundary: {
                    ...(node.data as { boundary: GraphBoundary }).boundary,
                    position,
                    size
                  }
                }
              }
            : memberLayouts?.some((layout) => layout.nodeId === node.id)
              ? updateGraphNodeLayout(node, memberLayouts.find((layout) => layout.nodeId === node.id)!)
              : node
        );
        nodesRef.current = nextNodes;
        return nextNodes;
      });
      onPersistBoundaryLayout(boundaryId, position, size, memberLayouts);
    },
    [onPersistBoundaryLayout]
  );

  handleResizeEndRef.current = (nodeId, size) => {
    const currentNode = nodesRef.current.find((node) => node.id === nodeId);
    const position = currentNode?.position ?? { x: 0, y: 0 };
    persistLayout(nodeId, position, size);
  };

  handleBoundaryResizeEndRef.current = (boundaryId, size) => {
    const currentNode = nodesRef.current.find((node) => node.id === boundaryId);
    const position = currentNode?.position ?? { x: 0, y: 0 };
    persistBoundaryLayout(boundaryId, position, size);
  };

  useEffect(() => {
    setNodes(initialNodes);
    nodesRef.current = initialNodes;
  }, [initialNodes]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((currentNodes) => {
      const nextNodes = applyNodeChanges(changes, currentNodes);
      nodesRef.current = nextNodes;
      return nextNodes;
    });
  }, []);

  const handleNodeDragStart = useCallback((_: MouseEvent | TouchEvent, node: Node) => {
    const boundary = (node.data as { boundary?: GraphBoundary }).boundary;
    if (!boundary) {
      boundaryDragRef.current = null;
      return;
    }
    const memberIds = new Set(boundary.memberNodeIds);
    boundaryDragRef.current = {
      boundaryId: boundary.id,
      startPosition: { ...boundary.position },
      memberLayouts: nodesRef.current
        .filter((currentNode) => memberIds.has(currentNode.id))
        .map((currentNode) => {
          const graphNode = (currentNode.data as { node?: GraphNode }).node;
          return {
            nodeId: currentNode.id,
            position: { ...currentNode.position },
            size: {
              width: measuredWidth(currentNode, graphNode?.size.width ?? 224),
              height: measuredHeight(currentNode, graphNode?.size.height ?? 120)
            }
          };
        })
    };
  }, []);

  const handleNodeDrag = useCallback((_: MouseEvent | TouchEvent, node: Node) => {
    const drag = boundaryDragRef.current;
    if (!drag || drag.boundaryId !== node.id) {
      return;
    }
    const delta = {
      x: node.position.x - drag.startPosition.x,
      y: node.position.y - drag.startPosition.y
    };
    const memberLayouts = drag.memberLayouts.map((layout) => ({
      ...layout,
      position: {
        x: layout.position.x + delta.x,
        y: layout.position.y + delta.y
      }
    }));
    setNodes((currentNodes) => {
      const nextNodes = currentNodes.map((currentNode) => {
        const memberLayout = memberLayouts.find((layout) => layout.nodeId === currentNode.id);
        return memberLayout ? updateGraphNodeLayout(currentNode, memberLayout) : currentNode;
      });
      nodesRef.current = nextNodes;
      return nextNodes;
    });
  }, []);

  const handleNodeDragStop = useCallback(
    (_: MouseEvent | TouchEvent, node: Node) => {
      const boundary = (node.data as { boundary?: GraphBoundary }).boundary;
      if (boundary) {
        const width = measuredWidth(node, boundary.size.width);
        const height = measuredHeight(node, boundary.size.height);
        const drag = boundaryDragRef.current;
        const memberLayouts =
          drag && drag.boundaryId === node.id
            ? drag.memberLayouts.map((layout) => ({
                ...layout,
                position: {
                  x: layout.position.x + node.position.x - drag.startPosition.x,
                  y: layout.position.y + node.position.y - drag.startPosition.y
                }
              }))
            : [];
        boundaryDragRef.current = null;
        persistBoundaryLayout(node.id, node.position, { width, height }, memberLayouts);
        return;
      }

      const graphNode = (node.data as { node?: GraphNode }).node;
      if (!graphNode) {
        return;
      }
      const width = measuredWidth(node, graphNode.size.width);
      const height = measuredHeight(node, graphNode.size.height);
      persistLayout(node.id, node.position, { width, height });
    },
    [persistBoundaryLayout, persistLayout]
  );

  const handleNodeDoubleClick = useCallback(
    (_: ReactMouseEvent, node: Node) => {
      const graphNode = (node.data as { node?: GraphNode }).node;
      if (graphNode?.hasChildren) {
        onOpenNode(node.id);
      }
    },
    [onOpenNode]
  );

  const handleNodeClick = useCallback(
    (_: ReactMouseEvent, node: Node) => {
      if ((node.data as { boundary?: GraphBoundary }).boundary) {
        onSelectBoundary(node.id);
        return;
      }
      onSelectNode(node.id);
    },
    [onSelectBoundary, onSelectNode]
  );

  const handleEdgeClick = useCallback(
    (_: ReactMouseEvent, edge: Edge) => {
      if (canvas?.edges.some((item) => item.id === edge.id)) {
        onSelectEdge(edge.id);
      }
    },
    [canvas?.edges, onSelectEdge]
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!drawEdgeMode || !connection.source || !connection.target || connection.source === connection.target) {
        return;
      }
      onEdgeDraft({
        sourceNodeId: connection.source,
        targetNodeId: connection.target
      });
    },
    [drawEdgeMode, onEdgeDraft]
  );

  const startBoundaryDraft = useCallback(
    (event: ReactMouseEvent) => {
      if (!drawBoundaryMode || !canvas?.scopeNodeId) {
        return;
      }
      event.preventDefault();
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const nextDraft = { start: point, current: point };
      draftRectRef.current = nextDraft;
      setDraftRect(nextDraft);
    },
    [canvas?.scopeNodeId, drawBoundaryMode, screenToFlowPosition]
  );

  const updateBoundaryDraft = useCallback(
    (event: ReactMouseEvent) => {
      if (!drawBoundaryMode || !draftRectRef.current) {
        return;
      }
      event.preventDefault();
      const nextDraft = { ...draftRectRef.current, current: screenToFlowPosition({ x: event.clientX, y: event.clientY }) };
      draftRectRef.current = nextDraft;
      setDraftRect(nextDraft);
    },
    [drawBoundaryMode, screenToFlowPosition]
  );

  const finishBoundaryDraft = useCallback(
    (event: ReactMouseEvent) => {
      if (!drawBoundaryMode || !draftRectRef.current) {
        return;
      }
      event.preventDefault();
      const rectangle = normalizeDraftRect({
        ...draftRectRef.current,
        current: screenToFlowPosition({ x: event.clientX, y: event.clientY })
      });
      draftRectRef.current = null;
      setDraftRect(null);
      if (rectangle.size.width >= 24 && rectangle.size.height >= 24) {
        onBoundaryDraft(rectangle);
      }
    },
    [drawBoundaryMode, onBoundaryDraft, screenToFlowPosition]
  );

  useEffect(() => {
    if (nodes.length > 0) {
      window.requestAnimationFrame(() => fitView({ padding: 0.2, duration: 320 }));
    }
  }, [fitView, nodes.length, canvas?.rootNodeId]);

  useEffect(() => {
    if (!selectedNodeId || !canvas) {
      return;
    }
    const node = canvas.nodes.find((item) => item.id === selectedNodeId);
    if (node) {
      setCenter(node.position.x + 120, node.position.y + 70, { zoom: 1.08, duration: 280 });
    }
  }, [canvas, selectedNodeId, setCenter]);

  if (!canvas) {
    return <div className="canvas-empty">Loading workspace...</div>;
  }

  return (
    <ReactFlow
      className={`workspace-flow workspace-flow-${resolvedTheme}`}
      colorMode={resolvedTheme}
      nodes={flowNodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      nodesDraggable
      nodesConnectable={drawEdgeMode}
      minZoom={0.25}
      maxZoom={1.8}
      onNodesChange={handleNodesChange}
      onNodeClick={handleNodeClick}
      onNodeDoubleClick={handleNodeDoubleClick}
      onNodeDragStart={handleNodeDragStart}
      onNodeDrag={handleNodeDrag}
      onNodeDragStop={handleNodeDragStop}
      onEdgeClick={handleEdgeClick}
      onConnect={handleConnect}
      onMouseDown={startBoundaryDraft}
      onMouseMove={updateBoundaryDraft}
      onMouseUp={finishBoundaryDraft}
      proOptions={{ hideAttribution: false }}
    >
      <Background color={canvasColors.backgroundDots} gap={28} size={1} />
      <Controls position="bottom-left" />
      <MiniMap
        position="bottom-right"
        pannable
        zoomable
        bgColor={canvasColors.minimapBg}
        maskColor={canvasColors.minimapMask}
        maskStrokeColor={canvasColors.minimapStroke}
        nodeColor={(node) => {
          return (node.data as { accentColor?: string; boundary?: GraphBoundary }).accentColor ?? (node.data as { boundary?: GraphBoundary }).boundary?.color ?? nodePalette.module.accent;
        }}
      />
      <Panel position="top-left">
        <div className="canvas-status">
          <strong>{canvas.nodes.length}</strong>
          <span>blocks</span>
          <strong>{canvas.edges.length}</strong>
          <span>links</span>
          <strong>{canvas.boundaries.length}</strong>
          <span>boundaries</span>
        </div>
      </Panel>
      {drawBoundaryMode ? (
        <Panel position="top-center">
          <div className="canvas-draw-status">Draw boundary</div>
        </Panel>
      ) : null}
      {drawEdgeMode ? (
        <Panel position="top-center">
          <div className="canvas-draw-status">Draw edge</div>
        </Panel>
      ) : null}
    </ReactFlow>
  );
}

export type MemberLayout = {
  nodeId: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
};

type BoundaryDraftRect = {
  start: { x: number; y: number };
  current: { x: number; y: number };
};

type BoundaryDragState = {
  boundaryId: string;
  startPosition: { x: number; y: number };
  memberLayouts: MemberLayout[];
};

function toFlowNodes(
  canvas: CanvasGraph | null,
  selectedNodeId: string | null,
  selectedBoundaryId: string | null,
  onResizeEnd: (nodeId: string, size: { width: number; height: number }) => void,
  onBoundaryResizeEnd: (boundaryId: string, size: { width: number; height: number }) => void
): Node[] {
  if (!canvas) {
    return [];
  }

  const measuredNodeById = new Map(canvas.nodes.map((node) => [node.id, { ...node, size: measureNodeCardSize(node) }]));
  const boundaryNodes: Node[] = canvas.boundaries.map((boundary) => {
    const displaySize = measureBoundaryBoxSize(boundary, measuredNodeById);
    return {
      id: boundary.id,
      type: "boundaryNode",
      position: boundary.position,
      selected: boundary.id === selectedBoundaryId,
      draggable: true,
      zIndex: boundary.id === selectedBoundaryId ? 4 : 1,
      style: {
        width: displaySize.width,
        height: displaySize.height
      },
      data: {
        boundary: {
          ...boundary,
          size: displaySize
        },
        selected: boundary.id === selectedBoundaryId,
        onResizeEnd: onBoundaryResizeEnd
      }
    };
  });

  const reuseByNodeId = new Map((canvas.reuses ?? []).map((reuse) => [reuse.nodeId, reuse]));
  const graphNodes: Node[] = canvas.nodes.map((node) => ({
    ...toFlowGraphNode(node, canvas, selectedNodeId, reuseByNodeId, onResizeEnd)
  }));

  return [...boundaryNodes, ...graphNodes];
}

function toFlowGraphNode(
  node: GraphNode,
  canvas: CanvasGraph,
  selectedNodeId: string | null,
  reuseByNodeId: Map<string, CanvasGraph["reuses"][number]>,
  onResizeEnd: (nodeId: string, size: { width: number; height: number }) => void
): Node {
  const displaySize = measureNodeCardSize(node);
  return {
    id: node.id,
    type: "graphNode",
    position: node.position,
    selected: node.id === selectedNodeId,
    zIndex: node.id === selectedNodeId ? 20 : 10,
    style: {
      width: displaySize.width,
      height: displaySize.height
    },
    data: {
      node: {
        ...node,
        size: displaySize
      },
      accentColor: colorForNode(node, canvas),
      reuse: reuseByNodeId.get(node.id),
      selected: node.id === selectedNodeId,
      onResizeEnd
    }
  };
}

function toFlowEdges(canvas: CanvasGraph | null, selectedEdgeId: string | null, theme: "light" | "dark"): Edge[] {
  if (!canvas) {
    return [];
  }
  const labelColor = theme === "dark" ? "#cbd5e1" : "#4b5563";

  const semanticEdges: Edge[] = canvas.edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    label: formatEdgeLabel(edge),
    type: "smoothstep",
    selected: edge.id === selectedEdgeId,
    animated: edge.animated,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: edge.id === selectedEdgeId ? "#2563eb" : edge.color
    },
    style: {
      stroke: edge.id === selectedEdgeId ? "#2563eb" : edge.color,
      strokeWidth: edge.id === selectedEdgeId ? 2.4 : 1.7
    },
    labelStyle: {
      fill: labelColor,
      fontSize: 11,
      fontWeight: 600
    }
  }));

  const attachmentEdges: Edge[] = canvas.nodes
    .filter((node) => node.attachedToId)
    .map((node) => {
      const color = colorForNode(node, canvas);
      return {
        id: `attachment-${node.attachedToId}-${node.id}`,
        source: node.attachedToId!,
        target: node.id,
        label: node.kind,
        type: "smoothstep",
        animated: node.kind === "input" || node.kind === "output",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color
        },
        style: {
          stroke: color,
          strokeWidth: 1.4,
          strokeDasharray: "5 5"
        },
        labelStyle: {
          fill: color,
          fontSize: 11,
          fontWeight: 700
        }
      };
    });

  return [...semanticEdges, ...attachmentEdges];
}

function measureNodeCardSize(node: GraphNode): { width: number; height: number } {
  const longestWord = Math.max(0, ...`${node.name} ${node.summary}`.split(/\s+/).map((part) => part.length));
  const summaryLength = node.summary.trim().length;
  const nameLength = node.name.trim().length;
  const baseWidth = node.size.width;
  const widthFromWord = Math.min(420, Math.max(baseWidth, 150 + longestWord * 7));
  const widthFromSummary = summaryLength > 58 ? Math.max(widthFromWord, 292) : widthFromWord;
  const maxMeasuredWidth = node.kind === "format" ? 280 : 420;
  const width = Math.max(baseWidth, Math.min(maxMeasuredWidth, widthFromSummary));
  const nameLines = Math.min(2, Math.max(1, Math.ceil(nameLength / Math.max(14, Math.floor((width - 48) / 8.5)))));
  const summaryLines = summaryLength === 0 ? 1 : Math.min(3, Math.ceil(summaryLength / Math.max(18, Math.floor((width - 34) / 6.8))));
  const statusRows = node.agentStatus !== "none" || node.gitStatus ? 1 : 0;
  const tagRows = node.tags.length > 0 ? 1 : 0;
  const contentHeight = 66 + nameLines * 19 + summaryLines * 18 + statusRows * 27 + tagRows * 24;
  const minHeight = node.kind === "format" ? 96 : node.kind === "ui_component" ? 136 : 128;
  const height = Math.max(node.size.height, Math.min(260, Math.max(minHeight, contentHeight)));
  return { width: Math.round(width), height: Math.round(height) };
}

function measureBoundaryBoxSize(boundary: GraphBoundary, nodeById: Map<string, GraphNode>): { width: number; height: number } {
  const memberNodes = boundary.memberNodeIds.map((nodeId) => nodeById.get(nodeId)).filter(Boolean) as GraphNode[];
  const headerWidth = measureBoundaryHeaderWidth(boundary);
  let width = Math.max(boundary.size.width, headerWidth);
  let memberMaxRight = 0;
  let memberMaxBottom = 0;

  for (const node of memberNodes) {
    memberMaxRight = Math.max(memberMaxRight, node.position.x + node.size.width - boundary.position.x);
    memberMaxBottom = Math.max(memberMaxBottom, node.position.y + node.size.height - boundary.position.y);
  }

  if (memberNodes.length > 0) {
    width = Math.max(width, memberMaxRight + BOUNDARY_SIDE_PADDING);
  }
  const topPadding = boundaryTopPadding(boundary, width);
  const height = Math.max(boundary.size.height, memberMaxBottom + BOUNDARY_BOTTOM_PADDING, topPadding + BOUNDARY_BOTTOM_PADDING);
  return { width: Math.round(width), height: Math.round(height) };
}

function measureBoundaryHeaderWidth(boundary: GraphBoundary): number {
  const longestWord = Math.max(0, ...`${boundary.name} ${boundary.summary}`.split(/\s+/).map((part) => part.length));
  const summaryLength = boundary.summary.trim().length;
  return Math.min(640, Math.max(180, 28 + longestWord * 7.5, summaryLength > 72 ? 360 : 0));
}

function boundaryTopPadding(boundary: GraphBoundary, width: number): number {
  const contentWidth = Math.max(120, width - 24);
  const summaryLength = boundary.summary.trim().length;
  const summaryLines = summaryLength === 0 ? 0 : Math.min(2, Math.ceil(summaryLength / Math.max(18, Math.floor(contentWidth / 6.8))));
  const headerHeight = 18 + (summaryLines > 0 ? 5 + summaryLines * 17 : 0);
  return Math.max(88, headerHeight + 28);
}

function useResolvedCanvasTheme(theme: WorkspaceSettings["general"]["theme"]): "light" | "dark" {
  const [prefersDark, setPrefersDark] = useState(() =>
    typeof window === "undefined" || typeof window.matchMedia !== "function" ? false : window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setPrefersDark(media.matches);
    onChange();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    }
    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, []);

  return theme === "system" ? (prefersDark ? "dark" : "light") : theme;
}

const BOUNDARY_SIDE_PADDING = 48;
const BOUNDARY_BOTTOM_PADDING = 44;

function canvasThemeColors(theme: "light" | "dark") {
  if (theme === "dark") {
    return {
      backgroundDots: "#334155",
      minimapBg: "#1d212b",
      minimapMask: "rgba(15, 23, 42, 0.44)",
      minimapStroke: "#475569"
    };
  }
  return {
    backgroundDots: "#d4d7dd",
    minimapBg: "#ffffff",
    minimapMask: "rgba(240, 244, 248, 0.7)",
    minimapStroke: "#cbd5e1"
  };
}

function formatEdgeLabel(edge: CanvasGraph["edges"][number]): string {
  const pieces = [edge.label ?? edge.kind];
  if (edge.agentStatus !== "none") {
    pieces.push(agentStatusLabel(edge.agentStatus));
  }
  if (edge.gitStatus) {
    pieces.push(gitWorktreeLabel(edge.gitStatus.worktree));
    if (edge.gitStatus.change) {
      pieces.push(gitChangeLabel(edge.gitStatus.change));
    }
  }
  return pieces.join(" · ");
}

function normalizeDraftRect(rect: BoundaryDraftRect): { position: { x: number; y: number }; size: { width: number; height: number } } {
  const minX = Math.min(rect.start.x, rect.current.x);
  const minY = Math.min(rect.start.y, rect.current.y);
  const maxX = Math.max(rect.start.x, rect.current.x);
  const maxY = Math.max(rect.start.y, rect.current.y);
  return {
    position: { x: minX, y: minY },
    size: { width: maxX - minX, height: maxY - minY }
  };
}

function toDraftBoundaryNode(rect: BoundaryDraftRect): Node {
  const normalized = normalizeDraftRect(rect);
  const boundary: GraphBoundary = {
    id: "boundary-draft",
    projectId: "draft",
    scopeNodeId: "draft",
    name: "New Boundary",
    summary: "Drawing boundary",
    codeContext: "",
    color: "#2563eb",
    position: normalized.position,
    size: normalized.size,
    memberNodeIds: [],
    memberCount: 0,
    tags: [],
    createdAt: "",
    updatedAt: ""
  };
  return {
    id: boundary.id,
    type: "boundaryNode",
    position: boundary.position,
    selectable: false,
    draggable: false,
    zIndex: 2,
    style: {
      width: boundary.size.width,
      height: boundary.size.height
    },
    data: {
      boundary,
      selected: true
    }
  };
}

function colorForNode(node: GraphNode, canvas: CanvasGraph): string {
  if (node.kind === "custom" && node.customTypeId) {
    const customType = canvas.customTypes.find((item) => item.id === node.customTypeId);
    if (customType?.color) {
      return customType.color;
    }
  }
  return canvas.nodeTypeStyles.find((style) => style.nodeKind === node.kind)?.color ?? nodePalette[node.kind].accent;
}

function updateGraphNodeLayout(node: Node, layout: MemberLayout): Node {
  const graphNode = (node.data as { node?: GraphNode }).node;
  return {
    ...node,
    position: layout.position,
    style: {
      ...node.style,
      width: layout.size.width,
      height: layout.size.height
    },
    data: {
      ...node.data,
      node: graphNode
        ? {
            ...graphNode,
            position: layout.position,
            size: layout.size
          }
        : graphNode
    }
  };
}

function measuredWidth(node: Node, fallback: number): number {
  if (typeof node.width === "number" && Number.isFinite(node.width)) {
    return node.width;
  }
  const styleWidth = typeof node.style?.width === "number" ? node.style.width : undefined;
  return styleWidth ?? fallback;
}

function measuredHeight(node: Node, fallback: number): number {
  if (typeof node.height === "number" && Number.isFinite(node.height)) {
    return node.height;
  }
  const styleHeight = typeof node.style?.height === "number" ? node.style.height : undefined;
  return styleHeight ?? fallback;
}
