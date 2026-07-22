import { performance } from "node:perf_hooks";
import {
  agentStatusSchema,
  graphEdgeKindSchema,
  graphNodeKindSchema,
  type CodingAgentMode,
  type GraphEdge,
  type GraphNode
} from "@graphcode/graph-model";
import { z } from "zod";

export type LegacyPlanningGraph = { nodes: GraphNode[]; edges: GraphEdge[] };

const fixtureSourceSchema = z.object({
  path: z.string().min(1),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive()
});

const fixtureNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: graphNodeKindSchema,
  summary: z.string().default(""),
  parentId: z.string().nullable().default(null),
  attachedToId: z.string().nullable().default(null),
  source: fixtureSourceSchema,
  agentStatus: agentStatusSchema.default("planning")
});

const fixtureEdgeSchema = z.object({
  id: z.string().min(1),
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  kind: graphEdgeKindSchema,
  label: z.string().nullable().default(null)
});

export const legacyWorkflowFixtureSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1),
    behavior: z.enum(["independent_leaves", "shared_interface", "same_file_functions", "cycle", "cross_package", "parent_integration"]),
    description: z.string().min(1),
    task: z.string().min(1),
    scopeNodeId: z.string().min(1),
    nodes: z.array(fixtureNodeSchema).min(1),
    edges: z.array(fixtureEdgeSchema).default([])
  })
  .superRefine((fixture, context) => {
    const nodeIds = new Set<string>();
    for (const node of fixture.nodes) {
      if (nodeIds.has(node.id)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate fixture node id: ${node.id}` });
      }
      nodeIds.add(node.id);
      if (node.source.endLine < node.source.startLine) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid source range for fixture node: ${node.id}` });
      }
    }
    if (!nodeIds.has(fixture.scopeNodeId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `Fixture scope node does not exist: ${fixture.scopeNodeId}` });
    }
    const edgeIds = new Set<string>();
    for (const edge of fixture.edges) {
      if (edgeIds.has(edge.id)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate fixture edge id: ${edge.id}` });
      }
      edgeIds.add(edge.id);
      if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `Fixture edge ${edge.id} has a missing endpoint.` });
      }
    }
  });

export type LegacyWorkflowFixture = z.infer<typeof legacyWorkflowFixtureSchema>;

export type LegacyPlanningChunkDiagnostic = {
  index: number;
  nodeIds: string[];
  edgeIds: string[];
  orphanEdgeIds: string[];
  promptCharacters: number;
  estimatedInputTokens: number;
};

export type LegacyPlanningChunkInspection = {
  chunks: LegacyPlanningChunkDiagnostic[];
  orphanEdgeIds: string[];
  coLocatedEdgeCount: number;
  endpointCoLocationRatio: number;
};

export function buildLegacyRoundRobinPlanningChunks(graph: LegacyPlanningGraph, parallelLimit: number): LegacyPlanningGraph[] {
  const workerCount = Math.max(1, Math.min(parallelLimit, Math.max(graph.nodes.length, 1)));
  const chunks: LegacyPlanningGraph[] = Array.from({ length: workerCount }, () => ({ nodes: [], edges: [] }));
  graph.nodes.forEach((node, index) => {
    chunks[index % workerCount].nodes.push(node);
  });
  graph.edges.forEach((edge, index) => {
    chunks[index % workerCount].edges.push(edge);
  });
  return chunks.filter((chunk) => chunk.nodes.length > 0 || chunk.edges.length > 0);
}

export function inspectLegacyRoundRobinPlanningChunks(graph: LegacyPlanningGraph, parallelLimit: number): LegacyPlanningChunkInspection {
  const chunks = buildLegacyRoundRobinPlanningChunks(graph, parallelLimit).map((chunk, index) => {
    const nodeIds = new Set(chunk.nodes.map((node) => node.id));
    const orphanEdgeIds = chunk.edges
      .filter((edge) => !nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId))
      .map((edge) => edge.id);
    const promptCharacters =
      chunk.nodes.reduce((count, node) => count + `${node.id}:${node.name}:${node.kind}:${node.summary}\n`.length, 0) +
      chunk.edges.reduce((count, edge) => count + `${edge.id}:${edge.sourceNodeId}->${edge.targetNodeId}:${edge.kind}:${edge.label ?? ""}\n`.length, 0);
    return {
      index,
      nodeIds: [...nodeIds],
      edgeIds: chunk.edges.map((edge) => edge.id),
      orphanEdgeIds,
      promptCharacters,
      estimatedInputTokens: estimateLegacyInputTokens(promptCharacters)
    };
  });
  const orphanEdgeIds = [...new Set(chunks.flatMap((chunk) => chunk.orphanEdgeIds))];
  const coLocatedEdgeCount = chunks.reduce((count, chunk) => count + chunk.edgeIds.length - chunk.orphanEdgeIds.length, 0);
  return {
    chunks,
    orphanEdgeIds,
    coLocatedEdgeCount,
    endpointCoLocationRatio: graph.edges.length === 0 ? 1 : coLocatedEdgeCount / graph.edges.length
  };
}

export function fixtureToLegacyPlanningGraph(fixture: LegacyWorkflowFixture, projectId = fixture.id): LegacyPlanningGraph {
  const childCountByNodeId = new Map<string, number>();
  for (const node of fixture.nodes) {
    for (const ownerId of [node.parentId, node.attachedToId]) {
      if (ownerId) {
        childCountByNodeId.set(ownerId, (childCountByNodeId.get(ownerId) ?? 0) + 1);
      }
    }
  }
  const nodes: GraphNode[] = fixture.nodes.map((node, index) => {
    const childCount = childCountByNodeId.get(node.id) ?? 0;
    return {
      id: node.id,
      projectId,
      kind: node.kind,
      name: node.name,
      summary: node.summary,
      code: {
        context: node.summary,
        directory: node.source.path,
        startLine: node.source.startLine,
        endLine: node.source.endLine,
        language: "typescript"
      },
      parentId: node.parentId,
      attachedToId: node.attachedToId,
      customTypeId: null,
      source: node.source,
      execution: {
        testScriptDirectory: null,
        virtualEnvironment: null,
        workingDirectory: null,
        setupCommand: null,
        testCommand: null
      },
      position: { x: (index % 4) * 260, y: Math.floor(index / 4) * 180 },
      size: { width: 224, height: 120 },
      childCount,
      hasChildren: childCount > 0,
      agentStatus: node.agentStatus,
      gitStatus: null,
      tags: [],
      createdAt: "fixture",
      updatedAt: "fixture"
    };
  });
  const edges: GraphEdge[] = fixture.edges.map((edge) => ({
    id: edge.id,
    projectId,
    kind: edge.kind,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    label: edge.label,
    codeContext: edge.label ?? "",
    source: { path: null, startLine: null, endLine: null },
    color: "#64748b",
    animated: false,
    pointingEnabled: true,
    pointingDirection: "source_to_target",
    agentStatus: "none",
    gitStatus: null,
    tags: [],
    createdAt: "fixture"
  }));
  return { nodes, edges };
}

export function estimateLegacyInputTokens(characters: number): number {
  return Math.ceil(Math.max(0, characters) / 4);
}

export type LegacyScheduleItem = {
  id: string;
  conflictGroup: string;
  mode: CodingAgentMode;
  contextCharacters: number;
};

export type LegacyScheduleBenchmark = {
  execution: "serial" | "parallel_conflict_groups";
  itemCount: number;
  makespanMs: number;
  peakConcurrency: number;
  theoreticalWaves: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCost: null;
  modeDistribution: Record<CodingAgentMode, number>;
  serializedConflictPairs: number;
  conflictRate: number;
  proposalResult: { succeeded: number; failed: number };
  testResult: "not_recorded_by_legacy_workflow";
  integrationResult: "manual_layer_apply_only";
};

export type DelayedFakeProvider = {
  invoke(itemId: string): Promise<string>;
  snapshot(): { calls: number; peakConcurrency: number };
};

export function createDelayedFakeProvider(delayMs: number): DelayedFakeProvider {
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    throw new RangeError("Delayed fake provider delay must be a non-negative number.");
  }
  let active = 0;
  let calls = 0;
  let peakConcurrency = 0;
  return {
    async invoke(itemId) {
      calls += 1;
      active += 1;
      peakConcurrency = Math.max(peakConcurrency, active);
      try {
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
        return `fake proposal for ${itemId}`;
      } finally {
        active -= 1;
      }
    },
    snapshot: () => ({ calls, peakConcurrency })
  };
}

export async function benchmarkLegacyConflictSchedule(
  items: LegacyScheduleItem[],
  options: { execution: LegacyScheduleBenchmark["execution"]; delayMs: number }
): Promise<LegacyScheduleBenchmark> {
  const provider = createDelayedFakeProvider(options.delayMs);
  const startedAt = performance.now();
  if (options.execution === "serial") {
    for (const item of items) {
      await provider.invoke(item.id);
    }
  } else {
    const groups = new Map<string, LegacyScheduleItem[]>();
    for (const item of items) {
      const group = groups.get(item.conflictGroup) ?? [];
      group.push(item);
      groups.set(item.conflictGroup, group);
    }
    await Promise.all(
      [...groups.values()].map(async (group) => {
        for (const item of group) {
          await provider.invoke(item.id);
        }
      })
    );
  }
  const groups = new Map<string, number>();
  for (const item of items) {
    groups.set(item.conflictGroup, (groups.get(item.conflictGroup) ?? 0) + 1);
  }
  const totalPairs = (items.length * (items.length - 1)) / 2;
  const serializedConflictPairs = [...groups.values()].reduce((total, size) => total + (size * (size - 1)) / 2, 0);
  const modeDistribution: Record<CodingAgentMode, number> = { small: 0, medium: 0, large: 0 };
  for (const item of items) {
    modeDistribution[item.mode] += 1;
  }
  const providerMetrics = provider.snapshot();
  return {
    execution: options.execution,
    itemCount: items.length,
    makespanMs: performance.now() - startedAt,
    peakConcurrency: providerMetrics.peakConcurrency,
    theoreticalWaves: options.execution === "serial" ? items.length : Math.max(0, ...groups.values()),
    estimatedInputTokens: items.reduce((total, item) => total + estimateLegacyInputTokens(item.contextCharacters), 0),
    estimatedOutputTokens: items.length * 32,
    estimatedCost: null,
    modeDistribution,
    serializedConflictPairs,
    conflictRate: totalPairs === 0 ? 0 : serializedConflictPairs / totalPairs,
    proposalResult: { succeeded: providerMetrics.calls, failed: 0 },
    testResult: "not_recorded_by_legacy_workflow",
    integrationResult: "manual_layer_apply_only"
  };
}
