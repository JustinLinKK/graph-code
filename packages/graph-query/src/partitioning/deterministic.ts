import {
  codingWorkflowOrchestrationSchema,
  isDomainNodeKind,
  workspaceRelativePathSchema,
  type CodingWorkflowOrchestration,
  type GraphEdge,
  type GraphNode,
  type IgnoredPartitionEdge,
  type InterfaceContract,
  type PartitionOmission,
  type PartitionSccResolution,
  type RoutingFeatures,
  type SourceEvidenceRef,
  type SourceWriteScope
} from "@graphcode/graph-model";
import {
  DEFAULT_EDGE_RULES,
  effectiveEdgeRule,
  graphPartitionInputSchema,
  scaleForEstimatedTokens,
  type ClassifiedPartitionEdge,
  type GraphPartitionInput,
  type MutablePartition,
  type PartitionTargetHint
} from "./contracts";

export type TaskSubgraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  omissions: PartitionOmission[];
};

export function partitionGraphTask(rawInput: GraphPartitionInput): CodingWorkflowOrchestration {
  const input = graphPartitionInputSchema.parse(rawInput);
  const subgraph = buildTaskSubgraph(input);
  const nodeById = new Map(subgraph.nodes.map((node) => [node.id, node]));
  const targetIds = new Set(input.targetNodeIds);
  const targetHints = new Map(input.targetHints.map((hint) => [hint.nodeId, hint]));
  const aggregationTargetIds = new Set(
    input.targetNodeIds.filter((candidateId) => input.targetNodeIds.some((nodeId) => nodeId !== candidateId && isDescendantOf(nodeId, candidateId, nodeById)))
  );
  const leafTargetIds = input.targetNodeIds.filter((nodeId) => !aggregationTargetIds.has(nodeId)).sort();
  const leafGroups = formLeafOwnershipGroups(input, subgraph, leafTargetIds, nodeById);
  const partitions = new Map<string, MutablePartition>();
  const ownerByNodeId = new Map<string, string>();

  for (const ownedNodeIds of leafGroups) {
    const estimatedTokens = ownedNodeIds.reduce((total, nodeId) => total + estimateNodeTokens(nodeById.get(nodeId)!), 0);
    const hintScale = maxScale(ownedNodeIds.map((nodeId) => targetHints.get(nodeId)?.selectedScale).filter(isScale));
    const explicitOverride = overrideForNodeIds(ownedNodeIds, targetHints);
    const estimatedScale = scaleForEstimatedTokens(estimatedTokens, input.budgets);
    const selectedScale = explicitOverride ? explicitOverride.selectedScale : maxScale([hintScale, estimatedScale].filter(isScale));
    const recommendedScale = maxScale([
      maxScale(ownedNodeIds.map((nodeId) => targetHints.get(nodeId)?.recommendedScale).filter(isScale)),
      estimatedScale
    ].filter(isScale));
    const id = stableUnitId(input, "leaf", ownedNodeIds);
    const partition: MutablePartition = {
      id,
      kind: "leaf",
      title: ownedNodeIds.map((nodeId) => nodeById.get(nodeId)?.name ?? nodeId).join(" + "),
      objective: `Implement the graph-owned task partition for ${ownedNodeIds.map((nodeId) => nodeById.get(nodeId)?.name ?? nodeId).join(", ")}: ${input.task}`,
      ownedNodeIds,
      parentWorkUnitId: null,
      dependencyWorkUnitIds: new Set(),
      coordinationWorkUnitIds: new Set(),
      estimatedTokens,
      recommendedScale,
      selectedScale,
      routingReason: ownedNodeIds.map((nodeId) => targetHints.get(nodeId)?.reason).filter(Boolean).join(" ") || "Deterministic MA-2 partition estimate.",
      contextBudget: input.budgets.contextBudgets[selectedScale]
    };
    partitions.set(id, partition);
    for (const nodeId of ownedNodeIds) ownerByNodeId.set(nodeId, id);
  }

  const aggregationNodeIds = new Set<string>(aggregationTargetIds);
  if (!ownerByNodeId.has(input.scopeNodeId) && partitions.size > 1) aggregationNodeIds.add(input.scopeNodeId);
  for (const nodeId of [...aggregationNodeIds].sort()) {
    const node = nodeById.get(nodeId);
    if (!node || !isDomainNodeKind(node.kind)) continue;
    const ownedNodeIds = targetIds.has(nodeId) && !ownerByNodeId.has(nodeId) ? [nodeId] : [];
    const id = stableUnitId(input, "integration", [nodeId]);
    const estimatedTokens = Math.max(512, ownedNodeIds.reduce((total, ownedId) => total + estimateNodeTokens(nodeById.get(ownedId)!), 0));
    const estimatedScale = estimatedTokens > input.budgets.mediumPartitionTokenLimit ? "large" : "medium";
    const explicitOverride = overrideForNodeIds(ownedNodeIds, targetHints);
    const selectedScale = explicitOverride?.selectedScale ?? estimatedScale;
    partitions.set(id, {
      id,
      kind: "integration",
      title: `${node.name} integration`,
      objective: `Integrate child partition outputs and preserve contracts for ${node.name}: ${input.task}`,
      ownedNodeIds,
      parentWorkUnitId: null,
      dependencyWorkUnitIds: new Set(),
      coordinationWorkUnitIds: new Set(),
      estimatedTokens,
      recommendedScale: estimatedScale,
      selectedScale,
      routingReason: "Parent aggregation integrates multiple graph-owned child outputs.",
      contextBudget: input.budgets.contextBudgets[selectedScale]
    });
    for (const ownedId of ownedNodeIds) ownerByNodeId.set(ownedId, id);
  }

  assignContainmentParents(partitions, nodeById, aggregationNodeIds, input);
  const initialClassifications = classifyGraphEdges(input, subgraph.edges, ownerByNodeId);
  applyClassifiedDependencies(partitions, initialClassifications, subgraph.edges);
  applyExplicitDependencies(input, partitions, ownerByNodeId);
  applyWriteConflicts(partitions, nodeById);
  const sccResolutions: PartitionSccResolution[] = [];
  resolveDependencySccs(input, partitions, ownerByNodeId, sccResolutions);

  if (partitions.size > input.budgets.maxPartitions) {
    throw new Error(`Partition policy produced ${partitions.size} work units, exceeding maxPartitions=${input.budgets.maxPartitions}.`);
  }
  const layers = computeDependencyLayers(partitions);
  const classifications = classifyGraphEdges(input, subgraph.edges, ownerByNodeId);
  const { contracts, ignoredEdges, boundaryEdges, boundaryEdgeIdsByUnit, haloNodeIdsByUnit } = buildBoundaryArtifacts(
    input,
    subgraph,
    partitions,
    ownerByNodeId,
    classifications,
    nodeById
  );
  const workUnits = [...partitions.values()]
    .sort((left, right) => layers.get(left.id)! - layers.get(right.id)! || left.id.localeCompare(right.id))
    .map((partition) => {
      const plannedWriteScopes = partition.ownedNodeIds.flatMap((nodeId) => {
        const scope = sourceWriteScopeForNode(nodeById.get(nodeId)!);
        return scope ? [scope] : [];
      });
      return {
        id: partition.id,
        workflowId: input.workflowId,
        projectId: input.projectId,
        parentWorkUnitId: partition.parentWorkUnitId,
        layerIndex: layers.get(partition.id)!,
        title: partition.title,
        objective: partition.objective,
        ownedNodeIds: [...partition.ownedNodeIds].sort(),
        readHaloNodeIds: [...(haloNodeIdsByUnit.get(partition.id) ?? [])].sort(),
        boundaryEdgeIds: [...(boundaryEdgeIdsByUnit.get(partition.id) ?? [])].sort(),
        dependencyWorkUnitIds: [...partition.dependencyWorkUnitIds].sort(),
        coordinationWorkUnitIds: [...partition.coordinationWorkUnitIds].filter((unitId) => partitions.has(unitId) && unitId !== partition.id).sort(),
        plannedWriteScopes,
        expectedOutputs: [
          { kind: "diff" as const, description: `Authorized proposal for ${partition.title}.`, required: partition.kind === "leaf", path: null },
          ...(contracts.some((contract) => contract.producerWorkUnitId === partition.id || contract.consumerWorkUnitId === partition.id)
            ? [{ kind: "contract" as const, description: "Reconcile declared boundary contracts.", required: true, path: null }]
            : [])
        ],
        recommendedScale: partition.recommendedScale,
        selectedScale: partition.selectedScale,
        routingDecisionId: `routing-${partition.id}`,
        contextBudget: partition.contextBudget,
        baseRevision: input.revision,
        status: "pending" as const
      };
    });
  const routingDecisions = [...partitions.values()]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((partition) => {
      const boundaryCount = boundaryEdgeIdsByUnit.get(partition.id)?.size ?? 0;
      const crossFileCount = countCrossFileBoundaryEdges(partition.id, classifications, subgraph.edges, nodeById);
      const risks: RoutingFeatures["risks"] = [];
      const explicitOverride = overrideForNodeIds(partition.ownedNodeIds, targetHints);
      if (crossFileCount > 0) risks.push("cross_file");
      if (input.indexState !== "complete") risks.push("incomplete_index");
      if (partition.kind === "integration") risks.push("public_contract");
      return {
        id: `routing-${partition.id}`,
        workUnitId: partition.id,
        recommendedScale: partition.recommendedScale,
        selectedScale: partition.selectedScale,
        featureVersion: "partition-preview-v1",
        features: {
          ownedSymbolCount: partition.ownedNodeIds.length,
          estimatedSourceTokens: partition.estimatedTokens,
          controlFlowComplexity: null,
          cutEdgeCount: boundaryCount,
          cutEdgeWeight: classifications
            .filter((edge) => edge.cut && (edge.sourceWorkUnitId === partition.id || edge.targetWorkUnitId === partition.id))
            .reduce((total, edge) => total + edge.weight, 0),
          crossFileRelationshipCount: crossFileCount,
          crossPackageRelationshipCount: countCrossPackageBoundaryEdges(partition.id, classifications, subgraph.edges, nodeById),
          upstreamWorkUnitCount: partition.dependencyWorkUnitIds.size,
          downstreamWorkUnitCount: [...partitions.values()].filter((candidate) => candidate.dependencyWorkUnitIds.has(partition.id)).length,
          interfaceChangeRequested: classifications.some(
            (edge) => input.constraints.requestedInterfaceChangeEdgeIds.includes(edge.edgeId) && (edge.sourceWorkUnitId === partition.id || edge.targetWorkUnitId === partition.id)
          ),
          publicApiInvolvement: partition.kind === "integration" || contracts.some((contract) => contract.producerWorkUnitId === partition.id),
          sharedStateInvolvement: false,
          testAvailability: partition.ownedNodeIds.some((nodeId) => Boolean(nodeById.get(nodeId)?.execution.testCommand)) ? "available" : "unknown",
          blastRadius: partition.kind === "integration" ? "module" : crossFileCount > 0 ? "cross_package" : "local",
          languageConfidence: null,
          indexState: input.indexState,
          taskAmbiguity: "unknown",
          planningConfidence: null,
          risks
        },
        reasons: [partition.routingReason, `MA-2 estimated ${partition.estimatedTokens} source tokens and ${boundaryCount} cut edges.`],
        estimatedInputTokens: partition.estimatedTokens,
        estimatedOutputTokens: Math.max(256, Math.ceil(partition.estimatedTokens * 0.1)),
        estimatedCost: null,
        override: explicitOverride ? { actor: explicitOverride.actor, reason: explicitOverride.reason } : null
      };
    });
  const relatedClassifications = classifications.filter((edge) => edge.sourceWorkUnitId && edge.targetWorkUnitId);
  const internalRelationshipEdges = relatedClassifications.filter((edge) => !edge.cut).length;
  const cutRelationshipEdges = relatedClassifications.filter((edge) => edge.cut).length;
  const estimatedTokensByWorkUnit = Object.fromEntries([...partitions.values()].map((partition) => [partition.id, partition.estimatedTokens]));
  const warnings = [
    "MA-2 partition output is preview-only; production dispatch remains on the legacy hierarchy/conflict-group scheduler.",
    ...(subgraph.omissions.length > 0 ? [`Scoped subgraph omitted ${subgraph.omissions.length} nodes or edges with explicit reasons.`] : []),
    ...(input.indexState === "complete" ? [] : ["Index evidence is not complete; omissions and routing risk retain that state."])
  ];
  const result = {
    schemaVersion: 1 as const,
    featureVersion: "ma2-partition-v1",
    workflowId: input.workflowId,
    projectId: input.projectId,
    revision: input.revision,
    workUnits,
    boundaryEdges,
    interfaceContracts: contracts,
    routingDecisions,
    warnings,
    partitioning: {
      policyVersion: input.policy.version,
      inputHash: partitionInputHash(input),
      scopeNodeId: input.scopeNodeId,
      targetNodeIds: [...input.targetNodeIds].sort(),
      targetHints: [...input.targetHints].sort((left, right) => left.nodeId.localeCompare(right.nodeId)),
      indexState: input.indexState,
      includedNodeIds: subgraph.nodes.map((node) => node.id).sort(),
      includedEdgeIds: subgraph.edges.map((edge) => edge.id).sort(),
      omissions: subgraph.omissions,
      edgeClassifications: classifications.map(({ contractKind: _contractKind, ...classification }) => classification),
      ignoredEdges,
      sccResolutions,
      estimatedTokensByWorkUnit,
      totalEstimatedTokens: Object.values(estimatedTokensByWorkUnit).reduce((total, value) => total + value, 0),
      internalRelationshipEdges,
      cutRelationshipEdges,
      relatedEdgeLocalityRatio:
        internalRelationshipEdges + cutRelationshipEdges === 0
          ? 1
          : internalRelationshipEdges / (internalRelationshipEdges + cutRelationshipEdges)
    }
  };
  const parsed = codingWorkflowOrchestrationSchema.safeParse(result);
  if (!parsed.success) {
    throw new Error(
      `Deterministic partition output failed validation: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
        .join(" ")}`
    );
  }
  for (const targetNodeId of input.targetNodeIds) {
    if (!parsed.data.workUnits.some((unit) => unit.ownedNodeIds.includes(targetNodeId))) {
      throw new Error(`Partition validation failed: target node ${targetNodeId} has no leaf owner.`);
    }
  }
  return parsed.data;
}

