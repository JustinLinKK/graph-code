import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  benchmarkLegacyCodingContexts,
  benchmarkLegacyConflictSchedule,
  fixtureToLegacyPlanningGraph,
  inspectLegacyRoundRobinPlanningChunks,
  legacyWorkflowFixtureSchema,
  type LegacyCodingContextSize,
  type LegacyScheduleBenchmark,
  type LegacyScheduleItem,
  type LegacyWorkflowFixture
} from "@graphcode/agent-runtime";
import type { CodingAgentMode, CodingWorkflow } from "@graphcode/graph-model";
import { openDatabase } from "../db/connection";
import { GraphRepository } from "../db/repository";
import { migrate } from "../db/schema";

const DEFAULT_FIXTURE_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../tests/fixtures/parallel-multiscale-agent");

type FixtureWorkflowBaseline = {
  fixtureId: string;
  behavior: LegacyWorkflowFixture["behavior"];
  planning: {
    chunks: number;
    nodes: number;
    edges: number;
    orphanEdgeIds: string[];
    endpointCoLocationRatio: number;
    promptCharacters: number;
    estimatedInputTokens: number;
  };
  workflow: {
    items: number;
    layers: number;
    conflictGroups: number;
    sameFileParallelPairs: string[][];
    relationshipEdgesIgnoredByLayers: string[];
    modeDistribution: Record<CodingAgentMode, number>;
    routingReasons: Array<{ nodeId: string; recommendedMode: CodingAgentMode; reason: string }>;
  };
};

export type AgentOrchestrationBaseline = {
  schemaVersion: 1;
  generatedAt: string;
  machine: { platform: string; architecture: string; nodeVersion: string; cpuCount: number };
  invariant: string;
  fixtureCount: number;
  fixtures: FixtureWorkflowBaseline[];
  codingContext: LegacyCodingContextSize[];
  modelTierDistribution: Record<CodingAgentMode, number>;
  schedule: {
    delayMs: number;
    serial: LegacyScheduleBenchmark;
    parallel: LegacyScheduleBenchmark;
    observedSpeedup: number;
  };
  currentOutcomeCoverage: {
    proposals: LegacyScheduleBenchmark["proposalResult"];
    tests: LegacyScheduleBenchmark["testResult"];
    integration: LegacyScheduleBenchmark["integrationResult"];
    estimatedCost: null;
  };
  limitations: string[];
};

export async function runAgentOrchestrationBaseline(options: {
  delayMs?: number;
  fixtureDirectory?: string;
} = {}): Promise<AgentOrchestrationBaseline> {
  const delayMs = options.delayMs ?? 25;
  const fixtures = loadFixtures(options.fixtureDirectory ?? DEFAULT_FIXTURE_DIRECTORY);
  const fixtureResults: FixtureWorkflowBaseline[] = [];
  let codingContext: LegacyCodingContextSize[] = [];
  let scheduleItems: LegacyScheduleItem[] = [];

  for (const fixture of fixtures) {
    const measured = await measureFixture(fixture);
    fixtureResults.push(measured.result);
    if (fixture.behavior === "independent_leaves") {
      codingContext = measured.codingContext;
      const contextByMode = new Map(codingContext.map((entry) => [entry.mode, entry.promptCharacters]));
      scheduleItems = measured.preview.items
        .filter((item) => item.layerIndex === 0)
        .map((item) => ({
          id: item.nodeId,
          conflictGroup: item.conflictGroup,
          mode: item.selectedMode,
          contextCharacters: contextByMode.get(item.selectedMode) ?? 0
        }));
    }
  }

  const serial = await benchmarkLegacyConflictSchedule(scheduleItems, { execution: "serial", delayMs });
  const parallel = await benchmarkLegacyConflictSchedule(scheduleItems, { execution: "parallel_conflict_groups", delayMs });
  const modelTierDistribution: Record<CodingAgentMode, number> = { small: 0, medium: 0, large: 0 };
  for (const fixture of fixtureResults) {
    for (const mode of ["small", "medium", "large"] as const) {
      modelTierDistribution[mode] += fixture.workflow.modeDistribution[mode];
    }
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    machine: {
      platform: process.platform,
      architecture: process.arch,
      nodeVersion: process.version,
      cpuCount: os.cpus().length
    },
    invariant:
      "GraphCode scales development by running graph-partitioned agents in parallel and routing each partition to the least expensive model capable of completing it safely; relationship edges define the contracts that make the parallel outputs integrable.",
    fixtureCount: fixtures.length,
    fixtures: fixtureResults,
    codingContext,
    modelTierDistribution,
    schedule: {
      delayMs,
      serial,
      parallel,
      observedSpeedup: parallel.makespanMs === 0 ? 0 : serial.makespanMs / parallel.makespanMs
    },
    currentOutcomeCoverage: {
      proposals: parallel.proposalResult,
      tests: parallel.testResult,
      integration: parallel.integrationResult,
      estimatedCost: null
    },
    limitations: [
      "The legacy workflow does not persist per-item token usage or configured provider prices, so token counts use the conservative four-characters-per-token fallback and cost remains null.",
      "The legacy workflow stores proposals but does not persist targeted test results or a deterministic integration verdict; those gaps are reported explicitly instead of inferred as success.",
      "MA-0 measures production behavior without changing scheduling, routing, context compilation, or application semantics."
    ]
  };
}

