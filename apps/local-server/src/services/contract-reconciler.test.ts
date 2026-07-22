import { describe, expect, it } from "vitest";
import type { CodingWorkflowOrchestration, ContractSnapshot } from "@graphcode/graph-model";
import { reconcileInterfaceContracts } from "./contract-reconciler";

const baseline: ContractSnapshot = {
  formatVersion: 1,
  summary: "exported function",
  normalizedValue: "execute(input:string):Promise<string>",
  fingerprint: "baseline",
  metadata: {}
};

function orchestration(): CodingWorkflowOrchestration {
  const revision = {
    indexRevision: "index-1",
    workspaceRevision: "workspace-1",
    graphRevision: 1,
    sourceHashes: { "src/producer.ts": "aaa", "src/consumer.ts": "bbb" },
    contextCompilerVersion: "compiler-1",
    routingFeatureVersion: "router-1",
    capturedAt: "2026-07-18T00:00:00.000Z"
  };
  const budget = { maxInputTokens: 1000, maxSourceTokens: 500, maxGraphTokens: 200, maxContractTokens: 100, maxFiles: 3, maxNodes: 4, maxEdges: 4 };
  const features = {
    ownedSymbolCount: 1,
    estimatedSourceTokens: 100,
    controlFlowComplexity: 1,
    cutEdgeCount: 1,
    cutEdgeWeight: 1,
    crossFileRelationshipCount: 1,
    crossPackageRelationshipCount: 0,
    upstreamWorkUnitCount: 0,
    downstreamWorkUnitCount: 1,
    interfaceChangeRequested: false,
    publicApiInvolvement: true,
    sharedStateInvolvement: false,
    testAvailability: "available" as const,
    blastRadius: "module" as const,
    languageConfidence: 1,
    indexState: "complete" as const,
    taskAmbiguity: "low" as const,
    planningConfidence: 1,
    risks: ["public_contract" as const]
  };
  return {
    schemaVersion: 1,
    featureVersion: "test",
    workflowId: "workflow",
    projectId: "project",
    revision,
    workUnits: [
      {
        id: "producer",
        workflowId: "workflow",
        projectId: "project",
        parentWorkUnitId: null,
        layerIndex: 0,
        title: "Producer",
        objective: "Change producer",
        ownedNodeIds: ["node-producer"],
        readHaloNodeIds: [],
        boundaryEdgeIds: ["edge"],
        dependencyWorkUnitIds: [],
        coordinationWorkUnitIds: [],
        plannedWriteScopes: [{ path: "src/producer.ts", startLine: 1, endLine: 20, symbolId: null, permission: "edit" }],
        expectedOutputs: [],
        recommendedScale: "small",
        selectedScale: "small",
        routingDecisionId: "route-producer",
        contextBudget: budget,
        baseRevision: revision,
        status: "proposed"
      },
      {
        id: "consumer",
        workflowId: "workflow",
        projectId: "project",
        parentWorkUnitId: null,
        layerIndex: 1,
        title: "Consumer",
        objective: "Change consumer",
        ownedNodeIds: ["node-consumer"],
        readHaloNodeIds: [],
        boundaryEdgeIds: ["edge"],
        dependencyWorkUnitIds: ["producer"],
        coordinationWorkUnitIds: [],
        plannedWriteScopes: [{ path: "src/consumer.ts", startLine: 1, endLine: 20, symbolId: null, permission: "edit" }],
        expectedOutputs: [],
        recommendedScale: "small",
        selectedScale: "small",
        routingDecisionId: "route-consumer",
        contextBudget: budget,
        baseRevision: revision,
        status: "blocked"
      }
    ],
    boundaryEdges: [{ id: "edge", sourceNodeId: "node-producer", targetNodeId: "node-consumer", kind: "calls" }],
    interfaceContracts: [
      {
        id: "contract",
        workflowId: "workflow",
        edgeId: "edge",
        edgeKind: "calls",
        producerWorkUnitId: "producer",
        consumerWorkUnitId: "consumer",
        direction: "producer_to_consumer",
        subjectNodeIds: ["node-producer", "node-consumer"],
        contractKind: "signature",
        baseline,
        proposed: null,
        status: "stable",
        evidence: []
      }
    ],
    routingDecisions: ["producer", "consumer"].map((workUnitId) => ({
      id: `route-${workUnitId}`,
      workUnitId,
      recommendedScale: "small" as const,
      selectedScale: "small" as const,
      featureVersion: "router-1",
      features,
      reasons: ["test"],
      estimatedInputTokens: 100,
      estimatedOutputTokens: 20,
      estimatedCost: null,
      override: null
    })),
    warnings: []
  };
}

