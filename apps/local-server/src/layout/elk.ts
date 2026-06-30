import type { GraphBoundary, GraphEdge, GraphNode } from "@graphcode/graph-model";
import ELK from "elkjs";
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api";

export type LayoutResult = Map<string, { position: { x: number; y: number }; size: { width: number; height: number } }>;
export type CanvasLayoutResult = {
  nodeLayouts: LayoutResult;
  boundaryLayouts: LayoutResult;
};

const elk = new ELK();

export async function layoutCanvasWithElk(nodes: GraphNode[], edges: GraphEdge[]): Promise<LayoutResult> {
  const includedIds = new Set(nodes.map((node) => node.id));
  const layoutSizes = new Map(nodes.map((node) => [node.id, measureNodeForLayout(node)]));
  const elkGraph: ElkNode = {
    id: "canvas",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "44",
      "elk.spacing.edgeEdge": "28",
      "elk.spacing.edgeNode": "36",
      "elk.layered.spacing.nodeNodeBetweenLayers": "92",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "30",
      "elk.layered.spacing.edgeNodeBetweenLayers": "44",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.edgeRouting": "ORTHOGONAL"
    },
    children: nodes.map((node) => {
      const size = layoutSizes.get(node.id) ?? node.size;
      return {
        id: node.id,
        width: size.width,
        height: size.height
      };
    }),
    edges: buildElkEdgesForLayout(nodes, edges, includedIds)
  };

  const laidOut = await elk.layout(elkGraph);
  const result: LayoutResult = new Map();

  for (const node of laidOut.children ?? []) {
    result.set(node.id, {
      position: {
        x: Math.round(node.x ?? 0),
        y: Math.round(node.y ?? 0)
      },
      size: {
        width: Math.round(node.width ?? layoutSizes.get(node.id)?.width ?? 224),
        height: Math.round(node.height ?? layoutSizes.get(node.id)?.height ?? 120)
      }
    });
  }

  return result;
}

export async function layoutCanvasWithBoundaryGroups(nodes: GraphNode[], edges: GraphEdge[], boundaries: GraphBoundary[]): Promise<CanvasLayoutResult> {
  const visibleIds = new Set(nodes.map((node) => node.id));
  const primaryBoundaryByNodeId = primaryBoundaryMembership(boundaries, visibleIds);
  const groupedBoundaryIds = new Set(primaryBoundaryByNodeId.values());

  if (groupedBoundaryIds.size === 0) {
    return {
      nodeLayouts: await layoutCanvasWithElk(nodes, edges),
      boundaryLayouts: new Map()
    };
  }

  const boundaryLayouts: LayoutResult = new Map();
  const groupedNodeLayouts = new Map<string, LayoutResult>();
  const groupedNodeByBoundaryId = new Map<string, GraphNode[]>();

  for (const boundaryId of groupedBoundaryIds) {
    const memberNodes = nodes.filter((node) => primaryBoundaryByNodeId.get(node.id) === boundaryId);
    groupedNodeByBoundaryId.set(boundaryId, memberNodes);
    groupedNodeLayouts.set(boundaryId, await layoutCanvasWithElk(memberNodes, edges.filter((edge) => memberNodes.some((node) => node.id === edge.sourceNodeId) && memberNodes.some((node) => node.id === edge.targetNodeId))));
  }

  const outerNodes = [
    ...nodes.filter((node) => !primaryBoundaryByNodeId.has(node.id)),
    ...boundaries.filter((boundary) => groupedBoundaryIds.has(boundary.id)).map((boundary) => boundaryAsLayoutNode(boundary, groupedNodeLayouts.get(boundary.id) ?? new Map()))
  ];
  const outerEdges = edges
    .map((edge) => ({
      ...edge,
      sourceNodeId: primaryBoundaryByNodeId.get(edge.sourceNodeId) ?? edge.sourceNodeId,
      targetNodeId: primaryBoundaryByNodeId.get(edge.targetNodeId) ?? edge.targetNodeId
    }))
    .filter((edge) => edge.sourceNodeId !== edge.targetNodeId);
  const outerLayout = await layoutCanvasWithElk(outerNodes, outerEdges);
  const nodeLayouts: LayoutResult = new Map();

  for (const node of nodes) {
    const boundaryId = primaryBoundaryByNodeId.get(node.id);
    if (!boundaryId) {
      const layout = outerLayout.get(node.id);
      if (layout) {
        nodeLayouts.set(node.id, layout);
      }
      continue;
    }

    const boundaryOuterLayout = outerLayout.get(boundaryId);
    const internalLayout = groupedNodeLayouts.get(boundaryId)?.get(node.id);
    const internalBounds = layoutBounds(groupedNodeLayouts.get(boundaryId) ?? new Map());
    if (boundaryOuterLayout && internalLayout) {
      const boundary = boundaries.find((item) => item.id === boundaryId);
      const topPadding = boundary ? boundaryTopPadding(boundary, boundaryOuterLayout.size.width) : BOUNDARY_MIN_TOP_PADDING;
      nodeLayouts.set(node.id, {
        position: {
          x: boundaryOuterLayout.position.x + BOUNDARY_PADDING_X + internalLayout.position.x - internalBounds.minX,
          y: boundaryOuterLayout.position.y + topPadding + internalLayout.position.y - internalBounds.minY
        },
        size: internalLayout.size
      });
    }
  }

  for (const boundary of boundaries) {
    if (!groupedBoundaryIds.has(boundary.id)) {
      continue;
    }
    const outer = outerLayout.get(boundary.id);
    if (outer) {
      boundaryLayouts.set(boundary.id, outer);
    }
  }

  return { nodeLayouts, boundaryLayouts };
}

