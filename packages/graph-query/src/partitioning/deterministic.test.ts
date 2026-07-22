import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { GraphEdge, GraphNode } from "@graphcode/graph-model";
import { DEFAULT_PARTITION_BUDGETS, defaultWorkflowEdgePolicy, graphPartitionInputSchema, type GraphPartitionInput } from "./contracts";
import { buildTaskSubgraph, partitionGraphTask } from "./deterministic";

type Fixture = {
  id: string;
  task: string;
  scopeNodeId: string;
  nodes: Array<{
    id: string;
    name: string;
    kind: GraphNode["kind"];
    summary: string;
    parentId: string | null;
    attachedToId: string | null;
    source: { path: string; startLine: number; endLine: number };
    agentStatus: GraphNode["agentStatus"];
  }>;
  edges: Array<{
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    kind: GraphEdge["kind"];
    label: string | null;
  }>;
};

const fixtureDirectory = fileURLToPath(new URL("../../../../tests/fixtures/parallel-multiscale-agent/", import.meta.url));

function loadFixtures(): Fixture[] {
  return fs
    .readdirSync(fixtureDirectory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(`${fixtureDirectory}/${name}`, "utf8")) as Fixture);
}

function fixtureInput(fixture: Fixture, overrides: Partial<GraphPartitionInput> = {}): GraphPartitionInput {
  const childCount = new Map<string, number>();
  for (const node of fixture.nodes) {
    for (const parentId of [node.parentId, node.attachedToId]) {
      if (parentId) childCount.set(parentId, (childCount.get(parentId) ?? 0) + 1);
    }
  }
  const nodes: GraphNode[] = fixture.nodes.map((node, index) => ({
    id: node.id,
    projectId: "partition-project",
    kind: node.kind,
    name: node.name,
    summary: node.summary,
    code: { context: node.summary, directory: node.source.path, startLine: node.source.startLine, endLine: node.source.endLine, language: "typescript" },
    parentId: node.parentId,
    attachedToId: node.attachedToId,
    customTypeId: null,
    source: node.source,
    execution: { testScriptDirectory: null, virtualEnvironment: null, workingDirectory: null, setupCommand: null, testCommand: "pnpm test" },
    position: { x: index * 10, y: 0 },
    size: { width: 224, height: 120 },
    childCount: childCount.get(node.id) ?? 0,
    hasChildren: (childCount.get(node.id) ?? 0) > 0,
    agentStatus: node.agentStatus,
    gitStatus: null,
    tags: [],
    createdAt: "fixture",
    updatedAt: "fixture"
  }));
  const edges: GraphEdge[] = fixture.edges.map((edge) => ({
    id: edge.id,
    projectId: "partition-project",
    kind: edge.kind,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    label: edge.label,
    codeContext: edge.label ?? "",
    source: { path: nodes.find((node) => node.id === edge.sourceNodeId)?.source.path ?? null, startLine: null, endLine: null },
    color: "#64748b",
    animated: false,
    pointingEnabled: true,
    pointingDirection: "source_to_target",
    agentStatus: "none",
    gitStatus: null,
    tags: [],
    createdAt: "fixture"
  }));
  const targetNodeIds = fixture.nodes.filter((node) => node.agentStatus === "planning").map((node) => node.id).sort();
  return graphPartitionInputSchema.parse({
    workflowId: `workflow-${fixture.id}`,
    projectId: "partition-project",
    revision: {
      indexRevision: "fixture-index-1",
      workspaceRevision: "fixture-workspace-1",
      graphRevision: 3,
      sourceHashes: Object.fromEntries(fixture.nodes.map((node) => [node.source.path, `hash-${node.id}`])),
      contextCompilerVersion: "uncompiled-v1",
      routingFeatureVersion: "partition-preview-v1",
      capturedAt: "2026-07-18T12:00:00.000Z"
    },
    indexState: "complete",
    scopeNodeId: fixture.scopeNodeId,
    targetNodeIds,
    targetHints: targetNodeIds.map((nodeId) => ({ nodeId, recommendedScale: "small", selectedScale: "small", reason: "Fixture hint." })),
    task: fixture.task,
    nodes,
    edges,
    maximumConcurrency: 4,
    budgets: DEFAULT_PARTITION_BUDGETS,
    policy: defaultWorkflowEdgePolicy(),
    constraints: {},
    ...overrides
  });
}