export function buildTaskSubgraph(input: GraphPartitionInput): TaskSubgraph {
  const parsed = graphPartitionInputSchema.parse(input);
  const nodeById = new Map(parsed.nodes.map((node) => [node.id, node]));
  const targetIds = new Set(parsed.targetNodeIds);
  const hardRequired = new Set<string>([...targetIds, parsed.scopeNodeId]);
  const priorityByNodeId = new Map<string, number>();
  for (const nodeId of hardRequired) priorityByNodeId.set(nodeId, 0);
  for (const targetNodeId of parsed.targetNodeIds) {
    let current = nodeById.get(targetNodeId);
    const seen = new Set<string>();
    while (current && current.id !== parsed.scopeNodeId) {
      const parentId = current.attachedToId ?? current.parentId;
      if (!parentId || seen.has(parentId)) break;
      seen.add(parentId);
      priorityByNodeId.set(parentId, Math.min(priorityByNodeId.get(parentId) ?? Number.POSITIVE_INFINITY, 1));
      current = nodeById.get(parentId);
    }
  }
  for (const edge of parsed.edges) {
    if (targetIds.has(edge.sourceNodeId) || targetIds.has(edge.targetNodeId)) {
      const neighborId = targetIds.has(edge.sourceNodeId) ? edge.targetNodeId : edge.sourceNodeId;
      priorityByNodeId.set(neighborId, Math.min(priorityByNodeId.get(neighborId) ?? Number.POSITIVE_INFINITY, 2));
    }
  }
  const orderedCandidates = [...priorityByNodeId.entries()].sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]));
  const includedNodeIds = new Set<string>();
  const omissionReasonByNodeId = new Map<string, PartitionOmission["reason"]>();
  for (const [nodeId, priority] of orderedCandidates) {
    if (includedNodeIds.size < parsed.budgets.maxSubgraphNodes || hardRequired.has(nodeId)) {
      includedNodeIds.add(nodeId);
    } else {
      omissionReasonByNodeId.set(nodeId, "budget");
    }
    if (priority === 0 && !includedNodeIds.has(nodeId)) {
      throw new Error(`Task subgraph budget cannot retain required node ${nodeId}.`);
    }
  }
  for (const node of parsed.nodes) {
    if (!includedNodeIds.has(node.id) && !omissionReasonByNodeId.has(node.id)) omissionReasonByNodeId.set(node.id, "relevance");
  }
  const candidateEdges = parsed.edges
    .filter((edge) => includedNodeIds.has(edge.sourceNodeId) && includedNodeIds.has(edge.targetNodeId))
    .sort((left, right) => {
      const leftPriority = targetIds.has(left.sourceNodeId) || targetIds.has(left.targetNodeId) ? 0 : 1;
      const rightPriority = targetIds.has(right.sourceNodeId) || targetIds.has(right.targetNodeId) ? 0 : 1;
      return leftPriority - rightPriority || left.id.localeCompare(right.id);
    });
  const includedEdges = candidateEdges.slice(0, parsed.budgets.maxSubgraphEdges);
  const includedEdgeIds = new Set(includedEdges.map((edge) => edge.id));
  const omissions: PartitionOmission[] = [
    ...[...omissionReasonByNodeId.entries()].map(([entityId, reason]) => ({
      entityType: "node" as const,
      entityId,
      reason,
      detail: reason === "budget" ? "Node exceeded the explicit task-subgraph node budget." : "Node is outside target, ancestor, and direct relationship relevance."
    })),
    ...parsed.edges
      .filter((edge) => !includedEdgeIds.has(edge.id))
      .map((edge) => {
        const endpointReason = omissionReasonByNodeId.get(edge.sourceNodeId) ?? omissionReasonByNodeId.get(edge.targetNodeId);
        const reason: PartitionOmission["reason"] = endpointReason ?? "budget";
        return {
          entityType: "edge" as const,
          entityId: edge.id,
          reason,
          detail: endpointReason ? "Edge endpoint was omitted from the bounded task subgraph." : "Edge exceeded the explicit task-subgraph edge budget."
        };
      })
  ].sort((left, right) => left.entityType.localeCompare(right.entityType) || left.entityId.localeCompare(right.entityId));
  return {
    nodes: parsed.nodes.filter((node) => includedNodeIds.has(node.id)).sort((left, right) => left.id.localeCompare(right.id)),
    edges: includedEdges,
    omissions
  };
}

