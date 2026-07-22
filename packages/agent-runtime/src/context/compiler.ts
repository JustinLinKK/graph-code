import { createHash } from "node:crypto";
import {
  codingWorkflowOrchestrationSchema,
  workflowRevisionSchema,
  workspaceRelativePathSchema,
  type BlockExecutionMetadata,
  type CodingWorkflowOrchestration,
  type GraphEdge,
  type GraphNode,
  type RoutingFeatures,
  type WorkflowRevision
} from "@graphcode/graph-model";
import {
  WORK_UNIT_CONTEXT_COMPILER_VERSION,
  WORK_UNIT_CONTEXT_SELECTION_POLICY_VERSION,
  workUnitContextSchema,
  type UpstreamAcceptedSummary,
  type WorkUnitContext,
  type WorkUnitContextEdge,
  type WorkUnitContextNode,
  type WorkUnitContextOmission,
  type WorkUnitExecutionContext,
  type WorkUnitSourceExcerpt
} from "./contracts";
import { estimateRenderedWorkUnitContextTokens, estimateTextTokens } from "./render";

const RENDERING_RESERVE_TOKENS = 512;

export class WorkUnitContextBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkUnitContextBudgetError";
  }
}

export type WorkUnitSourceReader = (workspaceRelativePath: string) => Promise<string | null>;

export type WorkUnitContextCompilerInput = {
  orchestration: CodingWorkflowOrchestration;
  workUnitId: string;
  task: string;
  scopedNodes: GraphNode[];
  scopedEdges: GraphEdge[];
  observedRevision: WorkflowRevision;
  indexState: RoutingFeatures["indexState"];
  readSource: WorkUnitSourceReader;
  resolveExecutionMetadata?: (nodeId: string) => Promise<BlockExecutionMetadata | null>;
  upstreamAccepted?: Array<Omit<UpstreamAcceptedSummary, "estimatedTokens">>;
  architectureSummary?: string | null;
  compiledAt?: string;
  followUpReadNodeIds?: string[];
};

