import {
  type CodingAgentMode,
  type CodingWorkflowExecutionPolicy,
  type CodingWorkflowOrchestration,
  type CodingWorkflowPartitionConstraints,
  type GraphEdge,
  type GraphNode,
  type RoutingFeatures,
  type WorkflowRevision
} from "@graphcode/graph-model";
import {
  DEFAULT_PARTITION_BUDGETS,
  defaultWorkflowEdgePolicy,
  graphPartitionInputSchema,
  partitionGraphTask
} from "@graphcode/graph-query";
import type { WorkUnitPreviewRevisionContext } from "./work-unit-preview";

export type PartitionPreviewPlanItem = {
  nodeId: string;
  recommendedMode: CodingAgentMode;
  selectedMode: CodingAgentMode;
  modeReason: string;
};

export function previewPartitionedCodingWorkflow(input: {
  workflowId: string;
  projectId: string;
  scopeNodeId: string;
  scopeName: string;
  planItems: PartitionPreviewPlanItem[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  revision: WorkUnitPreviewRevisionContext;
  maximumConcurrency?: number;
  partitionConstraints?: CodingWorkflowPartitionConstraints;
  executionPolicy?: CodingWorkflowExecutionPolicy;
}): CodingWorkflowOrchestration {
  const scoped = selectPartitionPreviewGraph(input.scopeNodeId, input.planItems.map((item) => item.nodeId), input.nodes, input.edges);
  const relevantPaths = new Set(
    scoped.nodes
      .map((node) => normalizeWorkspacePath(node.source.path ?? node.code.directory))
      .filter((sourcePath): sourcePath is string => Boolean(sourcePath))
  );
  const sourceHashes = Object.fromEntries(
    Object.entries(input.revision.sourceHashes)
      .map(([sourcePath, hash]) => [normalizeWorkspacePath(sourcePath), hash] as const)
      .filter((entry): entry is [string, string] => Boolean(entry[0]) && relevantPaths.has(entry[0]!))
      .map(([sourcePath, hash]) => [sourcePath!, hash])
  );
  const revision: WorkflowRevision = {
    indexRevision: input.revision.indexRevision,
    workspaceRevision: input.revision.workspaceRevision,
    graphRevision: input.revision.graphRevision,
    sourceHashes,
    contextCompilerVersion: "uncompiled-v1",
    routingFeatureVersion: "partition-preview-v1",
    capturedAt: input.revision.capturedAt ?? new Date().toISOString()
  };
  const partitionInput = graphPartitionInputSchema.parse({
    workflowId: input.workflowId,
    projectId: input.projectId,
    revision,
    indexState: input.revision.indexState as RoutingFeatures["indexState"],
    scopeNodeId: input.scopeNodeId,
    targetNodeIds: input.planItems.map((item) => item.nodeId),
    targetHints: input.planItems.map((item) => ({
      nodeId: item.nodeId,
      recommendedScale: item.recommendedMode,
      selectedScale: item.selectedMode,
      reason: item.modeReason,
      override:
        item.selectedMode === item.recommendedMode
          ? null
          : { actor: "user" as const, reason: "Explicit coding workflow mode override." }
    })),
    task: `Implement the selected planning blocks under ${input.scopeName}.`,
    nodes: scoped.nodes,
    edges: scoped.edges,
    maximumConcurrency: input.maximumConcurrency ?? 4,
    budgets: DEFAULT_PARTITION_BUDGETS,
    policy: defaultWorkflowEdgePolicy(),
    constraints: {
      keepTogetherNodeGroups: input.partitionConstraints?.keepTogetherNodeGroups ?? [],
      separateNodePairs: input.partitionConstraints?.separateNodePairs ?? [],
      approvedIgnoredEdges: input.partitionConstraints?.approvedIgnoredEdges ?? [],
      explicitDependencies: [],
      requestedInterfaceChangeEdgeIds: []
    }
  });
  return {
    ...partitionGraphTask(partitionInput),
    partitionConstraints: input.partitionConstraints ?? { keepTogetherNodeGroups: [], separateNodePairs: [], approvedIgnoredEdges: [] },
    executionPolicy: input.executionPolicy ?? { maximumConcurrency: input.maximumConcurrency ?? 4, maxEstimatedCost: null, currency: "USD" }
  };
}

export function selectPartitionPreviewGraph(
  scopeNodeId: string,
  targetNodeIds: string[],
  nodes: GraphNode[],
  edges: GraphEdge[]
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const targetIds = new Set(targetNodeIds);
  const includedNodeIds = new Set<string>([scopeNodeId, ...targetNodeIds]);
  for (const targetNodeId of targetNodeIds) {
    const seen = new Set<string>();
    let current = nodeById.get(targetNodeId);
    while (current && current.id !== scopeNodeId) {
      const parentId = current.attachedToId ?? current.parentId;
      if (!parentId || seen.has(parentId)) break;
      includedNodeIds.add(parentId);
      seen.add(parentId);
      current = nodeById.get(parentId);
    }
  }
  for (const edge of edges) {
    if (targetIds.has(edge.sourceNodeId) || targetIds.has(edge.targetNodeId)) {
      includedNodeIds.add(edge.sourceNodeId);
      includedNodeIds.add(edge.targetNodeId);
    }
  }
  return {
    nodes: nodes.filter((node) => includedNodeIds.has(node.id)).sort((left, right) => left.id.localeCompare(right.id)),
    edges: edges
      .filter((edge) => includedNodeIds.has(edge.sourceNodeId) && includedNodeIds.has(edge.targetNodeId))
      .sort((left, right) => left.id.localeCompare(right.id))
  };
}

function normalizeWorkspacePath(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized) || normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    return null;
  }
  return normalized;
}