function formLeafOwnershipGroups(
  input: GraphPartitionInput,
  subgraph: TaskSubgraph,
  leafTargetIds: string[],
  nodeById: Map<string, GraphNode>
): string[][] {
  if (leafTargetIds.length === 0) {
    throw new Error("Deterministic partitioning requires at least one leaf ownership seed.");
  }
  const parent = new Map(leafTargetIds.map((nodeId) => [nodeId, nodeId]));
  const find = (nodeId: string): string => {
    const current = parent.get(nodeId)!;
    if (current === nodeId) return nodeId;
    const root = find(current);
    parent.set(nodeId, root);
    return root;
  };
  const separated = new Set(input.constraints.separateNodePairs.flatMap(([left, right]) => [`${left}\0${right}`, `${right}\0${left}`]));
  const canUnion = (leftMembers: string[], rightMembers: string[]): boolean =>
    !leftMembers.some((left) => rightMembers.some((right) => separated.has(`${left}\0${right}`)));
  const union = (left: string, right: string): boolean => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return false;
    const groups = currentGroups(parent, find);
    if (!canUnion(groups.get(leftRoot) ?? [], groups.get(rightRoot) ?? [])) return false;
    const [keep, remove] = [leftRoot, rightRoot].sort();
    parent.set(remove, keep);
    return true;
  };
  for (const group of input.constraints.keepTogetherNodeGroups) {
    const leafMembers = group.filter((nodeId) => parent.has(nodeId));
    if (leafMembers.length !== group.length) {
      throw new Error("Keep-together constraints cannot merge parent aggregation targets into leaf ownership units.");
    }
    for (const nodeId of leafMembers.slice(1)) {
      if (!union(leafMembers[0], nodeId)) throw new Error("Keep-together and separate-node constraints conflict.");
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    const groups = [...currentGroups(parent, find).values()].map((members) => members.sort()).sort((left, right) => left[0].localeCompare(right[0]));
    outer: for (let leftIndex = 0; leftIndex < groups.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < groups.length; rightIndex += 1) {
        const left = groups[leftIndex];
        const right = groups[rightIndex];
        if (!canUnion(left, right)) continue;
        const combinedTokens = [...left, ...right].reduce((total, nodeId) => total + estimateNodeTokens(nodeById.get(nodeId)!), 0);
        if (combinedTokens > input.budgets.smallMergeTokenLimit) continue;
        const sharesFile = left.some((leftId) => right.some((rightId) => sourcePathForNode(nodeById.get(leftId)!) === sourcePathForNode(nodeById.get(rightId)!)));
        const couplingWeight = subgraph.edges
          .filter(
            (edge) =>
              (left.includes(edge.sourceNodeId) && right.includes(edge.targetNodeId)) ||
              (left.includes(edge.targetNodeId) && right.includes(edge.sourceNodeId))
          )
          .reduce((total, edge) => total + effectiveEdgeRule(input.policy, edge.kind).weight, 0);
        const leftOwner = commonOwnershipAnchor(left, nodeById);
        const rightOwner = commonOwnershipAnchor(right, nodeById);
        const stronglyAdjacent = Boolean(leftOwner && leftOwner === rightOwner && couplingWeight >= input.budgets.highCouplingWeight);
        if (sharesFile || stronglyAdjacent) {
          union(left[0], right[0]);
          changed = true;
          break outer;
        }
      }
    }
  }
  return [...currentGroups(parent, find).values()].map((members) => members.sort()).sort((left, right) => left[0].localeCompare(right[0]));
}