export async function compileWorkUnitContext(input: WorkUnitContextCompilerInput): Promise<WorkUnitContext> {
  const orchestration = codingWorkflowOrchestrationSchema.parse(input.orchestration);
  const observedRevision = workflowRevisionSchema.parse(input.observedRevision);
  const workUnit = orchestration.workUnits.find((candidate) => candidate.id === input.workUnitId);
  if (!workUnit) throw new Error(`Cannot compile missing work unit ${input.workUnitId}.`);
  const nodeById = new Map(input.scopedNodes.map((node) => [node.id, node]));
  const edgeById = new Map(input.scopedEdges.map((edge) => [edge.id, edge]));
  const omissions: WorkUnitContextOmission[] = [];
  const followUpReadNodeIds = new Set(input.followUpReadNodeIds ?? []);
  const warnings = revisionWarnings(workUnit.baseRevision, observedRevision, input.indexState);
  const requiredOwnedNodes = workUnit.ownedNodeIds.map((nodeId) => {
    const node = nodeById.get(nodeId);
    if (!node) throw new Error(`Scoped context input is missing owned node ${nodeId}.`);
    return node;
  });
  if (requiredOwnedNodes.length > workUnit.contextBudget.maxNodes) {
    throw new WorkUnitContextBudgetError(
      `Owned nodes require ${requiredOwnedNodes.length} graph slots, exceeding maxNodes=${workUnit.contextBudget.maxNodes}.`
    );
  }

  const nodes: WorkUnitContextNode[] = requiredOwnedNodes.map((node) => contextNode(node, "owned", "The work unit owns this target symbol."));
  ensureRequiredBudget("owned graph", sumTokens(nodes), workUnit.contextBudget.maxGraphTokens);
  const selectedNodeIds = new Set(nodes.map((node) => node.nodeId));
  const roughFixedTokens = estimateValueTokens({
    workUnit,
    task: input.task,
    objective: workUnit.objective,
    revision: { base: workUnit.baseRevision, observed: observedRevision, indexState: input.indexState, warnings },
    outputRequirements: workUnit.expectedOutputs
  });
  const canAdmitInputTokens = (tokens: number): boolean =>
    roughFixedTokens + sumTokens(nodes) + tokens + RENDERING_RESERVE_TOKENS <= workUnit.contextBudget.maxInputTokens;

  const haloCandidates = workUnit.readHaloNodeIds
    .map((nodeId) => nodeById.get(nodeId))
    .filter((node): node is GraphNode => Boolean(node))
    .sort((left, right) => Number(isTestPath(sourcePathForNode(right))) - Number(isTestPath(sourcePathForNode(left))) || left.id.localeCompare(right.id));
  for (const node of haloCandidates) {
    const role = isTestPath(sourcePathForNode(node)) ? "test" : "halo";
    const candidate = contextNode(
      node,
      role,
      role === "test" ? "Directly related test evidence is prioritized for validation." : "One-hop boundary evidence explains a neighboring contract without granting write authority."
    );
    if (
      nodes.length >= workUnit.contextBudget.maxNodes ||
      sumTokens(nodes) + candidate.estimatedTokens > workUnit.contextBudget.maxGraphTokens ||
      !canAdmitInputTokens(candidate.estimatedTokens)
    ) {
      omissions.push({
        entityType: "node",
        entityId: node.id,
        reason: "budget",
        required: false,
        detail: "Read-only halo node exceeded the work-unit graph or total-input budget."
      });
      continue;
    }
    nodes.push(candidate);
    selectedNodeIds.add(node.id);
  }
  for (const missingHaloId of workUnit.readHaloNodeIds.filter((nodeId) => !nodeById.has(nodeId))) {
    omissions.push({ entityType: "node", entityId: missingHaloId, reason: "unavailable", required: false, detail: "Read-halo node was unavailable in the scoped graph input." });
  }

  const edges: WorkUnitContextEdge[] = [];
  const requiredBoundaryIds = new Set(workUnit.boundaryEdgeIds);
  for (const edgeId of [...requiredBoundaryIds].sort()) {
    const edge = edgeById.get(edgeId);
    if (!edge) {
      omissions.push({ entityType: "edge", entityId: edgeId, reason: "unavailable", required: true, detail: "Required boundary edge was unavailable in the scoped graph input." });
      continue;
    }
    const candidate = contextEdge(edge, "boundary", "Cut-edge evidence defines a contract or approved boundary reason for this work unit.");
    ensureRequiredBudget("boundary graph", sumTokens(edges) + candidate.estimatedTokens + sumTokens(nodes), workUnit.contextBudget.maxGraphTokens);
    edges.push(candidate);
  }
  for (const edge of [...input.scopedEdges].sort((left, right) => left.id.localeCompare(right.id))) {
    if (requiredBoundaryIds.has(edge.id) || !selectedNodeIds.has(edge.sourceNodeId) || !selectedNodeIds.has(edge.targetNodeId)) continue;
    const bothOwned = workUnit.ownedNodeIds.includes(edge.sourceNodeId) && workUnit.ownedNodeIds.includes(edge.targetNodeId);
    const candidate = contextEdge(
      edge,
      bothOwned ? "internal" : "evidence",
      bothOwned ? "Internal relationship connects two symbols owned by this work unit." : "Scoped relationship supplies read-only evidence between selected nodes."
    );
    if (
      edges.length >= workUnit.contextBudget.maxEdges ||
      sumTokens(nodes) + sumTokens(edges) + candidate.estimatedTokens > workUnit.contextBudget.maxGraphTokens ||
      !canAdmitInputTokens(sumTokens(edges) + candidate.estimatedTokens)
    ) {
      omissions.push({ entityType: "edge", entityId: edge.id, reason: "budget", required: false, detail: "Optional relationship evidence exceeded the graph or input budget." });
      continue;
    }
    edges.push(candidate);
  }
  if (edges.length > workUnit.contextBudget.maxEdges) {
    throw new WorkUnitContextBudgetError(`Required boundary edges exceed maxEdges=${workUnit.contextBudget.maxEdges}.`);
  }

  const contracts = orchestration.interfaceContracts
    .filter((contract) => contract.producerWorkUnitId === workUnit.id || contract.consumerWorkUnitId === workUnit.id)
    .sort((left, right) => left.id.localeCompare(right.id));
  ensureRequiredBudget("interface contracts", estimateValueTokens(contracts), workUnit.contextBudget.maxContractTokens);

  const upstreamById = new Map((input.upstreamAccepted ?? []).map((summary) => [summary.workUnitId, summary]));
  const upstreamAccepted: UpstreamAcceptedSummary[] = [];
  for (const dependencyId of workUnit.dependencyWorkUnitIds) {
    const summary = upstreamById.get(dependencyId);
    if (!summary) {
      omissions.push({
        entityType: "dependency",
        entityId: dependencyId,
        reason: "unavailable",
        required: true,
        detail: "Accepted upstream proposal summary is not yet available; dispatch readiness must remain blocked."
      });
      continue;
    }
    upstreamAccepted.push({ ...summary, estimatedTokens: estimateValueTokens(summary) });
  }

  const sourceCache = new Map<string, Promise<string | null>>();
  let sourceReads = 0;
  const readSource = (sourcePath: string): Promise<string | null> => {
    let pending = sourceCache.get(sourcePath);
    if (!pending) {
      sourceReads += 1;
      pending = input.readSource(sourcePath).catch(() => null);
      sourceCache.set(sourcePath, pending);
    }
    return pending;
  };
  const sources: WorkUnitSourceExcerpt[] = [];
  for (const node of requiredOwnedNodes) {
    const compiled = await compileSourceExcerpt(node, "owned", true, workUnit.baseRevision, observedRevision, readSource);
    if (compiled.excerpt) sources.push(compiled.excerpt);
    if (compiled.omission) omissions.push(compiled.omission);
  }
  const requiredSourceFiles = new Set(sources.map((source) => source.path));
  if (requiredSourceFiles.size > workUnit.contextBudget.maxFiles) {
    throw new WorkUnitContextBudgetError(`Owned source requires ${requiredSourceFiles.size} files, exceeding maxFiles=${workUnit.contextBudget.maxFiles}.`);
  }
  ensureRequiredBudget("owned source", sumTokens(sources), workUnit.contextBudget.maxSourceTokens);

  for (const node of haloCandidates.filter((candidate) => selectedNodeIds.has(candidate.id))) {
    const sourcePath = sourcePathForNode(node);
    const role = isTestPath(sourcePath) ? "test" : "halo";
    if (workUnit.selectedScale === "small" && role === "halo" && !followUpReadNodeIds.has(node.id)) {
      omissions.push({ entityType: "source", entityId: node.id, reason: "scale_policy", required: false, detail: "Small-tier context keeps halo summaries but omits neighboring source bodies." });
      continue;
    }
    const compiled = await compileSourceExcerpt(node, role, false, workUnit.baseRevision, observedRevision, readSource);
    if (!compiled.excerpt) {
      if (compiled.omission) omissions.push(compiled.omission);
      continue;
    }
    const nextFiles = new Set([...sources.filter((source) => source.availability === "present").map((source) => source.path), compiled.excerpt.path]);
    const nextTokens = sumTokens(sources) + compiled.excerpt.estimatedTokens;
    if (
      nextFiles.size > workUnit.contextBudget.maxFiles ||
      nextTokens > workUnit.contextBudget.maxSourceTokens ||
      !canAdmitInputTokens(nextTokens + sumTokens(edges) + estimateValueTokens(contracts))
    ) {
      omissions.push({ entityType: "source", entityId: node.id, reason: "budget", required: false, detail: `${role} source excerpt exceeded the file, source-token, or total-input budget.` });
      continue;
    }
    sources.push(compiled.excerpt);
    if (compiled.omission) omissions.push(compiled.omission);
  }

  const execution: WorkUnitExecutionContext[] = [];
  for (const node of requiredOwnedNodes) {
    const metadata = input.resolveExecutionMetadata ? await input.resolveExecutionMetadata(node.id).catch(() => null) : node.execution;
    if (!metadata) {
      omissions.push({ entityType: "test", entityId: node.id, reason: "unavailable", required: false, detail: "Execution metadata is unavailable for this owned node." });
      continue;
    }
    execution.push({
      nodeId: node.id,
      selectionReason: "Owned-node execution and test metadata constrains deterministic validation.",
      metadata,
      estimatedTokens: estimateValueTokens(metadata)
    });
  }

  const architectureSummary =
    input.architectureSummary?.trim() ||
    architectureSummaryForScale(workUnit.selectedScale, nodes, workUnit.parentWorkUnitId);
  const provisional: WorkUnitContext = {
    schemaVersion: 1,
    compilerVersion: WORK_UNIT_CONTEXT_COMPILER_VERSION,
    selectionPolicyVersion: WORK_UNIT_CONTEXT_SELECTION_POLICY_VERSION,
    workflowId: orchestration.workflowId,
    projectId: orchestration.projectId,
    workUnit,
    task: input.task,
    objective: workUnit.objective,
    scale: workUnit.selectedScale,
    revision: { base: workUnit.baseRevision, observed: observedRevision, indexState: input.indexState, warnings },
    allowedWrites: workUnit.plannedWriteScopes,
    nodes,
    edges,
    sources,
    contracts,
    upstreamAccepted,
    execution,
    architectureSummary,
    omissions: uniqueOmissions(omissions),
    outputRequirements: {
      expected: workUnit.expectedOutputs,
      responseFormat:
        "Return a WorkUnitProposal-compatible envelope containing the diff, actualWriteScopes, contractUpdates, discoveredDependencies, testsProposed, assumptions, unresolvedIssues, and confidence."
    },
    budget: workUnit.contextBudget,
    tokenUsage: {
      sourceTokens: 0,
      graphTokens: 0,
      contractTokens: 0,
      dependencyTokens: 0,
      otherTokens: 0,
      renderingOverheadTokens: 0,
      estimatedInputTokens: 0
    },
    provenance: {
      compiledAt: input.compiledAt ?? new Date().toISOString(),
      sourceReads,
      scopedNodeCount: input.scopedNodes.length,
      scopedEdgeCount: input.scopedEdges.length,
      inputFingerprint: fingerprint(
        stableSerialize({
          workflowId: orchestration.workflowId,
          workUnitId: workUnit.id,
          revision: observedRevision,
          indexState: input.indexState,
          nodes: input.scopedNodes.map((node) => node.id).sort(),
          edges: input.scopedEdges.map((edge) => edge.id).sort(),
          followUpReadNodeIds: [...followUpReadNodeIds].sort()
        })
      )
    }
  };
  fitOptionalContextToInputBudget(provisional);
  reconcileTokenUsage(provisional);
  return workUnitContextSchema.parse(provisional);
}