async function measureFixture(fixture: LegacyWorkflowFixture): Promise<{
  result: FixtureWorkflowBaseline;
  preview: CodingWorkflow;
  codingContext: LegacyCodingContextSize[];
}> {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), `graphcode-agent-baseline-${fixture.id}-`));
  const database = openDatabase(path.join(fixtureRoot, "baseline.sqlite"));
  try {
    migrate(database);
    const repository = new GraphRepository(database);
    const projectId = `baseline-${fixture.id}`;
    repository.createProject({ id: projectId, name: fixture.id, rootPath: fixtureRoot });
    for (const node of fixture.nodes) {
      repository.createNode({
        id: node.id,
        projectId,
        kind: node.kind,
        name: node.name,
        summary: node.summary,
        parentId: node.parentId,
        attachedToId: node.attachedToId,
        sourcePath: node.source.path,
        sourceStartLine: node.source.startLine,
        sourceEndLine: node.source.endLine,
        agentStatus: node.agentStatus
      });
    }
    for (const edge of fixture.edges) {
      repository.createEdge({
        id: edge.id,
        projectId,
        kind: edge.kind,
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: edge.targetNodeId,
        label: edge.label
      });
    }

    const graph = fixtureToLegacyPlanningGraph(fixture, projectId);
    const inspection = inspectLegacyRoundRobinPlanningChunks(graph, 4);
    const preview = repository.previewCodingWorkflow(projectId, fixture.scopeNodeId);
    const nodeById = new Map(fixture.nodes.map((node) => [node.id, node]));
    const itemByNodeId = new Map(preview.items.map((item) => [item.nodeId, item]));
    const sameFileParallelPairs: string[][] = [];
    for (let leftIndex = 0; leftIndex < preview.items.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < preview.items.length; rightIndex += 1) {
        const left = preview.items[leftIndex];
        const right = preview.items[rightIndex];
        if (
          nodeById.get(left.nodeId)?.source.path === nodeById.get(right.nodeId)?.source.path &&
          left.layerIndex === right.layerIndex &&
          left.conflictGroup !== right.conflictGroup
        ) {
          sameFileParallelPairs.push([left.nodeId, right.nodeId]);
        }
      }
    }
    const relationshipEdgesIgnoredByLayers = fixture.edges
      .filter((edge) => {
        const sourceItem = itemByNodeId.get(edge.sourceNodeId);
        const targetItem = itemByNodeId.get(edge.targetNodeId);
        return sourceItem && targetItem && sourceItem.layerIndex === targetItem.layerIndex;
      })
      .map((edge) => edge.id);
    const modeDistribution: Record<CodingAgentMode, number> = { small: 0, medium: 0, large: 0 };
    for (const item of preview.items) {
      modeDistribution[item.recommendedMode] += 1;
    }
    const planningPromptCharacters = inspection.chunks.reduce((total, chunk) => total + chunk.promptCharacters, 0);
    const target = preview.items.find((item) => item.layerIndex === 0) ?? preview.items[0];
    const detail = target ? repository.getNodeDetail(target.nodeId) : null;
    const scopeCanvas = target ? await repository.getCanvasGraph({ projectId, rootNodeId: target.nodeId, includeAttachments: true }) : null;
    const source = Array.from({ length: 900 }, (_, index) => `export const fixtureValue${index} = ${index};`).join("\n");
    const context = detail
      ? benchmarkLegacyCodingContexts({
          detail,
          graph,
          scopeCanvas,
          source,
          gitStatus: "",
          execution: repository.resolveExecutionMetadata(detail.node.id),
          recommendedModeReason: target?.modeReason,
          prompt: fixture.task,
          coverageNotice: "Index coverage: complete for this deterministic fixture."
        })
      : [];

    return {
      result: {
        fixtureId: fixture.id,
        behavior: fixture.behavior,
        planning: {
          chunks: inspection.chunks.length,
          nodes: graph.nodes.length,
          edges: graph.edges.length,
          orphanEdgeIds: inspection.orphanEdgeIds,
          endpointCoLocationRatio: inspection.endpointCoLocationRatio,
          promptCharacters: planningPromptCharacters,
          estimatedInputTokens: Math.ceil(planningPromptCharacters / 4)
        },
        workflow: {
          items: preview.items.length,
          layers: new Set(preview.items.map((item) => item.layerIndex)).size,
          conflictGroups: new Set(preview.items.map((item) => item.conflictGroup)).size,
          sameFileParallelPairs,
          relationshipEdgesIgnoredByLayers,
          modeDistribution,
          routingReasons: preview.items.map((item) => ({ nodeId: item.nodeId, recommendedMode: item.recommendedMode, reason: item.modeReason }))
        }
      },
      preview,
      codingContext: context
    };
  } finally {
    database.close();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function loadFixtures(fixtureDirectory: string): LegacyWorkflowFixture[] {
  return fs
    .readdirSync(fixtureDirectory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => legacyWorkflowFixtureSchema.parse(JSON.parse(fs.readFileSync(path.join(fixtureDirectory, name), "utf8"))));
}

type CliOptions = {
  delayMs: number;
  format: "json" | "table" | "both";
  outputPath: string | null;
};

function parseCliOptions(args: string[]): CliOptions {
  const delayMs = Number(optionValue(args, "--delay-ms") ?? "25");
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    throw new Error("--delay-ms must be a non-negative number.");
  }
  const format = optionValue(args, "--format") ?? "both";
  if (format !== "json" && format !== "table" && format !== "both") {
    throw new Error("--format must be json, table, or both.");
  }
  return { delayMs, format, outputPath: optionValue(args, "--output") };
}