function currentGroups(parent: Map<string, string>, find: (nodeId: string) => string): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const nodeId of parent.keys()) {
    const root = find(nodeId);
    const members = groups.get(root) ?? [];
    members.push(nodeId);
    groups.set(root, members);
  }
  return groups;
}

function assignContainmentParents(
  partitions: Map<string, MutablePartition>,
  nodeById: Map<string, GraphNode>,
  aggregationNodeIds: Set<string>,
  input: GraphPartitionInput
): void {
  const integrationByNodeId = new Map<string, string>();
  for (const partition of partitions.values()) {
    if (partition.kind === "integration") {
      const marker = partition.ownedNodeIds[0] ?? [...aggregationNodeIds].find((nodeId) => partition.id === stableUnitId(input, "integration", [nodeId]));
      if (marker) integrationByNodeId.set(marker, partition.id);
    }
  }
  for (const partition of partitions.values()) {
    const ancestorPaths = partition.ownedNodeIds.map((nodeId) => containmentAncestors(nodeId, nodeById));
    const candidateAncestors = ancestorPaths.length > 0 ? ancestorPaths[0].filter((nodeId) => ancestorPaths.every((path) => path.includes(nodeId))) : [input.scopeNodeId];
    const parentNodeId = candidateAncestors.find((nodeId) => integrationByNodeId.has(nodeId) && integrationByNodeId.get(nodeId) !== partition.id);
    partition.parentWorkUnitId = parentNodeId ? integrationByNodeId.get(parentNodeId)! : null;
  }
  for (const partition of partitions.values()) {
    if (partition.parentWorkUnitId) partitions.get(partition.parentWorkUnitId)?.dependencyWorkUnitIds.add(partition.id);
  }
}