function fitOptionalContextToInputBudget(context: WorkUnitContext): void {
  for (;;) {
    reconcileTokenUsage(context);
    if (context.tokenUsage.estimatedInputTokens <= context.budget.maxInputTokens) return;
    if (context.architectureSummary) {
      context.omissions.push({ entityType: "summary", entityId: context.workUnit.id, reason: "budget", required: false, detail: "Architecture summary was trimmed to satisfy the total input budget." });
      context.architectureSummary = null;
      continue;
    }
    const haloSourceIndex = lastIndexMatching(context.sources, (source) => source.role !== "owned");
    if (haloSourceIndex >= 0) {
      const [removed] = context.sources.splice(haloSourceIndex, 1);
      context.omissions.push({ entityType: "source", entityId: removed.symbolId ?? removed.path, reason: "budget", required: false, detail: "Optional source excerpt was trimmed to satisfy the total input budget." });
      continue;
    }
    const optionalEdgeIndex = lastIndexMatching(context.edges, (edge) => edge.role !== "boundary");
    if (optionalEdgeIndex >= 0) {
      const [removed] = context.edges.splice(optionalEdgeIndex, 1);
      context.omissions.push({ entityType: "edge", entityId: removed.edgeId, reason: "budget", required: false, detail: "Optional relationship evidence was trimmed to satisfy the total input budget." });
      continue;
    }
    const optionalNodeIndex = lastIndexMatching(context.nodes, (node) => node.role !== "owned");
    if (optionalNodeIndex >= 0) {
      const [removed] = context.nodes.splice(optionalNodeIndex, 1);
      context.omissions.push({ entityType: "node", entityId: removed.nodeId, reason: "budget", required: false, detail: "Optional graph summary was trimmed to satisfy the total input budget." });
      continue;
    }
    throw new WorkUnitContextBudgetError(
      `Required work-unit context needs ${context.tokenUsage.estimatedInputTokens} estimated tokens, exceeding maxInputTokens=${context.budget.maxInputTokens}.`
    );
  }
}