describe("deterministic graph partitioner", () => {
  it("owns every target exactly once and covers every cut edge with a contract or approved ignore reason", () => {
    for (const fixture of loadFixtures()) {
      const result = partitionGraphTask(fixtureInput(fixture));
      for (const targetNodeId of result.partitioning!.targetNodeIds) {
        expect(result.workUnits.filter((unit) => unit.ownedNodeIds.includes(targetNodeId))).toHaveLength(1);
      }
      const coveredEdgeIds = new Set([
        ...result.interfaceContracts.map((contract) => contract.edgeId),
        ...result.partitioning!.ignoredEdges.map((edge) => edge.edgeId)
      ]);
      expect(result.boundaryEdges.every((edge) => coveredEdgeIds.has(edge.id))).toBe(true);
      expect(result.workUnits.every((unit) => unit.dependencyWorkUnitIds.every((dependencyId) => result.workUnits.find((candidate) => candidate.id === dependencyId)!.layerIndex < unit.layerIndex))).toBe(true);
    }
  });

  it("is byte-for-byte deterministic for the same revision and policy", () => {
    const fixture = loadFixtures().find((candidate) => candidate.id === "cross-package")!;
    const input = fixtureInput(fixture);

    expect(partitionGraphTask(input)).toEqual(partitionGraphTask(input));
  });

  it("preserves an explicit target downgrade instead of silently replacing it with the partition estimate", () => {
    const fixture = loadFixtures().find((candidate) => candidate.id === "cross-package")!;
    const base = fixtureInput(fixture);
    const targetNodeId = base.targetNodeIds[0];
    const input = fixtureInput(fixture, {
      targetHints: base.targetHints.map((hint) =>
        hint.nodeId === targetNodeId
          ? {
              ...hint,
              recommendedScale: "large",
              selectedScale: "small",
              override: { actor: "user", reason: "Explicit fixture downgrade." }
            }
          : hint
      )
    });

    const result = partitionGraphTask(input);
    const unit = result.workUnits.find((candidate) => candidate.ownedNodeIds.includes(targetNodeId))!;
    const routing = result.routingDecisions.find((candidate) => candidate.workUnitId === unit.id)!;

    expect(unit.recommendedScale).toBe("large");
    expect(unit.selectedScale).toBe("small");
    expect(routing.override).toEqual({ actor: "user", reason: "Explicit fixture downgrade." });
  });

  it("is independent of scoped node, edge, target, and hint row order", () => {
    const fixture = loadFixtures().find((candidate) => candidate.id === "cross-package")!;
    const input = fixtureInput(fixture);
    const reversed = graphPartitionInputSchema.parse({
      ...input,
      nodes: [...input.nodes].reverse(),
      edges: [...input.edges].reverse(),
      targetNodeIds: [...input.targetNodeIds].reverse(),
      targetHints: [...input.targetHints].reverse()
    });

    expect(partitionGraphTask(reversed)).toEqual(partitionGraphTask(input));
  });

  it("keeps related fixture nodes together more often than the legacy round-robin baseline", () => {
    let topologyInternal = 0;
    let topologyTotal = 0;
    let legacyCoLocated = 0;
    let legacyTotal = 0;
    for (const fixture of loadFixtures()) {
      const input = fixtureInput(fixture);
      const result = partitionGraphTask(input);
      topologyInternal += result.partitioning!.internalRelationshipEdges;
      topologyTotal += result.partitioning!.internalRelationshipEdges + result.partitioning!.cutRelationshipEdges;
      const chunks = Array.from({ length: Math.min(4, Math.max(input.nodes.length, 1)) }, () => new Set<string>());
      input.nodes.forEach((node, index) => chunks[index % chunks.length].add(node.id));
      input.edges.forEach((edge, index) => {
        legacyTotal += 1;
        if (chunks[index % chunks.length].has(edge.sourceNodeId) && chunks[index % chunks.length].has(edge.targetNodeId)) legacyCoLocated += 1;
      });
    }

    expect(topologyTotal).toBeGreaterThan(0);
    expect(topologyInternal / topologyTotal).toBeGreaterThan(legacyTotal === 0 ? 1 : legacyCoLocated / legacyTotal);
  });

  it("merges small same-file functions and high-coupling siblings but preserves cross-package ownership", () => {
    const fixtures = loadFixtures();
    const sameFile = partitionGraphTask(fixtureInput(fixtures.find((fixture) => fixture.id === "same-file-functions")!));
    const shared = partitionGraphTask(fixtureInput(fixtures.find((fixture) => fixture.id === "shared-interface")!));
    const crossPackage = partitionGraphTask(fixtureInput(fixtures.find((fixture) => fixture.id === "cross-package")!));

    expect(sameFile.workUnits.some((unit) => unit.ownedNodeIds.includes("shared-first") && unit.ownedNodeIds.includes("shared-second"))).toBe(true);
    expect(shared.workUnits.some((unit) => unit.ownedNodeIds.includes("producer") && unit.ownedNodeIds.includes("consumer"))).toBe(true);
    expect(crossPackage.workUnits.some((unit) => unit.ownedNodeIds.includes("web-consumer") && unit.ownedNodeIds.includes("shared-api"))).toBe(false);
    expect(crossPackage.interfaceContracts.length + crossPackage.partitioning!.ignoredEdges.length).toBeGreaterThan(0);
  });

  it("turns an explicitly separated oversized dependency cycle into coordinated children plus an integration unit", () => {
    const fixture = loadFixtures().find((candidate) => candidate.id === "cycle")!;
    const base = fixtureInput(fixture);
    const input = fixtureInput(fixture, {
      constraints: {
        keepTogetherNodeGroups: [],
        separateNodePairs: [["cycle-alpha", "cycle-beta"]],
        explicitDependencies: [
          { beforeNodeId: "cycle-alpha", afterNodeId: "cycle-beta", reason: "alpha before beta" },
          { beforeNodeId: "cycle-beta", afterNodeId: "cycle-alpha", reason: "beta before alpha" }
        ],
        requestedInterfaceChangeEdgeIds: [],
        approvedIgnoredEdges: []
      },
      budgets: { ...base.budgets, mediumPartitionTokenLimit: 100 }
    });
    const result = partitionGraphTask(input);

    expect(result.partitioning!.sccResolutions).toContainEqual(
      expect.objectContaining({ resolution: "coordinated_integration", integrationWorkUnitId: expect.any(String) })
    );
    expect(result.workUnits.some((unit) => unit.title === "Cyclic contract integration" && unit.dependencyWorkUnitIds.length === 2)).toBe(true);
    expect(() => codingWorkflowDag(result)).not.toThrow();
  });

  it("bounds the task subgraph and records every omission reason", () => {
    const fixture = loadFixtures().find((candidate) => candidate.id === "independent-leaves")!;
    const base = fixtureInput(fixture);
    const input = fixtureInput(fixture, { budgets: { ...base.budgets, maxSubgraphNodes: base.targetNodeIds.length, maxSubgraphEdges: 1 } });
    const subgraph = buildTaskSubgraph(input);

    expect(subgraph.nodes.length).toBeLessThanOrEqual(input.budgets.maxSubgraphNodes);
    expect(subgraph.omissions.length).toBeGreaterThan(0);
    expect(subgraph.omissions.every((omission) => ["relevance", "budget", "unsupported", "stale", "index_incomplete"].includes(omission.reason))).toBe(true);
  });

  it("makes edge-policy changes explainable", () => {
    const fixture = loadFixtures().find((candidate) => candidate.id === "cross-package")!;
    const base = fixtureInput(fixture);
    const input = fixtureInput(fixture, {
      constraints: {
        ...base.constraints,
        requestedInterfaceChangeEdgeIds: ["consumer-calls-shared"]
      }
    });
    const result = partitionGraphTask(input);
    const classification = result.partitioning!.edgeClassifications.find((edge) => edge.edgeId === "consumer-calls-shared")!;

    expect(classification.classification).toBe("requires_before");
    expect(classification.reason).toMatch(/producer must complete before the consumer/);
  });
});

function codingWorkflowDag(result: ReturnType<typeof partitionGraphTask>): void {
  const byId = new Map(result.workUnits.map((unit) => [unit.id, unit]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error("cycle");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependencyId of byId.get(id)?.dependencyWorkUnitIds ?? []) visit(dependencyId);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of byId.keys()) visit(id);
}