function classifyGraphEdges(input: GraphPartitionInput, edges: GraphEdge[], ownerByNodeId: Map<string, string>): ClassifiedPartitionEdge[] {
  const interfaceChanges = new Set(input.constraints.requestedInterfaceChangeEdgeIds);
  return [...edges]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((edge) => {
      const rule = effectiveEdgeRule(input.policy, edge.kind);
      const sourceWorkUnitId = ownerByNodeId.get(edge.sourceNodeId) ?? null;
      const targetWorkUnitId = ownerByNodeId.get(edge.targetNodeId) ?? null;
      let classification = rule.classification;
      let reason = rule.reason;
      if (interfaceChanges.has(edge.id) && ["calls", "imports", "uses", "flows", "describes_format"].includes(edge.kind)) {
        classification = "requires_before";
        reason = "The task explicitly changes the consumed interface, so the producer must complete before the consumer.";
      }
      return {
        edgeId: edge.id,
        sourceWorkUnitId,
        targetWorkUnitId,
        classification,
        reason,
        weight: rule.weight,
        contractKind: rule.contractKind,
        cut: sourceWorkUnitId !== targetWorkUnitId && Boolean(sourceWorkUnitId || targetWorkUnitId)
      };
    });
}

function applyClassifiedDependencies(partitions: Map<string, MutablePartition>, classifications: ClassifiedPartitionEdge[], edges: GraphEdge[]): void {
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
  for (const classification of classifications) {
    const source = classification.sourceWorkUnitId;
    const target = classification.targetWorkUnitId;
    if (!source || !target || source === target) continue;
    if (classification.classification === "coordinates_with") {
      partitions.get(source)?.coordinationWorkUnitIds.add(target);
      partitions.get(target)?.coordinationWorkUnitIds.add(source);
    }
    if (classification.classification === "requires_before") {
      const edge = edgeById.get(classification.edgeId)!;
      const [prerequisite, dependent] = dependencyDirection(edge, source, target);
      partitions.get(dependent)?.dependencyWorkUnitIds.add(prerequisite);
    }
  }
}

function dependencyDirection(edge: GraphEdge, sourceUnitId: string, targetUnitId: string): [string, string] {
  if (["calls", "imports", "uses", "owns"].includes(edge.kind)) return [targetUnitId, sourceUnitId];
  return [sourceUnitId, targetUnitId];
}

function applyExplicitDependencies(input: GraphPartitionInput, partitions: Map<string, MutablePartition>, ownerByNodeId: Map<string, string>): void {
  for (const dependency of input.constraints.explicitDependencies) {
    const before = ownerByNodeId.get(dependency.beforeNodeId);
    const after = ownerByNodeId.get(dependency.afterNodeId);
    if (before && after && before !== after) partitions.get(after)?.dependencyWorkUnitIds.add(before);
  }
}

function applyWriteConflicts(partitions: Map<string, MutablePartition>, nodeById: Map<string, GraphNode>): void {
  const leaves = [...partitions.values()].filter((partition) => partition.kind === "leaf").sort((left, right) => left.id.localeCompare(right.id));
  for (let leftIndex = 0; leftIndex < leaves.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < leaves.length; rightIndex += 1) {
      const left = leaves[leftIndex];
      const right = leaves[rightIndex];
      const conflicts = left.ownedNodeIds.some((leftId) => right.ownedNodeIds.some((rightId) => writeScopesConflict(nodeById.get(leftId)!, nodeById.get(rightId)!)));
      if (conflicts) right.dependencyWorkUnitIds.add(left.id);
    }
  }
}

function resolveDependencySccs(
  input: GraphPartitionInput,
  partitions: Map<string, MutablePartition>,
  ownerByNodeId: Map<string, string>,
  resolutions: PartitionSccResolution[]
): void {
  const components = stronglyConnectedComponents(partitions).filter((component) => component.length > 1);
  for (const members of components.sort((left, right) => left[0].localeCompare(right[0]))) {
    const memberSet = new Set(members);
    const memberPartitions = members.map((id) => partitions.get(id)!).filter(Boolean);
    const totalTokens = memberPartitions.reduce((total, partition) => total + partition.estimatedTokens, 0);
    const separatedPairs = new Set(input.constraints.separateNodePairs.flatMap(([left, right]) => [`${left}\0${right}`, `${right}\0${left}`]));
    const separatedByPolicy = memberPartitions.some((left) =>
      memberPartitions.some(
        (right) => left.id !== right.id && left.ownedNodeIds.some((leftId) => right.ownedNodeIds.some((rightId) => separatedPairs.has(`${leftId}\0${rightId}`)))
      )
    );
    if (memberPartitions.every((partition) => partition.kind === "leaf") && !separatedByPolicy && totalTokens <= input.budgets.mediumPartitionTokenLimit) {
      const ownedNodeIds = memberPartitions.flatMap((partition) => partition.ownedNodeIds).sort();
      const mergedId = stableUnitId(input, "scc", ownedNodeIds);
      const selectedScale = scaleForEstimatedTokens(totalTokens, input.budgets);
      const merged: MutablePartition = {
        id: mergedId,
        kind: "leaf",
        title: memberPartitions.map((partition) => partition.title).sort().join(" + "),
        objective: `Implement a cyclically coupled partition: ${input.task}`,
        ownedNodeIds,
        parentWorkUnitId: commonParent(memberPartitions, memberSet),
        dependencyWorkUnitIds: new Set(memberPartitions.flatMap((partition) => [...partition.dependencyWorkUnitIds]).filter((id) => !memberSet.has(id))),
        coordinationWorkUnitIds: new Set(memberPartitions.flatMap((partition) => [...partition.coordinationWorkUnitIds]).filter((id) => !memberSet.has(id))),
        estimatedTokens: totalTokens,
        recommendedScale: selectedScale,
        selectedScale,
        routingReason: "Strongly connected dependency units were merged within the configured medium budget.",
        contextBudget: input.budgets.contextBudgets[selectedScale]
      };
      for (const member of members) partitions.delete(member);
      replacePartitionReferences(partitions, memberSet, mergedId);
      partitions.set(mergedId, merged);
      for (const nodeId of ownedNodeIds) ownerByNodeId.set(nodeId, mergedId);
      resolutions.push({ memberWorkUnitIds: [...members].sort(), resolution: "merged", integrationWorkUnitId: null });
    } else {
      const integrationId = stableUnitId(input, "scc-integration", members);
      const integrationParentId = commonParent(memberPartitions, memberSet);
      for (const partition of memberPartitions) {
        for (const member of members) {
          partition.dependencyWorkUnitIds.delete(member);
          if (member !== partition.id) partition.coordinationWorkUnitIds.add(member);
        }
        partition.parentWorkUnitId = integrationId;
      }
      for (const partition of partitions.values()) {
        if (memberSet.has(partition.id)) continue;
        if ([...partition.dependencyWorkUnitIds].some((dependencyId) => memberSet.has(dependencyId))) {
          for (const member of members) partition.dependencyWorkUnitIds.delete(member);
          partition.dependencyWorkUnitIds.add(integrationId);
        }
      }
      partitions.set(integrationId, {
        id: integrationId,
        kind: "integration",
        title: "Cyclic contract integration",
        objective: `Reconcile coordinated proposals for an oversized dependency cycle: ${input.task}`,
        ownedNodeIds: [],
        parentWorkUnitId: integrationParentId,
        dependencyWorkUnitIds: new Set(members),
        coordinationWorkUnitIds: new Set(),
        estimatedTokens: Math.min(input.budgets.mediumPartitionTokenLimit, Math.max(1024, Math.ceil(totalTokens * 0.25))),
        recommendedScale: "large",
        selectedScale: "large",
        routingReason: "Oversized SCC requires a bounded integration unit after coordinated child proposals.",
        contextBudget: input.budgets.contextBudgets.large
      });
      resolutions.push({ memberWorkUnitIds: [...members].sort(), resolution: "coordinated_integration", integrationWorkUnitId: integrationId });
    }
  }
}