function reconcileTokenUsage(context: WorkUnitContext): void {
  const sourceTokens = sumTokens(context.sources);
  const graphTokens = sumTokens(context.nodes) + sumTokens(context.edges);
  const contractTokens = estimateValueTokens(context.contracts);
  const dependencyTokens = sumTokens(context.upstreamAccepted);
  const otherTokens = estimateValueTokens({
    workflowId: context.workflowId,
    projectId: context.projectId,
    task: context.task,
    objective: context.objective,
    scale: context.scale,
    revision: context.revision,
    allowedWrites: context.allowedWrites,
    execution: context.execution.map(({ estimatedTokens: _estimatedTokens, ...entry }) => entry),
    architectureSummary: context.architectureSummary,
    omissions: context.omissions,
    outputRequirements: context.outputRequirements,
    provenance: context.provenance
  });
  const categoryTokens = sourceTokens + graphTokens + contractTokens + dependencyTokens + otherTokens;
  context.tokenUsage = {
    sourceTokens,
    graphTokens,
    contractTokens,
    dependencyTokens,
    otherTokens,
    renderingOverheadTokens: 0,
    estimatedInputTokens: categoryTokens
  };
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const renderedTokens = estimateRenderedWorkUnitContextTokens(context, { provider: "generic", purpose: "coding" });
    const renderingOverheadTokens = Math.max(0, renderedTokens - categoryTokens);
    context.tokenUsage.renderingOverheadTokens = renderingOverheadTokens;
    context.tokenUsage.estimatedInputTokens = categoryTokens + renderingOverheadTokens;
  }
}

