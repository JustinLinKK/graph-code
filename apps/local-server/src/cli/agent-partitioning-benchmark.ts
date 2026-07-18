import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  fixtureToLegacyPlanningGraph,
  inspectLegacyRoundRobinPlanningChunks,
  legacyWorkflowFixtureSchema,
  type LegacyWorkflowFixture
} from "@graphcode/agent-runtime";
import type { CodingAgentMode, CodingWorkflowOrchestration } from "@graphcode/graph-model";
import {
  DEFAULT_PARTITION_BUDGETS,
  defaultWorkflowEdgePolicy,
  graphPartitionInputSchema,
  partitionGraphTask,
  type GraphPartitionInput
} from "@graphcode/graph-query";

const DEFAULT_FIXTURE_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../tests/fixtures/parallel-multiscale-agent");

type PartitionFixtureBenchmark = {
  fixtureId: string;
  behavior: LegacyWorkflowFixture["behavior"];
  targets: number;
  relationshipEdges: number;
  legacy: {
    chunks: number;
    coLocatedRelationshipEdges: number;
    endpointCoLocationRatio: number;
    orphanEdgeIds: string[];
  };
  topology: {
    workUnits: number;
    layers: number;
    internalRelationshipEdges: number;
    cutRelationshipEdges: number;
    relatedEdgeLocalityRatio: number;
    boundaryEdges: number;
    interfaceContracts: number;
    ignoredEdges: Array<{ edgeId: string; reason: string }>;
    omissions: number;
    selectedScaleDistribution: Record<CodingAgentMode, number>;
  };
  validation: {
    uniqueTargetOwnership: boolean;
    completeBoundaryCoverage: boolean;
    acyclicDependencies: boolean;
    deterministicOutput: boolean;
  };
};

export type AgentPartitioningBenchmark = {
  schemaVersion: 1;
  generatedAt: string;
  machine: { platform: string; architecture: string; nodeVersion: string; cpuCount: number };
  fixtureCount: number;
  fixtures: PartitionFixtureBenchmark[];
  summary: {
    relationshipEdges: number;
    legacyCoLocatedRelationshipEdges: number;
    topologyInternalRelationshipEdges: number;
    legacyEndpointCoLocationRatio: number;
    topologyRelatedEdgeLocalityRatio: number;
    localityImprovementPercentagePoints: number;
    boundaryEdges: number;
    interfaceContracts: number;
    ignoredEdges: number;
    allTargetsUniquelyOwned: boolean;
    allBoundaryEdgesCovered: boolean;
    allDependencyGraphsAcyclic: boolean;
    allOutputsDeterministic: boolean;
  };
  limitations: string[];
};

export function runAgentPartitioningBenchmark(options: { fixtureDirectory?: string } = {}): AgentPartitioningBenchmark {
  const fixtures = loadFixtures(options.fixtureDirectory ?? DEFAULT_FIXTURE_DIRECTORY);
  const results = fixtures.map(measureFixture);
  const relationshipEdges = results.reduce((total, fixture) => total + fixture.relationshipEdges, 0);
  const legacyCoLocatedRelationshipEdges = results.reduce((total, fixture) => total + fixture.legacy.coLocatedRelationshipEdges, 0);
  const topologyInternalRelationshipEdges = results.reduce((total, fixture) => total + fixture.topology.internalRelationshipEdges, 0);
  const topologyRelatedEdges = results.reduce(
    (total, fixture) => total + fixture.topology.internalRelationshipEdges + fixture.topology.cutRelationshipEdges,
    0
  );
  const legacyEndpointCoLocationRatio = relationshipEdges === 0 ? 1 : legacyCoLocatedRelationshipEdges / relationshipEdges;
  const topologyRelatedEdgeLocalityRatio = topologyRelatedEdges === 0 ? 1 : topologyInternalRelationshipEdges / topologyRelatedEdges;

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    machine: {
      platform: process.platform,
      architecture: process.arch,
      nodeVersion: process.version,
      cpuCount: os.cpus().length
    },
    fixtureCount: results.length,
    fixtures: results,
    summary: {
      relationshipEdges,
      legacyCoLocatedRelationshipEdges,
      topologyInternalRelationshipEdges,
      legacyEndpointCoLocationRatio,
      topologyRelatedEdgeLocalityRatio,
      localityImprovementPercentagePoints: (topologyRelatedEdgeLocalityRatio - legacyEndpointCoLocationRatio) * 100,
      boundaryEdges: results.reduce((total, fixture) => total + fixture.topology.boundaryEdges, 0),
      interfaceContracts: results.reduce((total, fixture) => total + fixture.topology.interfaceContracts, 0),
      ignoredEdges: results.reduce((total, fixture) => total + fixture.topology.ignoredEdges.length, 0),
      allTargetsUniquelyOwned: results.every((fixture) => fixture.validation.uniqueTargetOwnership),
      allBoundaryEdgesCovered: results.every((fixture) => fixture.validation.completeBoundaryCoverage),
      allDependencyGraphsAcyclic: results.every((fixture) => fixture.validation.acyclicDependencies),
      allOutputsDeterministic: results.every((fixture) => fixture.validation.deterministicOutput)
    },
    limitations: [
      "This MA-2 benchmark measures deterministic partition structure and fixture locality; it does not invoke providers or claim production scheduling speedup.",
      "The topology metric covers relationship edges whose endpoints are task-owned; omissions remain explicit and are not counted as successful localization.",
      "The six-fixture corpus is a regression benchmark, not a representative production-quality distribution."
    ]
  };
}