function replacePartitionReferences(partitions: Map<string, MutablePartition>, oldIds: Set<string>, newId: string): void {
  for (const partition of partitions.values()) {
    if ([...partition.dependencyWorkUnitIds].some((id) => oldIds.has(id))) {
      for (const id of oldIds) partition.dependencyWorkUnitIds.delete(id);
      if (partition.id !== newId) partition.dependencyWorkUnitIds.add(newId);
    }
    if ([...partition.coordinationWorkUnitIds].some((id) => oldIds.has(id))) {
      for (const id of oldIds) partition.coordinationWorkUnitIds.delete(id);
      if (partition.id !== newId) partition.coordinationWorkUnitIds.add(newId);
    }
    if (partition.parentWorkUnitId && oldIds.has(partition.parentWorkUnitId)) partition.parentWorkUnitId = newId;
  }
}

function buildBoundaryArtifacts(
  input: GraphPartitionInput,
  subgraph: TaskSubgraph,
  partitions: Map<string, MutablePartition>,
  ownerByNodeId: Map<string, string>,
  classifications: ClassifiedPartitionEdge[],
  nodeById: Map<string, GraphNode>
): {
  contracts: InterfaceContract[];
  ignoredEdges: IgnoredPartitionEdge[];
  boundaryEdges: CodingWorkflowOrchestration["boundaryEdges"];
  boundaryEdgeIdsByUnit: Map<string, Set<string>>;
  haloNodeIdsByUnit: Map<string, Set<string>>;
} {
  const approvedIgnoreByEdgeId = new Map(input.constraints.approvedIgnoredEdges.map((ignored) => [ignored.edgeId, ignored]));
  const edgeById = new Map(subgraph.edges.map((edge) => [edge.id, edge]));
  const boundaryEdges: CodingWorkflowOrchestration["boundaryEdges"] = [];
  const contracts: InterfaceContract[] = [];
  const ignoredEdges: IgnoredPartitionEdge[] = [];
  const boundaryEdgeIdsByUnit = new Map<string, Set<string>>();
  const haloNodeIdsByUnit = new Map<string, Set<string>>();
  for (const classification of classifications.filter((candidate) => candidate.cut)) {
    const edge = edgeById.get(classification.edgeId)!;
    boundaryEdges.push({ id: edge.id, sourceNodeId: edge.sourceNodeId, targetNodeId: edge.targetNodeId, kind: edge.kind });
    for (const [unitId, otherNodeId] of [
      [classification.sourceWorkUnitId, edge.targetNodeId],
      [classification.targetWorkUnitId, edge.sourceNodeId]
    ] as const) {
      if (!unitId || !partitions.has(unitId)) continue;
      addToSetMap(boundaryEdgeIdsByUnit, unitId, edge.id);
      const halo = haloNodeIdsByUnit.get(unitId) ?? new Set<string>();
      if (!partitions.get(unitId)!.ownedNodeIds.includes(otherNodeId) && halo.size < input.budgets.maxHaloNodesPerUnit) halo.add(otherNodeId);
      haloNodeIdsByUnit.set(unitId, halo);
    }
    const approved = approvedIgnoreByEdgeId.get(edge.id);
    const hasExternalEndpoint = !classification.sourceWorkUnitId || !classification.targetWorkUnitId;
    const informationalIgnored = input.policy.informationalIgnoreKinds.includes(edge.kind) || classification.classification === "informational";
    if (approved || hasExternalEndpoint || informationalIgnored) {
      ignoredEdges.push({
        id: `ignored-${stableHash(`${input.workflowId}:${edge.id}`)}`,
        edgeId: edge.id,
        classification: classification.classification,
        reason:
          approved?.reason ??
          (hasExternalEndpoint
            ? "One edge endpoint is outside scoped task ownership and is retained only as read-halo evidence."
            : `${edge.kind} is policy-approved informational evidence rather than an interface contract.`),
        approvedBy: approved?.approvedBy ?? "policy",
        approvalReference: approved?.approvalReference ?? `${input.policy.version}:${edge.kind}`
      });
      continue;
    }
    const sourceUnit = classification.sourceWorkUnitId!;
    const targetUnit = classification.targetWorkUnitId!;
    const producerFirst = ["flows", "describes_format"].includes(edge.kind);
    const producerWorkUnitId = producerFirst ? sourceUnit : targetUnit;
    const consumerWorkUnitId = producerFirst ? targetUnit : sourceUnit;
    contracts.push({
      id: `contract-${stableHash(`${input.workflowId}:${edge.id}:${producerWorkUnitId}:${consumerWorkUnitId}`)}`,
      workflowId: input.workflowId,
      edgeId: edge.id,
      edgeKind: edge.kind,
      producerWorkUnitId,
      consumerWorkUnitId,
      direction: edge.pointingDirection === "bidirectional" ? "bidirectional" : "producer_to_consumer",
      subjectNodeIds: [edge.sourceNodeId, edge.targetNodeId].sort(),
      contractKind: classification.contractKind ?? DEFAULT_EDGE_RULES[edge.kind].contractKind ?? "other",
      baseline: {
        formatVersion: 1,
        summary: edge.label ?? `${edge.kind} relationship from ${edge.sourceNodeId} to ${edge.targetNodeId}.`,
        normalizedValue: stableSerialize({ kind: edge.kind, sourceNodeId: edge.sourceNodeId, targetNodeId: edge.targetNodeId, label: edge.label }),
        fingerprint: stableHash(stableSerialize(edge)),
        metadata: { classification: classification.classification, reason: classification.reason }
      },
      proposed: null,
      status: "stable",
      evidence: contractEvidence(edge, nodeById)
    });
  }
  return {
    contracts: contracts.sort((left, right) => left.id.localeCompare(right.id)),
    ignoredEdges: ignoredEdges.sort((left, right) => left.edgeId.localeCompare(right.edgeId)),
    boundaryEdges: boundaryEdges.sort((left, right) => left.id.localeCompare(right.id)),
    boundaryEdgeIdsByUnit,
    haloNodeIdsByUnit
  };
}

