import { describe, expect, it } from "vitest";
import {
  codingWorkflowOrchestrationSchema,
  sourceWriteScopeSchema,
  workUnitProposalSchema,
  type CodingWorkflowOrchestration,
  type CodingWorkUnit,
  type ModelRoutingDecision,
  type WorkflowRevision
} from "./work-units";

const revision: WorkflowRevision = {
  indexRevision: "index-1",
  workspaceRevision: "workspace-1",
  graphRevision: 4,
  sourceHashes: { "src/a.ts": "hash-a", "src/b.ts": "hash-b" },
  contextCompilerVersion: "uncompiled-v1",
  routingFeatureVersion: "legacy-preview-v1",
  capturedAt: "2026-07-18T12:00:00.000Z"
};

function unit(id: string, nodeId: string, layerIndex: number, overrides: Partial<CodingWorkUnit> = {}): CodingWorkUnit {
  return {
    id,
    workflowId: "workflow-1",
    projectId: "project-1",
    parentWorkUnitId: null,
    layerIndex,
    title: id,
    objective: `Implement ${id}`,
    ownedNodeIds: [nodeId],
    readHaloNodeIds: [],
    boundaryEdgeIds: ["edge-1"],
    dependencyWorkUnitIds: [],
    coordinationWorkUnitIds: [],
    plannedWriteScopes: [{ path: `src/${nodeId}.ts`, startLine: 1, endLine: 10, symbolId: nodeId, permission: "edit" }],
    expectedOutputs: [{ kind: "diff", description: "Scoped patch", required: true, path: null }],
    recommendedScale: "small",
    selectedScale: "small",
    routingDecisionId: `route-${id}`,
    contextBudget: {
      maxInputTokens: 16000,
      maxSourceTokens: 8000,
      maxGraphTokens: 4000,
      maxContractTokens: 2000,
      maxFiles: 4,
      maxNodes: 64,
      maxEdges: 128
    },
    baseRevision: revision,
    status: "pending",
    ...overrides
  };
}

function decision(workUnitId: string): ModelRoutingDecision {
  return {
    id: `route-${workUnitId}`,
    workUnitId,
    recommendedScale: "small",
    selectedScale: "small",
    featureVersion: "legacy-preview-v1",
    features: {
      ownedSymbolCount: 1,
      estimatedSourceTokens: 200,
      controlFlowComplexity: null,
      cutEdgeCount: 1,
      cutEdgeWeight: 1,
      crossFileRelationshipCount: 1,
      crossPackageRelationshipCount: 0,
      upstreamWorkUnitCount: 0,
      downstreamWorkUnitCount: 0,
      interfaceChangeRequested: false,
      publicApiInvolvement: false,
      sharedStateInvolvement: false,
      testAvailability: "unknown",
      blastRadius: "local",
      languageConfidence: null,
      indexState: "complete",
      taskAmbiguity: "unknown",
      planningConfidence: null,
      risks: ["cross_file"]
    },
    reasons: ["Legacy preview recommendation."],
    estimatedInputTokens: 0,
    estimatedOutputTokens: 0,
    estimatedCost: null,
    override: null
  };
}

function validGraph(): CodingWorkflowOrchestration {
  const producer = unit("producer", "producer-node", 0, { coordinationWorkUnitIds: ["consumer"] });
  const consumer = unit("consumer", "consumer-node", 1, {
    dependencyWorkUnitIds: ["producer"],
    coordinationWorkUnitIds: ["producer"]
  });
  return {
    schemaVersion: 1,
    featureVersion: "ma1-schema-v1",
    workflowId: "workflow-1",
    projectId: "project-1",
    revision,
    workUnits: [producer, consumer],
    boundaryEdges: [{ id: "edge-1", sourceNodeId: "producer-node", targetNodeId: "consumer-node", kind: "calls" }],
    interfaceContracts: [],
    routingDecisions: [decision("producer"), decision("consumer")],
    warnings: []
  };
}

describe("parallel multi-scale work-unit schemas", () => {
  it("round-trips a valid MA-1 orchestration graph", () => {
    expect(codingWorkflowOrchestrationSchema.parse(validGraph())).toEqual(validGraph());
  });

  it("rejects duplicate leaf ownership", () => {
    const graph = validGraph();
    graph.workUnits[1].ownedNodeIds = [graph.workUnits[0].ownedNodeIds[0]];

    expect(() => codingWorkflowOrchestrationSchema.parse(graph)).toThrow(/Duplicate ownership/);
  });

  it("rejects dangling and later-layer dependencies", () => {
    const dangling = validGraph();
    dangling.workUnits[1].dependencyWorkUnitIds = ["missing"];
    expect(() => codingWorkflowOrchestrationSchema.parse(dangling)).toThrow(/Dangling dependency/);

    const later = validGraph();
    later.workUnits[0].dependencyWorkUnitIds = ["consumer"];
    expect(() => codingWorkflowOrchestrationSchema.parse(later)).toThrow(/earlier layer/);
  });

  it("rejects boundary edges that do not cross ownership", () => {
    const graph = validGraph();
    graph.boundaryEdges[0].sourceNodeId = "external-a";
    graph.boundaryEdges[0].targetNodeId = "external-b";

    expect(() => codingWorkflowOrchestrationSchema.parse(graph)).toThrow(/must cross owned\/non-owned nodes/);
  });

  it("rejects unsafe or non-normalized write paths and partial ranges", () => {
    expect(() =>
      sourceWriteScopeSchema.parse({ path: "../outside.ts", startLine: null, endLine: null, symbolId: null, permission: "edit" })
    ).toThrow(/normalized workspace-relative/);
    expect(() =>
      sourceWriteScopeSchema.parse({ path: "src\\file.ts", startLine: 1, endLine: null, symbolId: null, permission: "edit" })
    ).toThrow();
  });

  it("normalizes the work-unit proposal envelope around pinned revisions and declared effects", () => {
    const proposal = workUnitProposalSchema.parse({
      workUnitId: "producer",
      baseRevision: revision,
      diff: "diff --git a/src/a.ts b/src/a.ts",
      actualWriteScopes: [{ path: "src/a.ts", startLine: 1, endLine: 8, symbolId: "producer-node", permission: "edit" }],
      contractUpdates: [],
      discoveredDependencies: [
        { targetWorkUnitId: "consumer", edgeId: "edge-1", kind: "coordinates_with", reason: "Shared signature evidence." }
      ],
      testsProposed: [{ path: "src/a.test.ts", content: "test('a', () => {})", command: "pnpm test", description: "Covers the producer." }],
      assumptions: ["The baseline signature remains stable."],
      unresolvedIssues: [],
      confidence: "high"
    });

    expect(proposal.baseRevision.graphRevision).toBe(4);
    expect(proposal.actualWriteScopes[0].permission).toBe("edit");
    expect(proposal.discoveredDependencies[0].kind).toBe("coordinates_with");
  });
});