function measureFixture(fixture: LegacyWorkflowFixture): PartitionFixtureBenchmark {
  const input = fixturePartitionInput(fixture);
  const legacy = inspectLegacyRoundRobinPlanningChunks({ nodes: input.nodes, edges: input.edges }, input.maximumConcurrency);
  const topology = partitionGraphTask(input);
  const repeated = partitionGraphTask(input);
  const ownerCounts = new Map(input.targetNodeIds.map((nodeId) => [nodeId, 0]));
  for (const unit of topology.workUnits) {
    for (const nodeId of unit.ownedNodeIds) {
      if (ownerCounts.has(nodeId)) ownerCounts.set(nodeId, ownerCounts.get(nodeId)! + 1);
    }
  }
  const coveredBoundaryEdgeIds = new Set([
    ...topology.interfaceContracts.map((contract) => contract.edgeId),
    ...(topology.partitioning?.ignoredEdges.map((edge) => edge.edgeId) ?? [])
  ]);
  const selectedScaleDistribution: Record<CodingAgentMode, number> = { small: 0, medium: 0, large: 0 };
  for (const unit of topology.workUnits) selectedScaleDistribution[unit.selectedScale] += 1;

  return {
    fixtureId: fixture.id,
    behavior: fixture.behavior,
    targets: input.targetNodeIds.length,
    relationshipEdges: input.edges.length,
    legacy: {
      chunks: legacy.chunks.length,
      coLocatedRelationshipEdges: legacy.coLocatedEdgeCount,
      endpointCoLocationRatio: legacy.endpointCoLocationRatio,
      orphanEdgeIds: legacy.orphanEdgeIds
    },
    topology: {
      workUnits: topology.workUnits.length,
      layers: new Set(topology.workUnits.map((unit) => unit.layerIndex)).size,
      internalRelationshipEdges: topology.partitioning?.internalRelationshipEdges ?? 0,
      cutRelationshipEdges: topology.partitioning?.cutRelationshipEdges ?? 0,
      relatedEdgeLocalityRatio: topology.partitioning?.relatedEdgeLocalityRatio ?? 1,
      boundaryEdges: topology.boundaryEdges.length,
      interfaceContracts: topology.interfaceContracts.length,
      ignoredEdges: topology.partitioning?.ignoredEdges.map((edge) => ({ edgeId: edge.edgeId, reason: edge.reason })) ?? [],
      omissions: topology.partitioning?.omissions.length ?? 0,
      selectedScaleDistribution
    },
    validation: {
      uniqueTargetOwnership: [...ownerCounts.values()].every((count) => count === 1),
      completeBoundaryCoverage: topology.boundaryEdges.every((edge) => coveredBoundaryEdgeIds.has(edge.id)),
      acyclicDependencies: hasAcyclicDependencies(topology),
      deterministicOutput: JSON.stringify(topology) === JSON.stringify(repeated)
    }
  };
}