export function buildElkEdgesForLayout(nodes: GraphNode[], edges: GraphEdge[], includedIds: Set<string>): ElkExtendedEdge[] {
  const semanticEdges = edges
    .filter((edge) => includedIds.has(edge.sourceNodeId) && includedIds.has(edge.targetNodeId))
    .map((edge) => {
      const label = edge.label?.trim() || edge.kind;
      return {
        id: edge.id,
        sources: [edge.sourceNodeId],
        targets: [edge.targetNodeId],
        labels: [{ text: label, ...measureEdgeLabelForLayout(label) }]
      };
    });

  const attachmentEdges = nodes
    .filter((node) => node.attachedToId && includedIds.has(node.attachedToId))
    .map((node) => {
      const label = node.kind;
      return {
        id: `layout-attachment-${node.attachedToId}-${node.id}`,
        sources: [node.attachedToId!],
        targets: [node.id],
        labels: [{ text: label, ...measureEdgeLabelForLayout(label) }]
      };
    });

  return [...semanticEdges, ...attachmentEdges];
}

export function measureEdgeLabelForLayout(label: string): { width: number; height: number } {
  const normalized = label.trim() || "edge";
  const longestWord = Math.max(0, ...normalized.split(/\s+/).map((part) => part.length));
  const width = Math.min(260, Math.max(58, 18 + Math.max(normalized.length * 6.4, longestWord * 7.2)));
  const lineCount = Math.max(1, Math.ceil(normalized.length / Math.max(12, Math.floor(width / 6.4))));
  return {
    width: Math.round(width),
    height: 10 + Math.min(3, lineCount) * 15
  };
}

function measureNodeForLayout(node: GraphNode): { width: number; height: number } {
  const baseWidth = node.size.width;
  const baseHeight = node.size.height;
  const longestWord = Math.max(0, ...`${node.name} ${node.summary}`.split(/\s+/).map((part) => part.length));
  const summaryLength = node.summary.trim().length;
  const nameLength = node.name.trim().length;
  const chipLabels = [
    node.agentStatus !== "none" ? node.agentStatus : null,
    node.gitStatus ? node.gitStatus.worktree : null,
    node.gitStatus?.change ? node.gitStatus.change : null,
    ...node.tags.slice(0, 2).map((tag) => tag.name)
  ].filter(Boolean) as string[];
  const longestChip = Math.max(0, ...chipLabels.map((label) => label.length));
  const widthFromWord = Math.min(440, Math.max(baseWidth, 154 + Math.max(longestWord * 7.4, longestChip * 6.4)));
  const widthFromSummary = summaryLength > 58 ? Math.max(widthFromWord, 292) : widthFromWord;
  const maxMeasuredWidth = node.kind === "format" ? 292 : 440;
  const width = Math.max(baseWidth, Math.min(maxMeasuredWidth, widthFromSummary));
  const contentWidth = Math.max(96, width - 26);
  const nameLines = Math.min(2, Math.max(1, Math.ceil(nameLength / Math.max(10, Math.floor(contentWidth / 8.4)))));
  const summaryLines = summaryLength === 0 ? 1 : Math.min(3, Math.ceil(summaryLength / Math.max(14, Math.floor(contentWidth / 6.5))));
  const statusCount = (node.agentStatus !== "none" ? 1 : 0) + (node.gitStatus ? 1 : 0) + (node.gitStatus?.change ? 1 : 0);
  const statusRows = estimateChipRows(chipLabels.slice(0, statusCount), contentWidth);
  const tagRows = estimateChipRows(chipLabels.slice(statusCount), contentWidth);
  const potentialReuseRows = node.kind === "function" || node.kind === "object" ? 1 : 0;
  const contentHeight =
    24 +
    24 +
    10 +
    nameLines * 19 +
    7 +
    summaryLines * 18 +
    (statusRows > 0 ? 8 + statusRows * 20 : 0) +
    (tagRows + potentialReuseRows > 0 ? 8 + (tagRows + potentialReuseRows) * 21 : 0);
  const minHeight = node.kind === "format" ? 96 : node.kind === "ui_component" ? 136 : 128;
  const height = Math.max(baseHeight, minHeight, contentHeight);
  return { width: Math.round(width), height: Math.round(height) };
}

