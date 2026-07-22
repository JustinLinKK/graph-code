import type { CodingWorkflow, GraphEdge, GraphNode, WorkflowRevision } from "@graphcode/graph-model";
import { describe, expect, it, vi } from "vitest";
import { compileStoredWorkUnitContext, expandStoredWorkUnitContext, type ScopedWorkUnitContextRepository } from "./work-unit-context";

describe("stored MA-3 work-unit context service", () => {
  it("retrieves only explicit work-unit IDs and never asks for a full project graph", async () => {
    const { workflow, nodes, edges, revision } = fixture();
    const getNode = vi.fn((nodeId: string) => nodes.get(nodeId)!);
    const getEdge = vi.fn((edgeId: string) => edges.get(edgeId)!);
    const repository: ScopedWorkUnitContextRepository & { listProjectNodes: ReturnType<typeof vi.fn>; listProjectEdges: ReturnType<typeof vi.fn> } = {
      getCodingWorkflow: vi.fn(() => workflow),
      getNode,
      getEdge,
      resolveExecutionMetadata: vi.fn((nodeId: string) => nodes.get(nodeId)!.execution),
      listProjectNodes: vi.fn(() => {
        throw new Error("full graph read is forbidden");
      }),
      listProjectEdges: vi.fn(() => {
        throw new Error("full graph read is forbidden");
      })
    };

    const context = await compileStoredWorkUnitContext({
      repository,
      projectId: "project",
      workflowId: "workflow",
      workUnitId: "unit-a",
      task: "Change a without broad graph context.",
      observedRevision: revision,
      indexState: "complete",
      readSource: async () => ["export function a() {", "  return b();", "}"].join("\n"),
      compiledAt: "2026-07-18T14:00:00.000Z"
    });

    expect(context.workUnit.id).toBe("unit-a");
    expect(context.nodes.map((node) => node.nodeId).sort()).toEqual(["a", "b"]);
    expect(context.edges.map((edge) => edge.edgeId)).toEqual(["a-calls-b"]);
    expect(getNode).toHaveBeenCalledTimes(2);
    expect(getEdge).toHaveBeenCalledTimes(1);
    expect(repository.listProjectNodes).not.toHaveBeenCalled();
    expect(repository.listProjectEdges).not.toHaveBeenCalled();

    const expanded = await expandStoredWorkUnitContext({
      repository,
      projectId: "project",
      workflowId: "workflow",
      workUnitId: "unit-a",
      task: "Change a without broad graph context.",
      observedRevision: revision,
      indexState: "complete",
      readSource: async (sourcePath) =>
        sourcePath === "src/b.ts"
          ? ["export function b() {", "  return 1;", "}"].join("\n")
          : ["export function a() {", "  return b();", "}"].join("\n"),
      compiledAt: "2026-07-18T14:00:00.000Z",
      request: {
        requestId: "retrieval-b",
        workUnitId: "unit-a",
        missingFact: "Exact b signature",
        reason: "The read-only halo summary omits its source signature.",
        requestedNodeIds: ["b"],
        requestedSources: [{ path: "src/b.ts", startLine: 1, endLine: 3, intent: "read" }],
        remainingBudget: {
          maxInputTokens: context.budget.maxInputTokens - context.tokenUsage.estimatedInputTokens,
          maxSourceTokens: context.budget.maxSourceTokens - context.tokenUsage.sourceTokens,
          maxGraphTokens: context.budget.maxGraphTokens - context.tokenUsage.graphTokens,
          maxContractTokens: context.budget.maxContractTokens - context.tokenUsage.contractTokens,
          maxFiles: context.budget.maxFiles - new Set(context.sources.map((source) => source.path)).size,
          maxNodes: context.budget.maxNodes - context.nodes.length,
          maxEdges: context.budget.maxEdges - context.edges.length
        }
      }
    });
    expect(expanded.expanded.sources).toContainEqual(
      expect.objectContaining({ path: "src/b.ts", role: "halo", availability: "present", writable: false })
    );
    expect(repository.listProjectNodes).not.toHaveBeenCalled();
    expect(repository.listProjectEdges).not.toHaveBeenCalled();
  });
});