async function compileSourceExcerpt(
  node: GraphNode,
  role: "owned" | "halo" | "test",
  required: boolean,
  baseRevision: WorkflowRevision,
  observedRevision: WorkflowRevision,
  readSource: WorkUnitSourceReader
): Promise<{ excerpt: WorkUnitSourceExcerpt | null; omission: WorkUnitContextOmission | null }> {
  const sourcePath = sourcePathForNode(node);
  if (!sourcePath || !workspaceRelativePathSchema.safeParse(sourcePath).success) {
    return {
      excerpt: null,
      omission: { entityType: "source", entityId: node.id, reason: "unsupported", required, detail: "Node has no normalized workspace-relative source path." }
    };
  }
  const startLine = node.source.startLine ?? node.code.startLine;
  const endLine = node.source.endLine ?? node.code.endLine;
  const validRange = (startLine === null && endLine === null) || (startLine !== null && endLine !== null && startLine > 0 && endLine >= startLine);
  if (!validRange) {
    return {
      excerpt: unavailableExcerpt(node, sourcePath, role, "unavailable"),
      omission: { entityType: "source", entityId: node.id, reason: "unsupported", required, detail: "Node source range is incomplete or invalid." }
    };
  }
  const expectedHash = baseRevision.sourceHashes[sourcePath];
  const observedHash = observedRevision.sourceHashes[sourcePath];
  if (expectedHash && observedHash !== expectedHash) {
    return {
      excerpt: unavailableExcerpt(node, sourcePath, role, "stale"),
      omission: { entityType: "source", entityId: node.id, reason: "stale", required, detail: "Observed source hash does not match the work-unit base revision." }
    };
  }
  const fullSource = await readSource(sourcePath);
  if (fullSource === null) {
    return {
      excerpt: unavailableExcerpt(node, sourcePath, role, "unavailable"),
      omission: { entityType: "source", entityId: node.id, reason: "unavailable", required, detail: "Source reader could not retrieve the workspace-relative file." }
    };
  }
  const extracted = extractExactRange(fullSource, startLine, endLine);
  if (extracted === null) {
    return {
      excerpt: unavailableExcerpt(node, sourcePath, role, "stale"),
      omission: { entityType: "source", entityId: node.id, reason: "stale", required, detail: "Pinned source range no longer resolves inside the observed file." }
    };
  }
  return {
    excerpt: {
      path: sourcePath,
      startLine,
      endLine,
      symbolId: node.id,
      role,
      selectionReason:
        role === "owned"
          ? "Exact owned-symbol source is mandatory and writable only inside declared scopes."
          : role === "test"
            ? "Related test source is prioritized deterministic validation evidence."
            : "One-hop halo excerpt supplies read-only boundary evidence.",
      availability: "present",
      exact: true,
      writable: role === "owned",
      content: extracted,
      fingerprint: fingerprint(extracted),
      estimatedTokens: estimateTextTokens(extracted)
    },
    omission: null
  };
}

function unavailableExcerpt(
  node: GraphNode,
  sourcePath: string,
  role: "owned" | "halo" | "test",
  availability: "unavailable" | "stale"
): WorkUnitSourceExcerpt {
  return {
    path: sourcePath,
    startLine: node.source.startLine ?? node.code.startLine,
    endLine: node.source.endLine ?? node.code.endLine,
    symbolId: node.id,
    role,
    selectionReason: `${role} source is retained as visible ${availability} provenance without unverified content.`,
    availability,
    exact: true,
    writable: false,
    content: "",
    fingerprint: null,
    estimatedTokens: 0
  };
}

