import {
  codingWorkflowOrchestrationSchema,
  type CodingAgentMode,
  type CodingWorkflowItemStatus,
  type CodingWorkflowOrchestration,
  type ContextBudget,
  type GraphEdge,
  type GraphNode,
  type RoutingFeatures,
  type WorkflowRevision
} from "@graphcode/graph-model";

export const MA1_ORCHESTRATION_FEATURE_VERSION = "ma1-schema-v1";
export const MA1_CONTEXT_COMPILER_VERSION = "uncompiled-v1";
export const MA1_ROUTING_FEATURE_VERSION = "legacy-preview-v1";

export type WorkUnitPreviewPlanItem = {
  id: string;
  nodeId: string;
  layerIndex: number;
  recommendedMode: CodingAgentMode;
  selectedMode: CodingAgentMode;
  modeReason: string;
  status: CodingWorkflowItemStatus;
};

export type WorkUnitPreviewRevisionContext = {
  indexRevision: string | null;
  workspaceRevision: string | null;
  graphRevision: number;
  sourceHashes: Record<string, string>;
  indexState: RoutingFeatures["indexState"];
  capturedAt?: string;
};

export function deriveLegacyWorkUnitOrchestration(input: {
  workflowId: string;
  projectId: string;
  items: WorkUnitPreviewPlanItem[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  revision: WorkUnitPreviewRevisionContext;
}): CodingWorkflowOrchestration {
  const nodeById = new Map(input.nodes.map((node) => [node.id, node]));
  const itemByNodeId = new Map(input.items.map((item) => [item.nodeId, item]));
  const itemById = new Map(input.items.map((item) => [item.id, item]));
  const candidateNodeIds = new Set(itemByNodeId.keys());
  const parentByItemId = new Map<string, string>();
  const childrenByItemId = new Map<string, string[]>();

  for (const item of input.items) {
    const node = nodeById.get(item.nodeId);
    const parentNodeId = node ? nearestCandidateOwner(node, nodeById, candidateNodeIds) : null;
    const parentItem = parentNodeId ? itemByNodeId.get(parentNodeId) : undefined;
    if (parentItem) {
      parentByItemId.set(item.id, parentItem.id);
      const children = childrenByItemId.get(parentItem.id) ?? [];
      children.push(item.id);
      childrenByItemId.set(parentItem.id, children);
    }
  }

  const relevantEvidenceNodeIds = new Set(candidateNodeIds);
  for (const edge of input.edges) {
    if (candidateNodeIds.has(edge.sourceNodeId) || candidateNodeIds.has(edge.targetNodeId)) {
      relevantEvidenceNodeIds.add(edge.sourceNodeId);
      relevantEvidenceNodeIds.add(edge.targetNodeId);
    }
  }
  const relevantSourcePaths = new Set<string>();
  for (const node of input.nodes) {
    if (relevantEvidenceNodeIds.has(node.id)) {
      const sourcePath = normalizeWorkspacePath(node.source.path ?? node.code.directory);
      if (sourcePath) relevantSourcePaths.add(sourcePath);
    }
  }
  const normalizedHashes: Record<string, string> = {};
  for (const [sourcePath, hash] of Object.entries(input.revision.sourceHashes)) {
    const normalized = normalizeWorkspacePath(sourcePath);
    if (normalized && relevantSourcePaths.has(normalized)) {
      normalizedHashes[normalized] = hash;
    }
  }
  const revision: WorkflowRevision = {
    indexRevision: input.revision.indexRevision,
    workspaceRevision: input.revision.workspaceRevision,
    graphRevision: input.revision.graphRevision,
    sourceHashes: normalizedHashes,
    contextCompilerVersion: MA1_CONTEXT_COMPILER_VERSION,
    routingFeatureVersion: MA1_ROUTING_FEATURE_VERSION,
    capturedAt: input.revision.capturedAt ?? new Date().toISOString()
  };

  const relevantEdges = input.edges.filter((edge) => itemByNodeId.has(edge.sourceNodeId) || itemByNodeId.has(edge.targetNodeId));
  const boundaryEdges = relevantEdges
    .filter((edge) => edge.sourceNodeId !== edge.targetNodeId)
    .map((edge) => ({ id: edge.id, sourceNodeId: edge.sourceNodeId, targetNodeId: edge.targetNodeId, kind: edge.kind }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const coordinationByItemId = new Map<string, Set<string>>();
  for (const edge of relevantEdges) {
    const sourceItem = itemByNodeId.get(edge.sourceNodeId);
    const targetItem = itemByNodeId.get(edge.targetNodeId);
    if (!sourceItem || !targetItem || sourceItem.id === targetItem.id) {
      continue;
    }
    addToSetMap(coordinationByItemId, sourceItem.id, targetItem.id);
    addToSetMap(coordinationByItemId, targetItem.id, sourceItem.id);
  }

  const workUnits = input.items.map((item) => {
    const node = nodeById.get(item.nodeId);
    if (!node) {
      throw new Error(`Cannot derive work unit ${item.id}: node ${item.nodeId} does not exist.`);
    }
    const boundaryEdgeIds = relevantEdges
      .filter((edge) => edge.sourceNodeId !== edge.targetNodeId && (edge.sourceNodeId === item.nodeId || edge.targetNodeId === item.nodeId))
      .map((edge) => edge.id)
      .sort();
    const dependencyWorkUnitIds = [...(childrenByItemId.get(item.id) ?? [])].sort();
    const coordinationWorkUnitIds = [...(coordinationByItemId.get(item.id) ?? [])].sort();
    const plannedWriteScope = plannedWriteScopeForNode(node);
    const routingDecisionId = `routing-${item.id}`;
    return {
      id: item.id,
      workflowId: input.workflowId,
      projectId: input.projectId,
      parentWorkUnitId: parentByItemId.get(item.id) ?? null,
      layerIndex: item.layerIndex,
      title: node.name,
      objective: node.summary.trim() ? `Implement ${node.name}: ${node.summary.trim()}` : `Implement the scoped planning block ${node.name}.`,
      ownedNodeIds: [node.id],
      readHaloNodeIds: [],
      boundaryEdgeIds,
      dependencyWorkUnitIds,
      coordinationWorkUnitIds,
      plannedWriteScopes: plannedWriteScope ? [plannedWriteScope] : [],
      expectedOutputs: [{ kind: "diff" as const, description: `Reviewable scoped proposal for ${node.name}.`, required: true, path: null }],
      recommendedScale: item.recommendedMode,
      selectedScale: item.selectedMode,
      routingDecisionId,
      contextBudget: contextBudgetForScale(item.selectedMode),
      baseRevision: revision,
      status: mapItemStatus(item.status)
    };
  });

  const dependentsByItemId = new Map<string, number>();
  for (const unit of workUnits) {
    for (const dependencyId of unit.dependencyWorkUnitIds) {
      dependentsByItemId.set(dependencyId, (dependentsByItemId.get(dependencyId) ?? 0) + 1);
    }
  }
  const routingDecisions = workUnits.map((unit) => {
    const item = itemById.get(unit.id)!;
    const node = nodeById.get(item.nodeId)!;
    const features = routingFeaturesForUnit({
      unit,
      node,
      nodesById: nodeById,
      boundaryEdges: relevantEdges.filter((edge) => unit.boundaryEdgeIds.includes(edge.id)),
      upstreamCount: unit.dependencyWorkUnitIds.length,
      downstreamCount: dependentsByItemId.get(unit.id) ?? 0,
      indexState: input.revision.indexState
    });
    return {
      id: unit.routingDecisionId,
      workUnitId: unit.id,
      recommendedScale: item.recommendedMode,
      selectedScale: item.selectedMode,
      featureVersion: MA1_ROUTING_FEATURE_VERSION,
      features,
      reasons: [item.modeReason],
      estimatedInputTokens: 0,
      estimatedOutputTokens: 0,
      estimatedCost: null,
      override:
        item.selectedMode === item.recommendedMode
          ? null
          : { actor: "user" as const, reason: "Legacy workflow mode override selected during preview." }
    };
  });

  const warnings = ["MA-1 exposes schema-backed legacy ownership; topology-aware partitioning and contract generation begin in MA-2."];
  if (!revision.indexRevision || input.revision.indexState !== "complete") {
    warnings.push("Index evidence is incomplete or unavailable; the pinned revision remains visible and later dispatch must revalidate it.");
  }
  if (workUnits.some((unit) => unit.plannedWriteScopes.length === 0)) {
    warnings.push("At least one work unit has no safe derived write scope and therefore receives no write authority in the MA-1 preview.");
  }

  return codingWorkflowOrchestrationSchema.parse({
    schemaVersion: 1,
    featureVersion: MA1_ORCHESTRATION_FEATURE_VERSION,
    workflowId: input.workflowId,
    projectId: input.projectId,
    revision,
    workUnits,
    boundaryEdges,
    interfaceContracts: [],
    routingDecisions,
    warnings
  });
}

export function contextBudgetForScale(scale: CodingAgentMode): ContextBudget {
  if (scale === "small") {
    return { maxInputTokens: 16000, maxSourceTokens: 8000, maxGraphTokens: 4000, maxContractTokens: 2000, maxFiles: 4, maxNodes: 64, maxEdges: 128 };
  }
  if (scale === "medium") {
    return { maxInputTokens: 48000, maxSourceTokens: 28000, maxGraphTokens: 10000, maxContractTokens: 6000, maxFiles: 16, maxNodes: 256, maxEdges: 512 };
  }
  return { maxInputTokens: 128000, maxSourceTokens: 76000, maxGraphTokens: 28000, maxContractTokens: 16000, maxFiles: 64, maxNodes: 1024, maxEdges: 2048 };
}

function nearestCandidateOwner(node: GraphNode, nodeById: Map<string, GraphNode>, candidateIds: Set<string>): string | null {
  const seen = new Set<string>();
  let currentId = node.attachedToId ?? node.parentId;
  while (currentId && !seen.has(currentId)) {
    if (candidateIds.has(currentId)) {
      return currentId;
    }
    seen.add(currentId);
    const current = nodeById.get(currentId);
    currentId = current?.attachedToId ?? current?.parentId ?? null;
  }
  return null;
}

function normalizeWorkspacePath(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  const segments = normalized.split("/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.endsWith("/") ||
    normalized.includes("//") ||
    segments.some((segment) => segment === "." || segment === ".." || segment.length === 0)
  ) {
    return null;
  }
  return normalized;
}

function plannedWriteScopeForNode(node: GraphNode) {
  const sourcePath = normalizeWorkspacePath(node.source.path ?? node.code.directory);
  if (!sourcePath) {
    return null;
  }
  const startLine = node.source.startLine ?? node.code.startLine;
  const endLine = node.source.endLine ?? node.code.endLine;
  const hasValidRange = startLine !== null && endLine !== null && startLine > 0 && endLine >= startLine;
  return {
    path: sourcePath,
    startLine: hasValidRange ? startLine : null,
    endLine: hasValidRange ? endLine : null,
    symbolId: node.id,
    permission: "edit" as const
  };
}

function routingFeaturesForUnit(input: {
  unit: CodingWorkflowOrchestration["workUnits"][number];
  node: GraphNode;
  nodesById: Map<string, GraphNode>;
  boundaryEdges: GraphEdge[];
  upstreamCount: number;
  downstreamCount: number;
  indexState: RoutingFeatures["indexState"];
}): RoutingFeatures {
  const ownPath = normalizeWorkspacePath(input.node.source.path ?? input.node.code.directory);
  let crossFileRelationshipCount = 0;
  for (const edge of input.boundaryEdges) {
    const otherNodeId = edge.sourceNodeId === input.node.id ? edge.targetNodeId : edge.sourceNodeId;
    const other = input.nodesById.get(otherNodeId);
    const otherPath = normalizeWorkspacePath(other?.source.path ?? other?.code.directory ?? null);
    if (ownPath && otherPath && ownPath !== otherPath) {
      crossFileRelationshipCount += 1;
    }
  }
  const sourceRange = input.unit.plannedWriteScopes[0];
  const estimatedSourceTokens =
    sourceRange && sourceRange.startLine !== null && sourceRange.endLine !== null
      ? Math.max(1, sourceRange.endLine - sourceRange.startLine + 1) * 12
      : 0;
  const risks: RoutingFeatures["risks"] = [];
  if (crossFileRelationshipCount > 0) risks.push("cross_file");
  if (input.indexState !== "complete") risks.push("incomplete_index");
  return {
    ownedSymbolCount: input.unit.ownedNodeIds.length,
    estimatedSourceTokens,
    controlFlowComplexity: null,
    cutEdgeCount: input.boundaryEdges.length,
    cutEdgeWeight: input.boundaryEdges.length,
    crossFileRelationshipCount,
    crossPackageRelationshipCount: 0,
    upstreamWorkUnitCount: input.upstreamCount,
    downstreamWorkUnitCount: input.downstreamCount,
    interfaceChangeRequested: false,
    publicApiInvolvement: false,
    sharedStateInvolvement: false,
    testAvailability: input.node.execution.testCommand ? "available" : "unknown",
    blastRadius: input.unit.selectedScale === "small" ? "local" : input.unit.selectedScale === "medium" ? "module" : input.node.kind === "framework" ? "repository" : "cross_package",
    languageConfidence: null,
    indexState: input.indexState,
    taskAmbiguity: "unknown",
    planningConfidence: null,
    risks
  };
}

function mapItemStatus(status: CodingWorkflowItemStatus): CodingWorkflowOrchestration["workUnits"][number]["status"] {
  return status;
}

function addToSetMap(map: Map<string, Set<string>>, key: string, value: string): void {
  const values = map.get(key) ?? new Set<string>();
  values.add(value);
  map.set(key, values);
}