function estimateChipRows(labels: string[], contentWidth: number): number {
  if (labels.length === 0) {
    return 0;
  }
  let rows = 1;
  let rowWidth = 0;
  for (const label of labels) {
    const chipWidth = Math.min(contentWidth, Math.max(44, 22 + label.length * 7));
    const nextWidth = rowWidth === 0 ? chipWidth : rowWidth + 5 + chipWidth;
    if (nextWidth > contentWidth && rowWidth > 0) {
      rows += 1;
      rowWidth = chipWidth;
    } else {
      rowWidth = nextWidth;
    }
  }
  return rows;
}

const BOUNDARY_PADDING_X = 48;
const BOUNDARY_PADDING_BOTTOM = 44;
const BOUNDARY_MIN_TOP_PADDING = 88;

function primaryBoundaryMembership(boundaries: GraphBoundary[], visibleIds: Set<string>): Map<string, string> {
  const result = new Map<string, string>();
  const ordered = [...boundaries].sort((a, b) => a.size.width * a.size.height - b.size.width * b.size.height || a.name.localeCompare(b.name));
  for (const boundary of ordered) {
    for (const nodeId of boundary.memberNodeIds) {
      if (visibleIds.has(nodeId) && !result.has(nodeId)) {
        result.set(nodeId, boundary.id);
      }
    }
  }
  return result;
}

function boundaryAsLayoutNode(boundary: GraphBoundary, memberLayouts: LayoutResult): GraphNode {
  const bounds = layoutBounds(memberLayouts);
  const width = Math.max(boundary.size.width, bounds.width + BOUNDARY_PADDING_X * 2, measureBoundaryHeaderWidth(boundary));
  const topPadding = boundaryTopPadding(boundary, width);
  return {
    id: boundary.id,
    projectId: boundary.projectId,
    kind: "module",
    name: boundary.name,
    summary: boundary.summary,
    code: {
      context: boundary.codeContext,
      directory: null,
      startLine: null,
      endLine: null,
      language: "unknown"
    },
    parentId: boundary.scopeNodeId,
    attachedToId: null,
    customTypeId: null,
	    source: {
	      path: null,
	      startLine: null,
	      endLine: null
	    },
	    execution: {
	      testScriptDirectory: null,
	      virtualEnvironment: null,
	      workingDirectory: null,
	      setupCommand: null,
	      testCommand: null
	    },
	    position: boundary.position,
    size: {
      width,
      height: Math.max(boundary.size.height, bounds.height + topPadding + BOUNDARY_PADDING_BOTTOM)
    },
    childCount: 0,
    hasChildren: false,
    agentStatus: "none",
    gitStatus: null,
    tags: [],
    createdAt: boundary.createdAt,
    updatedAt: boundary.updatedAt
  };
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
  return Math.max(BOUNDARY_MIN_TOP_PADDING, headerHeight + 28);
}

function layoutBounds(layouts: LayoutResult): { minX: number; minY: number; width: number; height: number } {
  if (layouts.size === 0) {
    return { minX: 0, minY: 0, width: 260, height: 160 };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const layout of layouts.values()) {
    minX = Math.min(minX, layout.position.x);
    minY = Math.min(minY, layout.position.y);
    maxX = Math.max(maxX, layout.position.x + layout.size.width);
    maxY = Math.max(maxY, layout.position.y + layout.size.height);
  }
  return {
    minX,
    minY,
    width: maxX - minX,
    height: maxY - minY
  };
}