function contractEvidence(edge: GraphEdge, nodeById: Map<string, GraphNode>): SourceEvidenceRef[] {
  const sourcePath = normalizeWorkspacePath(edge.source.path ?? nodeById.get(edge.sourceNodeId)?.source.path ?? nodeById.get(edge.sourceNodeId)?.code.directory ?? null);
  if (!sourcePath) return [];
  const startLine = edge.source.startLine ?? nodeById.get(edge.sourceNodeId)?.source.startLine ?? null;
  const endLine = edge.source.endLine ?? nodeById.get(edge.sourceNodeId)?.source.endLine ?? null;
  const validRange = startLine !== null && endLine !== null && startLine > 0 && endLine >= startLine;
  return [
    {
      path: sourcePath,
      startLine: validRange ? startLine : null,
      endLine: validRange ? endLine : null,
      symbolId: edge.sourceNodeId,
      origin: edge.source.path ? "graph" : "source",
      fingerprint: stableHash(stableSerialize({ edgeId: edge.id, sourcePath, startLine, endLine }))
    }
  ];
}

function stronglyConnectedComponents(partitions: Map<string, MutablePartition>): string[][] {
  let index = 0;
  const indexById = new Map<string, number>();
  const lowLinkById = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  const visit = (id: string): void => {
    indexById.set(id, index);
    lowLinkById.set(id, index);
    index += 1;
    stack.push(id);
    onStack.add(id);
    for (const dependencyId of [...(partitions.get(id)?.dependencyWorkUnitIds ?? [])].sort()) {
      if (!partitions.has(dependencyId)) continue;
      if (!indexById.has(dependencyId)) {
        visit(dependencyId);
        lowLinkById.set(id, Math.min(lowLinkById.get(id)!, lowLinkById.get(dependencyId)!));
      } else if (onStack.has(dependencyId)) {
        lowLinkById.set(id, Math.min(lowLinkById.get(id)!, indexById.get(dependencyId)!));
      }
    }
    if (lowLinkById.get(id) === indexById.get(id)) {
      const component: string[] = [];
      while (stack.length > 0) {
        const member = stack.pop()!;
        onStack.delete(member);
        component.push(member);
        if (member === id) break;
      }
      components.push(component.sort());
    }
  };
  for (const id of [...partitions.keys()].sort()) if (!indexById.has(id)) visit(id);
  return components;
}

function computeDependencyLayers(partitions: Map<string, MutablePartition>): Map<string, number> {
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const layerFor = (id: string): number => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) throw new Error(`Dependency cycle remains after SCC handling at ${id}.`);
    visiting.add(id);
    const dependencies = [...(partitions.get(id)?.dependencyWorkUnitIds ?? [])].filter((dependencyId) => partitions.has(dependencyId));
    const layer = dependencies.length === 0 ? 0 : Math.max(...dependencies.map(layerFor)) + 1;
    visiting.delete(id);
    memo.set(id, layer);
    return layer;
  };
  for (const id of partitions.keys()) layerFor(id);
  return memo;
}

function sourceWriteScopeForNode(node: GraphNode): SourceWriteScope | null {
  const sourcePath = normalizeWorkspacePath(node.source.path ?? node.code.directory);
  if (!sourcePath) return null;
  const startLine = node.source.startLine ?? node.code.startLine;
  const endLine = node.source.endLine ?? node.code.endLine;
  const validRange = startLine !== null && endLine !== null && startLine > 0 && endLine >= startLine;
  return { path: sourcePath, startLine: validRange ? startLine : null, endLine: validRange ? endLine : null, symbolId: node.id, permission: "edit" };
}