function optionValue(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
}

function renderTable(result: AgentOrchestrationBaseline): string {
  const context = result.codingContext.map((entry) => `${entry.mode}=${entry.promptCharacters} chars/${entry.estimatedInputTokens} tokens`).join(", ");
  return [
    `Fixtures: ${result.fixtureCount}`,
    `Legacy planning orphan edges: ${result.fixtures.reduce((total, fixture) => total + fixture.planning.orphanEdgeIds.length, 0)}`,
    `Relationship edges ignored by hierarchy layers: ${result.fixtures.reduce((total, fixture) => total + fixture.workflow.relationshipEdgesIgnoredByLayers.length, 0)}`,
    `Same-file parallel pairs: ${result.fixtures.reduce((total, fixture) => total + fixture.workflow.sameFileParallelPairs.length, 0)}`,
    `Coding context: ${context}`,
    `Model tiers: small=${result.modelTierDistribution.small}, medium=${result.modelTierDistribution.medium}, large=${result.modelTierDistribution.large}`,
    `Delayed fake provider: serial=${result.schedule.serial.makespanMs.toFixed(1)}ms, parallel=${result.schedule.parallel.makespanMs.toFixed(1)}ms, speedup=${result.schedule.observedSpeedup.toFixed(2)}x`
  ].join("\n");
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const result = await runAgentOrchestrationBaseline({ delayMs: options.delayMs });
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (options.outputPath) {
    const outputPath = path.resolve(options.outputPath);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, json);
  }
  if (options.format === "table" || options.format === "both") {
    process.stdout.write(`${renderTable(result)}\n`);
  }
  if (options.format === "json" || options.format === "both") {
    process.stdout.write(json);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