function fixture(): {
  workflow: CodingWorkflow;
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
  revision: WorkflowRevision;
} {
  const revision: WorkflowRevision = {
    indexRevision: "index",
    workspaceRevision: "workspace",
    graphRevision: 1,
    sourceHashes: { "src/a.ts": "hash-a", "src/b.ts": "hash-b" },
    contextCompilerVersion: "uncompiled-v1",
    routingFeatureVersion: "partition-preview-v1",
    capturedAt: "2026-07-18T12:00:00.000Z"
  };
  const nodes = new Map([
    ["a", graphNode("a", "src/a.ts")],
    ["b", graphNode("b", "src/b.ts")]
  ]);
  const edge: GraphEdge = {
    id: "a-calls-b",
    projectId: "project",
    kind: "calls",
    sourceNodeId: "a",
    targetNodeId: "b",
    label: "a calls b",
    codeContext: "a calls b",
    source: { path: "src/a.ts", startLine: 2, endLine: 2 },
    color: "#64748b",
    animated: false,
    pointingEnabled: true,
    pointingDirection: "source_to_target",
    agentStatus: "none",
    gitStatus: null,
    tags: [],
    createdAt: "fixture"
  };
  const budget = { maxInputTokens: 16000, maxSourceTokens: 8000, maxGraphTokens: 4000, maxContractTokens: 2000, maxFiles: 4, maxNodes: 64, maxEdges: 128 };
  const unitA = {
    id: "unit-a",
    workflowId: "workflow",
    projectId: "project",
    parentWorkUnitId: null,
    layerIndex: 0,
    title: "a",
    objective: "Implement a.",
    ownedNodeIds: ["a"],
    readHaloNodeIds: ["b"],
    boundaryEdgeIds: [edge.id],
    dependencyWorkUnitIds: [],
    coordinationWorkUnitIds: ["unit-b"],
    plannedWriteScopes: [{ path: "src/a.ts", startLine: 1, endLine: 3, symbolId: "a", permission: "edit" as const }],
    expectedOutputs: [{ kind: "diff" as const, description: "Patch a.", required: true, path: null }],
    recommendedScale: "small" as const,
    selectedScale: "small" as const,
    routingDecisionId: "route-a",
    contextBudget: budget,
    baseRevision: revision,
    status: "pending" as const
  };
  const unitB = {
    ...unitA,
    id: "unit-b",
    title: "b",
    objective: "Implement b.",
    ownedNodeIds: ["b"],
    readHaloNodeIds: ["a"],
    coordinationWorkUnitIds: ["unit-a"],
    plannedWriteScopes: [{ path: "src/b.ts", startLine: 1, endLine: 3, symbolId: "b", permission: "edit" as const }],
    routingDecisionId: "route-b"
  };
  const routing = (id: string, workUnitId: string) => ({
    id,
    workUnitId,
    recommendedScale: "small" as const,
    selectedScale: "small" as const,
    featureVersion: "partition-preview-v1",
    features: {
      ownedSymbolCount: 1,
      estimatedSourceTokens: 10,
      controlFlowComplexity: null,
      cutEdgeCount: 1,
      cutEdgeWeight: 3,
      crossFileRelationshipCount: 1,
      crossPackageRelationshipCount: 0,
      upstreamWorkUnitCount: 0,
      downstreamWorkUnitCount: 0,
      interfaceChangeRequested: false,
      publicApiInvolvement: false,
      sharedStateInvolvement: false,
      testAvailability: "unknown" as const,
      blastRadius: "local" as const,
      languageConfidence: null,
      indexState: "complete" as const,
      taskAmbiguity: "low" as const,
      planningConfidence: 1,
      risks: ["cross_file" as const]
    },
    reasons: ["Fixture."],
    estimatedInputTokens: 10,
    estimatedOutputTokens: 5,
    estimatedCost: null,
    override: null
  });
  const workflow: CodingWorkflow = {
    id: "workflow",
    projectId: "project",
    scopeNodeId: "a",
    scopeName: "a",
    status: "preview",
    currentLayer: 0,
    summary: "fixture",
    items: [],
    createdAt: "fixture",
    updatedAt: "fixture",
    orchestration: {
      schemaVersion: 1,
      featureVersion: "ma2-partition-v1",
      workflowId: "workflow",
      projectId: "project",
      revision,
      workUnits: [unitA, unitB],
      boundaryEdges: [{ id: edge.id, sourceNodeId: "a", targetNodeId: "b", kind: "calls" }],
      interfaceContracts: [
        {
          id: "contract",
          workflowId: "workflow",
          edgeId: edge.id,
          edgeKind: "calls",
          producerWorkUnitId: "unit-a",
          consumerWorkUnitId: "unit-b",
          direction: "producer_to_consumer",
          subjectNodeIds: ["a", "b"],
          contractKind: "signature",
          baseline: { formatVersion: 1, summary: "a calls b", normalizedValue: "a->b", fingerprint: "contract-hash", metadata: {} },
          proposed: null,
          status: "stable",
          evidence: []
        }
      ],
      routingDecisions: [routing("route-a", "unit-a"), routing("route-b", "unit-b")],
      warnings: []
    }
  };
  return { workflow, nodes, edges: new Map([[edge.id, edge]]), revision };
}

function graphNode(id: string, sourcePath: string): GraphNode {
  return {
    id,
    projectId: "project",
    kind: "function",
    name: id,
    summary: `${id} summary`,
    code: { context: `${id} context`, directory: sourcePath, startLine: 1, endLine: 3, language: "typescript" },
    parentId: null,
    attachedToId: null,
    customTypeId: null,
    source: { path: sourcePath, startLine: 1, endLine: 3 },
    execution: { testScriptDirectory: null, virtualEnvironment: null, workingDirectory: null, setupCommand: null, testCommand: null },
    position: { x: 0, y: 0 },
    size: { width: 224, height: 120 },
    childCount: 0,
    hasChildren: false,
    agentStatus: "planning",
    gitStatus: null,
    tags: [],
    createdAt: "fixture",
    updatedAt: "fixture"
  };
}