function writeScopesConflict(left: GraphNode, right: GraphNode): boolean {
  const leftPath = sourcePathForNode(left);
  const rightPath = sourcePathForNode(right);
  if (!leftPath || leftPath !== rightPath) return false;
  const leftStart = left.source.startLine ?? left.code.startLine;
  const leftEnd = left.source.endLine ?? left.code.endLine;
  const rightStart = right.source.startLine ?? right.code.startLine;
  const rightEnd = right.source.endLine ?? right.code.endLine;
  if (leftStart === null || leftEnd === null || rightStart === null || rightEnd === null) return true;
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

function estimateNodeTokens(node: GraphNode): number {
  const startLine = node.source.startLine ?? node.code.startLine;
  const endLine = node.source.endLine ?? node.code.endLine;
  return startLine !== null && endLine !== null && endLine >= startLine ? Math.max(64, (endLine - startLine + 1) * 12) : 256;
}

function sourcePathForNode(node: GraphNode): string | null {
  return normalizeWorkspacePath(node.source.path ?? node.code.directory);
}

function normalizeWorkspacePath(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  return workspaceRelativePathSchema.safeParse(normalized).success ? normalized : null;
}

function commonOwnershipAnchor(nodeIds: string[], nodeById: Map<string, GraphNode>): string | null {
  const paths = nodeIds.map((nodeId) => containmentAncestors(nodeId, nodeById));
  return paths[0]?.find((candidate) => paths.every((path) => path.includes(candidate))) ?? null;
}

function containmentAncestors(nodeId: string, nodeById: Map<string, GraphNode>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  let current = nodeById.get(nodeId);
  while (current) {
    const parentId = current.attachedToId ?? current.parentId;
    if (!parentId || seen.has(parentId)) break;
    result.push(parentId);
    seen.add(parentId);
    current = nodeById.get(parentId);
  }
  return result;
}

function isDescendantOf(nodeId: string, ancestorId: string, nodeById: Map<string, GraphNode>): boolean {
  return containmentAncestors(nodeId, nodeById).includes(ancestorId);
}

function commonParent(partitions: MutablePartition[], excluded: Set<string>): string | null {
  const candidates = partitions
    .map((partition) => partition.parentWorkUnitId)
    .filter((value): value is string => value !== null && !excluded.has(value));
  return candidates.length > 0 && candidates.every((candidate) => candidate === candidates[0]) ? candidates[0] : null;
}

function stableUnitId(input: GraphPartitionInput, kind: string, members: string[]): string {
  return `work-unit-${stableHash(stableSerialize({ workflowId: input.workflowId, revision: revisionIdentity(input.revision), policy: input.policy.version, kind, members: [...members].sort() }))}`;
}

function partitionInputHash(input: GraphPartitionInput): string {
  return stableHash(
    stableSerialize({
      projectId: input.projectId,
      revision: revisionIdentity(input.revision),
      indexState: input.indexState,
      scopeNodeId: input.scopeNodeId,
      targetNodeIds: [...input.targetNodeIds].sort(),
      targetHints: [...input.targetHints].sort((left, right) => left.nodeId.localeCompare(right.nodeId)),
      task: input.task,
      maximumConcurrency: input.maximumConcurrency,
      budgets: input.budgets,
      policy: input.policy,
      constraints: input.constraints,
      nodes: input.nodes.map((node) => ({ id: node.id, parentId: node.parentId, attachedToId: node.attachedToId, source: node.source })).sort((a, b) => a.id.localeCompare(b.id)),
      edges: input.edges.map((edge) => ({ id: edge.id, kind: edge.kind, sourceNodeId: edge.sourceNodeId, targetNodeId: edge.targetNodeId })).sort((a, b) => a.id.localeCompare(b.id))
    })
  );
}

function revisionIdentity(revision: GraphPartitionInput["revision"]) {
  return {
    indexRevision: revision.indexRevision,
    workspaceRevision: revision.workspaceRevision,
    graphRevision: revision.graphRevision,
    sourceHashes: revision.sourceHashes,
    contextCompilerVersion: revision.contextCompilerVersion,
    routingFeatureVersion: revision.routingFeatureVersion
  };
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

function isScale(value: unknown): value is "small" | "medium" | "large" {
  return value === "small" || value === "medium" || value === "large";
}

function maxScale(scales: Array<"small" | "medium" | "large">): "small" | "medium" | "large" {
  return scales.includes("large") ? "large" : scales.includes("medium") ? "medium" : "small";
}

function overrideForNodeIds(
  nodeIds: string[],
  targetHints: Map<string, PartitionTargetHint>
): { selectedScale: "small" | "medium" | "large"; actor: "user" | "policy"; reason: string } | null {
  const overrides = nodeIds
    .map((nodeId) => targetHints.get(nodeId))
    .filter((hint): hint is PartitionTargetHint => Boolean(hint?.override));
  if (overrides.length === 0) return null;
  return {
    selectedScale: maxScale(overrides.map((hint) => hint.selectedScale)),
    actor: overrides.some((hint) => hint.override?.actor === "user") ? "user" : "policy",
    reason: [...new Set(overrides.map((hint) => hint.override!.reason))].sort().join(" ")
  };
}

function addToSetMap(map: Map<string, Set<string>>, key: string, value: string): void {
  const values = map.get(key) ?? new Set<string>();
  values.add(value);
  map.set(key, values);
}

function countCrossFileBoundaryEdges(
  workUnitId: string,
  classifications: ClassifiedPartitionEdge[],
  edges: GraphEdge[],
  nodeById: Map<string, GraphNode>
): number {
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
  return classifications.filter((classification) => {
    if (!classification.cut || (classification.sourceWorkUnitId !== workUnitId && classification.targetWorkUnitId !== workUnitId)) return false;
    const edge = edgeById.get(classification.edgeId);
    if (!edge) return false;
    const sourcePath = sourcePathForNode(nodeById.get(edge.sourceNodeId)!);
    const targetPath = sourcePathForNode(nodeById.get(edge.targetNodeId)!);
    return Boolean(sourcePath && targetPath && sourcePath !== targetPath);
  }).length;
}

function countCrossPackageBoundaryEdges(
  workUnitId: string,
  classifications: ClassifiedPartitionEdge[],
  edges: GraphEdge[],
  nodeById: Map<string, GraphNode>
): number {
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
  return classifications.filter((classification) => {
    if (
      !classification.cut ||
      classification.sourceWorkUnitId === null ||
      classification.targetWorkUnitId === null ||
      (classification.sourceWorkUnitId !== workUnitId && classification.targetWorkUnitId !== workUnitId)
    ) {
      return false;
    }
    const edge = edgeById.get(classification.edgeId);
    if (!edge) return false;
    const sourcePackage = nearestPackageOwner(edge.sourceNodeId, nodeById);
    const targetPackage = nearestPackageOwner(edge.targetNodeId, nodeById);
    return Boolean(sourcePackage && targetPackage && sourcePackage !== targetPackage);
  }).length;
}

function nearestPackageOwner(nodeId: string, nodeById: Map<string, GraphNode>): string | null {
  const candidates = [nodeId, ...containmentAncestors(nodeId, nodeById)];
  return (
    candidates.find((candidateId) => {
      const kind = nodeById.get(candidateId)?.kind;
      return kind === "module" || kind === "website" || kind === "framework";
    }) ?? null
  );
}