function contextNode(node: GraphNode, role: WorkUnitContextNode["role"], selectionReason: string): WorkUnitContextNode {
  const sourcePath = sourcePathForNode(node);
  const startLine = node.source.startLine ?? node.code.startLine;
  const endLine = node.source.endLine ?? node.code.endLine;
  const evidence =
    sourcePath && workspaceRelativePathSchema.safeParse(sourcePath).success
      ? [{ path: sourcePath, startLine, endLine, symbolId: node.id, origin: "graph" as const, fingerprint: null }]
      : [];
  const value = { nodeId: node.id, kind: node.kind, name: node.name, summary: node.summary, role, selectionReason, evidence };
  return { ...value, estimatedTokens: estimateValueTokens(value) };
}

function contextEdge(edge: GraphEdge, role: WorkUnitContextEdge["role"], selectionReason: string): WorkUnitContextEdge {
  const value = {
    edgeId: edge.id,
    kind: edge.kind,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    label: edge.label,
    role,
    selectionReason
  };
  return { ...value, estimatedTokens: estimateValueTokens(value) };
}

function revisionWarnings(base: WorkflowRevision, observed: WorkflowRevision, indexState: RoutingFeatures["indexState"]): string[] {
  const warnings: string[] = [];
  if (base.indexRevision !== observed.indexRevision) warnings.push("Observed index revision differs from the work-unit base revision.");
  if (base.workspaceRevision !== observed.workspaceRevision) warnings.push("Observed workspace revision differs from the work-unit base revision.");
  if (base.graphRevision !== observed.graphRevision) warnings.push("Observed graph revision differs from the work-unit base revision.");
  if (indexState !== "complete") warnings.push(`Index state is ${indexState}; incomplete evidence remains explicit.`);
  return warnings;
}

function architectureSummaryForScale(
  scale: "small" | "medium" | "large",
  nodes: WorkUnitContextNode[],
  parentWorkUnitId: string | null
): string {
  if (scale === "small") return `Leaf ownership: ${nodes.filter((node) => node.role === "owned").map((node) => node.name).join(", ")}.`;
  const summaries = nodes.map((node) => `${node.role}:${node.name}${node.summary ? ` - ${node.summary}` : ""}`).join(" | ");
  return `${scale === "large" ? "Hierarchical" : "Component"} context${parentWorkUnitId ? ` under ${parentWorkUnitId}` : ""}: ${summaries}`;
}

function extractExactRange(source: string, startLine: number | null, endLine: number | null): string | null {
  if (startLine === null && endLine === null) return source;
  if (startLine === null || endLine === null) return null;
  const lines = source.split(/\r?\n/);
  if (startLine > lines.length || endLine > lines.length) return null;
  return lines.slice(startLine - 1, endLine).join("\n");
}

function sourcePathForNode(node: GraphNode): string | null {
  const value = node.source.path ?? node.code.directory;
  if (!value) return null;
  return value.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

function isTestPath(sourcePath: string | null): boolean {
  return Boolean(sourcePath && (/(^|\/)(?:test|tests|__tests__)(\/|$)/.test(sourcePath) || /\.(?:test|spec)\.[^/]+$/.test(sourcePath)));
}

function sumTokens(values: Array<{ estimatedTokens: number }>): number {
  return values.reduce((total, value) => total + value.estimatedTokens, 0);
}

function lastIndexMatching<T>(values: T[], predicate: (value: T) => boolean): number {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (predicate(values[index])) return index;
  }
  return -1;
}

function ensureRequiredBudget(label: string, tokens: number, maximum: number): void {
  if (tokens > maximum) throw new WorkUnitContextBudgetError(`Required ${label} needs ${tokens} estimated tokens, exceeding its budget of ${maximum}.`);
}

function estimateValueTokens(value: unknown): number {
  return estimateTextTokens(stableSerialize(value));
}

function uniqueOmissions(omissions: WorkUnitContextOmission[]): WorkUnitContextOmission[] {
  return [...new Map(omissions.map((omission) => [`${omission.entityType}\0${omission.entityId}\0${omission.reason}`, omission])).values()].sort(
    (left, right) => left.entityType.localeCompare(right.entityType) || left.entityId.localeCompare(right.entityId) || left.reason.localeCompare(right.reason)
  );
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

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