describe("MA-5 contract reconciliation", () => {
  it("keeps unchanged contracts stable", () => {
    const result = reconcileInterfaceContracts(orchestration(), []);
    expect(result).toMatchObject({ passed: true, issues: [], blockedWorkUnitIds: [] });
    expect(result.contracts[0]).toMatchObject({ status: "stable", proposed: null });
  });

  it("blocks a one-sided breaking change with producer and consumer evidence", () => {
    const changed = { ...baseline, normalizedValue: "execute(input:number):Promise<string>", fingerprint: "changed" };
    const result = reconcileInterfaceContracts(orchestration(), [
      { workUnitId: "producer", contractId: "contract", proposed: changed, rationale: "Input changes." }
    ]);

    expect(result.passed).toBe(false);
    expect(result.blockedWorkUnitIds).toContain("consumer");
    expect(result.issues[0]).toMatchObject({
      code: "contract_change_unacknowledged",
      producerWorkUnitId: "producer",
      consumerWorkUnitId: "consumer"
    });
    expect(result.contracts[0].status).toBe("proposed_change");
  });

  it("accepts a matching producer and consumer contract update", () => {
    const changed = { ...baseline, normalizedValue: "execute(input:number):Promise<string>", fingerprint: "changed" };
    const result = reconcileInterfaceContracts(orchestration(), [
      { workUnitId: "producer", contractId: "contract", proposed: changed, rationale: "Producer update." },
      { workUnitId: "consumer", contractId: "contract", proposed: changed, rationale: "Consumer acknowledgement." }
    ]);

    expect(result.passed).toBe(true);
    expect(result.contracts[0]).toMatchObject({ status: "accepted", proposed: changed });
  });

  it("accepts a later consumer acknowledgement of a persisted producer change", () => {
    const changed = { ...baseline, normalizedValue: "execute(input:number):Promise<string>", fingerprint: "changed" };
    const graph = orchestration();
    graph.interfaceContracts[0] = { ...graph.interfaceContracts[0], proposed: changed, status: "proposed_change" };
    const result = reconcileInterfaceContracts(graph, [
      { workUnitId: "consumer", contractId: "contract", proposed: changed, rationale: "Consumer updated." }
    ]);

    expect(result.passed).toBe(true);
    expect(result.contracts[0]).toMatchObject({ status: "accepted", proposed: changed });
  });

  it("rejects incompatible endpoint updates", () => {
    const result = reconcileInterfaceContracts(orchestration(), [
      { workUnitId: "producer", contractId: "contract", proposed: { ...baseline, fingerprint: "producer", normalizedValue: "v2" }, rationale: "Producer." },
      { workUnitId: "consumer", contractId: "contract", proposed: { ...baseline, fingerprint: "consumer", normalizedValue: "v3" }, rationale: "Consumer." }
    ]);

    expect(result.passed).toBe(false);
    expect(result.contracts[0].status).toBe("conflicted");
    expect(result.issues[0].code).toBe("conflicting_contract_updates");
  });

  it("rejects producer and consumer disagreement about a schema data shape", () => {
    const graph = orchestration();
    graph.interfaceContracts[0] = {
      ...graph.interfaceContracts[0],
      contractKind: "schema",
      baseline: {
        formatVersion: 1,
        summary: "event payload",
        normalizedValue: "{id:string}",
        fingerprint: "schema-v1",
        metadata: { format: "json" }
      }
    };
    const result = reconcileInterfaceContracts(graph, [
      {
        workUnitId: "producer",
        contractId: "contract",
        proposed: { ...graph.interfaceContracts[0].baseline, normalizedValue: "{id:string,total:number}", fingerprint: "producer-schema" },
        rationale: "Producer adds a numeric total."
      },
      {
        workUnitId: "consumer",
        contractId: "contract",
        proposed: { ...graph.interfaceContracts[0].baseline, normalizedValue: "{id:string,total:string}", fingerprint: "consumer-schema" },
        rationale: "Consumer expects a string total."
      }
    ]);

    expect(result.passed).toBe(false);
    expect(result.contracts[0]).toMatchObject({ contractKind: "schema", status: "conflicted" });
    expect(result.issues[0]).toMatchObject({
      code: "conflicting_contract_updates",
      producerWorkUnitId: "producer",
      consumerWorkUnitId: "consumer"
    });
  });
});
