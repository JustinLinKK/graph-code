import {
  compileWorkUnitContext,
  validateWorkUnitContextRetrievalRequest,
  type WorkUnitContext,
  type WorkUnitContextCompilerInput,
  type WorkUnitContextRetrievalRequest,
  type WorkUnitSourceReader
} from "@graphcode/agent-runtime";
import type {
  AgentScale,
  BlockExecutionMetadata,
  CodingWorkflow,
  ContextBudget,
  GraphEdge,
  GraphNode,
  RoutingFeatures,
  WorkflowRevision
} from "@graphcode/graph-model";

export type ScopedWorkUnitContextRepository = {
  getCodingWorkflow(workflowId: string): CodingWorkflow;
  getNode(nodeId: string): GraphNode;
  getEdge(edgeId: string): GraphEdge;
  resolveExecutionMetadata(nodeId: string): BlockExecutionMetadata;
};

export type CompileStoredWorkUnitContextInput = {
  repository: ScopedWorkUnitContextRepository;
  projectId: string;
  workflowId: string;
  workUnitId: string;
  task: string;
  observedRevision: WorkflowRevision;
  indexState: RoutingFeatures["indexState"];
  readSource: WorkUnitSourceReader;
  compiledAt?: string;
  additionalReadNodeIds?: string[];
  scaleOverride?: { scale: AgentScale; contextBudget: ContextBudget };
};

export async function compileStoredWorkUnitContext(input: CompileStoredWorkUnitContextInput): Promise<WorkUnitContext> {
  const workflow = input.repository.getCodingWorkflow(input.workflowId);
  if (workflow.projectId !== input.projectId) throw new Error("Coding workflow does not belong to the requested project.");
  if (!workflow.orchestration) throw new Error("Coding workflow has no work-unit orchestration to compile.");
  const orchestration = structuredClone(workflow.orchestration);
  const workUnit = orchestration.workUnits.find((candidate) => candidate.id === input.workUnitId);
  if (!workUnit) throw new Error(`Coding workflow has no work unit ${input.workUnitId}.`);
  if (input.scaleOverride) {
    workUnit.selectedScale = input.scaleOverride.scale;
    workUnit.contextBudget = input.scaleOverride.contextBudget;
    const decision = orchestration.routingDecisions.find((candidate) => candidate.workUnitId === workUnit.id);
    if (decision) decision.selectedScale = input.scaleOverride.scale;
  }
  workUnit.readHaloNodeIds = [...new Set([...workUnit.readHaloNodeIds, ...(input.additionalReadNodeIds ?? [])])].filter(
    (nodeId) => !workUnit.ownedNodeIds.includes(nodeId)
  );

  const edgeIds = new Set<string>(workUnit.boundaryEdgeIds);
  for (const classification of orchestration.partitioning?.edgeClassifications ?? []) {
    if (classification.sourceWorkUnitId === workUnit.id || classification.targetWorkUnitId === workUnit.id) edgeIds.add(classification.edgeId);
  }
  const scopedEdges = [...edgeIds]
    .sort()
    .map((edgeId) => safely(() => input.repository.getEdge(edgeId)))
    .filter((edge): edge is GraphEdge => Boolean(edge));
  const nodeIds = new Set<string>([...workUnit.ownedNodeIds, ...workUnit.readHaloNodeIds]);
  for (const edge of scopedEdges) {
    nodeIds.add(edge.sourceNodeId);
    nodeIds.add(edge.targetNodeId);
  }
  for (const contract of orchestration.interfaceContracts) {
    if (contract.producerWorkUnitId === workUnit.id || contract.consumerWorkUnitId === workUnit.id) {
      for (const nodeId of contract.subjectNodeIds) nodeIds.add(nodeId);
    }
  }
  const scopedNodes = [...nodeIds]
    .sort()
    .map((nodeId) => safely(() => input.repository.getNode(nodeId)))
    .filter((node): node is GraphNode => Boolean(node));

  const compilerInput: WorkUnitContextCompilerInput = {
    orchestration,
    workUnitId: workUnit.id,
    task: input.task,
    scopedNodes,
    scopedEdges,
    observedRevision: input.observedRevision,
    indexState: input.indexState,
    readSource: input.readSource,
    resolveExecutionMetadata: async (nodeId) => safely(() => input.repository.resolveExecutionMetadata(nodeId)),
    compiledAt: input.compiledAt,
    followUpReadNodeIds: input.additionalReadNodeIds
  };
  return compileWorkUnitContext(compilerInput);
}

export async function expandStoredWorkUnitContext(
  input: CompileStoredWorkUnitContextInput & { request: WorkUnitContextRetrievalRequest }
): Promise<{ base: WorkUnitContext; expanded: WorkUnitContext; request: WorkUnitContextRetrievalRequest }> {
  const base = await compileStoredWorkUnitContext(input);
  const request = validateWorkUnitContextRetrievalRequest(base, input.request);
  const expanded = await compileStoredWorkUnitContext({
    ...input,
    additionalReadNodeIds: [...new Set([...(input.additionalReadNodeIds ?? []), ...request.requestedNodeIds])]
  });
  const deltas = {
    maxInputTokens: Math.max(0, expanded.tokenUsage.estimatedInputTokens - base.tokenUsage.estimatedInputTokens),
    maxSourceTokens: Math.max(0, expanded.tokenUsage.sourceTokens - base.tokenUsage.sourceTokens),
    maxGraphTokens: Math.max(0, expanded.tokenUsage.graphTokens - base.tokenUsage.graphTokens),
    maxContractTokens: Math.max(0, expanded.tokenUsage.contractTokens - base.tokenUsage.contractTokens),
    maxFiles: Math.max(
      0,
      new Set(expanded.sources.filter((source) => source.availability === "present").map((source) => source.path)).size -
        new Set(base.sources.filter((source) => source.availability === "present").map((source) => source.path)).size
    ),
    maxNodes: Math.max(0, expanded.nodes.length - base.nodes.length),
    maxEdges: Math.max(0, expanded.edges.length - base.edges.length)
  };
  for (const key of Object.keys(deltas) as Array<keyof typeof deltas>) {
    if (deltas[key] > request.remainingBudget[key]) {
      throw new RangeError(
        `Expanded retrieval ${request.requestId} consumed ${key}=${deltas[key]}, exceeding its declared remaining budget ${request.remainingBudget[key]}.`
      );
    }
  }
  for (const requestedSource of request.requestedSources) {
    const represented = expanded.sources.some(
      (source) =>
        source.path === requestedSource.path &&
        (requestedSource.startLine === null ||
          (source.startLine !== null &&
            source.endLine !== null &&
            source.startLine <= requestedSource.startLine &&
            source.endLine >= requestedSource.endLine!))
    );
    if (!represented) {
      throw new Error(
        `Expanded retrieval ${request.requestId} cannot resolve requested source ${requestedSource.path} from the explicitly requested graph nodes.`
      );
    }
  }
  return { base, expanded, request };
}

function safely<T>(read: () => T): T | null {
  try {
    return read();
  } catch {
    return null;
  }
}
