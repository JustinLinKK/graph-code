import { describe, expect, it } from "vitest";
import type { GraphEdge, GraphNode } from "@graphcode/graph-model";
import { deriveLegacyWorkUnitOrchestration } from "./work-unit-preview";

function node(id: string, parentId: string | null, sourcePath: string, startLine: number, endLine: number): GraphNode {
  return {
    id,
    projectId: "project-1",
    kind: id === "module" ? "module" : "function",
    name: id,
    summary: `${id} summary`,
    code: { context: "", directory: sourcePath, startLine, endLine, language: "typescript" },
    parentId,
    attachedToId: null,
    customTypeId: null,
    source: { path: sourcePath, startLine, endLine },
    execution: { testScriptDirectory: null, virtualEnvironment: null, workingDirectory: null, setupCommand: null, testCommand: "pnpm test" },
    position: { x: 0, y: 0 },
    size: { width: 224, height: 120 },
    childCount: id === "module" ? 2 : 0,
    hasChildren: id === "module",
    agentStatus: "planning",
    gitStatus: null,
    tags: [],
    createdAt: "created",
    updatedAt: "updated"
  };
}

describe("MA-1 legacy work-unit preview derivation", () => {
  it("derives unique ownership, hierarchy dependencies, coordination, budgets, revisions, and routing", () => {
    const nodes = [node("module", null, "src/module.ts", 1, 80), node("producer", "module", "src/producer.ts", 1, 10), node("consumer", "module", "src/consumer.ts", 1, 12)];
    const edges: GraphEdge[] = [
      {
        id: "consumer-calls-producer",
        projectId: "project-1",
        kind: "calls",
        sourceNodeId: "consumer",
        targetNodeId: "producer",
        label: null,
        codeContext: "",
        source: { path: null, startLine: null, endLine: null },
        color: "#64748b",
        animated: false,
        pointingEnabled: true,
        pointingDirection: "source_to_target",
        agentStatus: "none",
        gitStatus: null,
        tags: [],
        createdAt: "created"
      }
    ];
    const orchestration = deriveLegacyWorkUnitOrchestration({
      workflowId: "workflow-1",
      projectId: "project-1",
      nodes,
      edges,
      items: [
        { id: "unit-producer", nodeId: "producer", layerIndex: 0, recommendedMode: "small", selectedMode: "small", modeReason: "leaf", status: "pending" },
        { id: "unit-consumer", nodeId: "consumer", layerIndex: 0, recommendedMode: "small", selectedMode: "medium", modeReason: "leaf", status: "pending" },
        { id: "unit-module", nodeId: "module", layerIndex: 1, recommendedMode: "medium", selectedMode: "medium", modeReason: "parent", status: "blocked" }
      ],
      revision: {
        indexRevision: "index-1",
        workspaceRevision: "workspace-1",
        graphRevision: 7,
        sourceHashes: { "src\\producer.ts": "hash-producer" },
        indexState: "complete",
        capturedAt: "2026-07-18T12:00:00.000Z"
      }
    });

    const parent = orchestration.workUnits.find((unit) => unit.id === "unit-module")!;
    const producer = orchestration.workUnits.find((unit) => unit.id === "unit-producer")!;
    const consumer = orchestration.workUnits.find((unit) => unit.id === "unit-consumer")!;
    const consumerRoute = orchestration.routingDecisions.find((decision) => decision.workUnitId === consumer.id)!;

    expect(parent.dependencyWorkUnitIds).toEqual(["unit-consumer", "unit-producer"]);
    expect(producer.parentWorkUnitId).toBe(parent.id);
    expect(producer.coordinationWorkUnitIds).toEqual([consumer.id]);
    expect(consumer.boundaryEdgeIds).toEqual(["consumer-calls-producer"]);
    expect(consumer.contextBudget.maxInputTokens).toBe(48000);
    expect(consumerRoute.override).toEqual({ actor: "user", reason: "Legacy workflow mode override selected during preview." });
    expect(orchestration.revision.sourceHashes).toEqual({ "src/producer.ts": "hash-producer" });
    expect(new Set(orchestration.workUnits.flatMap((unit) => unit.ownedNodeIds)).size).toBe(3);
  });

  it("removes unsafe legacy source paths from write authority and emits a warning", () => {
    const unsafe = node("unsafe", null, "../outside.ts", 1, 4);
    const orchestration = deriveLegacyWorkUnitOrchestration({
      workflowId: "workflow-unsafe",
      projectId: "project-1",
      nodes: [unsafe],
      edges: [],
      items: [{ id: "unit-unsafe", nodeId: "unsafe", layerIndex: 0, recommendedMode: "small", selectedMode: "small", modeReason: "leaf", status: "pending" }],
      revision: { indexRevision: null, workspaceRevision: null, graphRevision: 0, sourceHashes: {}, indexState: "unavailable" }
    });

    expect(orchestration.workUnits[0].plannedWriteScopes).toEqual([]);
    expect(orchestration.warnings).toContainEqual(expect.stringMatching(/no safe derived write scope/));
  });
});