export function fixturePartitionInput(fixture: LegacyWorkflowFixture): GraphPartitionInput {
  const projectId = `partition-benchmark-${fixture.id}`;
  const graph = fixtureToLegacyPlanningGraph(fixture, projectId);
  const targetNodeIds = graph.nodes.filter((node) => node.agentStatus === "planning").map((node) => node.id).sort();
  return graphPartitionInputSchema.parse({
    workflowId: `partition-benchmark-workflow-${fixture.id}`,
    projectId,
    revision: {
      indexRevision: "fixture-index-1",
      workspaceRevision: "fixture-workspace-1",
      graphRevision: 1,
      sourceHashes: Object.fromEntries(graph.nodes.map((node) => [node.source.path, `fixture-${node.id}`])),
      contextCompilerVersion: "uncompiled-v1",
      routingFeatureVersion: "partition-preview-v1",
      capturedAt: "2026-07-18T12:00:00.000Z"
    },
    indexState: "complete",
    scopeNodeId: fixture.scopeNodeId,
    targetNodeIds,
    targetHints: targetNodeIds.map((nodeId) => ({
      nodeId,
      recommendedScale: "small",
      selectedScale: "small",
      reason: "Deterministic fixture routing hint."
    })),
    task: fixture.task,
    nodes: graph.nodes,
    edges: graph.edges,
    maximumConcurrency: 4,
    budgets: DEFAULT_PARTITION_BUDGETS,
    policy: defaultWorkflowEdgePolicy(),
    constraints: {}
  });
}

function hasAcyclicDependencies(orchestration: CodingWorkflowOrchestration): boolean {
  const byId = new Map(orchestration.workUnits.map((unit) => [unit.id, unit]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (workUnitId: string): boolean => {
    if (visiting.has(workUnitId)) return false;
    if (visited.has(workUnitId)) return true;
    visiting.add(workUnitId);
    for (const dependencyId of byId.get(workUnitId)?.dependencyWorkUnitIds ?? []) {
      if (!visit(dependencyId)) return false;
    }
    visiting.delete(workUnitId);
    visited.add(workUnitId);
    return true;
  };
  return [...byId.keys()].every(visit);
}

function loadFixtures(fixtureDirectory: string): LegacyWorkflowFixture[] {
  return fs
    .readdirSync(fixtureDirectory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => legacyWorkflowFixtureSchema.parse(JSON.parse(fs.readFileSync(path.join(fixtureDirectory, name), "utf8"))));
}

type CliOptions = { format: "json" | "table" | "both"; outputPath: string | null };

function parseCliOptions(args: string[]): CliOptions {
  const format = optionValue(args, "--format") ?? "both";
  if (format !== "json" && format !== "table" && format !== "both") throw new Error("--format must be json, table, or both.");
  return { format, outputPath: optionValue(args, "--output") };
}

function optionValue(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
}

function renderTable(result: AgentPartitioningBenchmark): string {
  const summary = result.summary;
  return [
    `Fixtures: ${result.fixtureCount}`,
    `Relationship locality: legacy=${summary.legacyCoLocatedRelationshipEdges}/${summary.relationshipEdges} (${(summary.legacyEndpointCoLocationRatio * 100).toFixed(1)}%), topology=${summary.topologyInternalRelationshipEdges}/${summary.relationshipEdges} (${(summary.topologyRelatedEdgeLocalityRatio * 100).toFixed(1)}%)`,
    `Locality delta: ${summary.localityImprovementPercentagePoints.toFixed(1)} percentage points`,
    `Boundary coverage: edges=${summary.boundaryEdges}, contracts=${summary.interfaceContracts}, ignored=${summary.ignoredEdges}, complete=${summary.allBoundaryEdgesCovered}`,
    `Validation: unique ownership=${summary.allTargetsUniquelyOwned}, acyclic=${summary.allDependencyGraphsAcyclic}, deterministic=${summary.allOutputsDeterministic}`
  ].join("\n");
}

function main(): void {
  const options = parseCliOptions(process.argv.slice(2));
  const result = runAgentPartitioningBenchmark();
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (options.outputPath) {
    const outputPath = path.resolve(options.outputPath);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, json);
  }
  if (options.format === "table" || options.format === "both") process.stdout.write(`${renderTable(result)}\n`);
  if (options.format === "json" || options.format === "both") process.stdout.write(json);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
