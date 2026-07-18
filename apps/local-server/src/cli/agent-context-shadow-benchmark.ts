import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  benchmarkLegacyCodingContexts,
  benchmarkLegacyReviewContexts,
  compareWorkUnitContextToLegacy,
  fixtureToLegacyPlanningGraph,
  legacyWorkflowFixtureSchema,
  renderWorkUnitContext,
  type LegacyWorkflowFixture
} from "@graphcode/agent-runtime";
import type { CodingAgentMode } from "@graphcode/graph-model";
import { openDatabase } from "../db/connection";
import { GraphRepository } from "../db/repository";
import { migrate } from "../db/schema";
import { compileStoredWorkUnitContext } from "../services/work-unit-context";

const DEFAULT_FIXTURE_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../tests/fixtures/parallel-multiscale-agent");

type ContextUnitBenchmark = {
  workUnitId: string;
  scale: CodingAgentMode;
  ownedNodes: number;
  sourceReads: number;
  exactOwnedSourceOrVisibleFailure: boolean;
  withinBudget: boolean;
  isolatedEstimatedTokens: number;
  legacyCodingEstimatedTokens: number;
  legacyReviewEstimatedTokens: number;
  legacyCodingEstimatedTokensByScale: Record<CodingAgentMode, number>;
  legacyReviewEstimatedTokensByScale: Record<CodingAgentMode, number>;
  codingTokenReductionRatio: number;
  reviewTokenReductionRatio: number;
  fullProjectReadUsedByCompiler: false;
};

type ContextFixtureBenchmark = {
  fixtureId: string;
  behavior: LegacyWorkflowFixture["behavior"];
  workUnits: ContextUnitBenchmark[];
};

export type AgentContextShadowBenchmark = {
  schemaVersion: 1;
  generatedAt: string;
  machine: { platform: string; architecture: string; nodeVersion: string; cpuCount: number };
  fixtureCount: number;
  workUnitCount: number;
  fixtures: ContextFixtureBenchmark[];
  summary: {
    isolatedEstimatedTokens: number;
    legacyCodingEstimatedTokens: number;
    legacyReviewEstimatedTokens: number;
    codingTokenReductionRatio: number;
    reviewTokenReductionRatio: number;
    allOwnedSourceVisible: boolean;
    allContextsWithinBudget: boolean;
    fullProjectReadUsedByCompiler: false;
    providerCalls: 0;
  };
  limitations: string[];
};

export async function runAgentContextShadowBenchmark(options: { fixtureDirectory?: string } = {}): Promise<AgentContextShadowBenchmark> {
  const fixtures = loadFixtures(options.fixtureDirectory ?? DEFAULT_FIXTURE_DIRECTORY);
  const results: ContextFixtureBenchmark[] = [];
  for (const fixture of fixtures) results.push(await measureFixture(fixture));
  const units = results.flatMap((fixture) => fixture.workUnits);
  const isolatedEstimatedTokens = sum(units.map((unit) => unit.isolatedEstimatedTokens));
  const legacyCodingEstimatedTokens = sum(units.map((unit) => unit.legacyCodingEstimatedTokens));
  const legacyReviewEstimatedTokens = sum(units.map((unit) => unit.legacyReviewEstimatedTokens));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    machine: { platform: process.platform, architecture: process.arch, nodeVersion: process.version, cpuCount: os.cpus().length },
    fixtureCount: results.length,
    workUnitCount: units.length,
    fixtures: results,
    summary: {
      isolatedEstimatedTokens,
      legacyCodingEstimatedTokens,
      legacyReviewEstimatedTokens,
      codingTokenReductionRatio: reductionRatio(legacyCodingEstimatedTokens, isolatedEstimatedTokens),
      reviewTokenReductionRatio: reductionRatio(legacyReviewEstimatedTokens, isolatedEstimatedTokens),
      allOwnedSourceVisible: units.every((unit) => unit.exactOwnedSourceOrVisibleFailure),
      allContextsWithinBudget: units.every((unit) => unit.withinBudget),
      fullProjectReadUsedByCompiler: false,
      providerCalls: 0
    },
    limitations: [
      "Shadow mode compiles contexts and legacy prompts but never invokes a provider or measures model quality.",
      "Token counts use the conservative four-characters-per-token fallback because no provider tokenizer is configured for this fixture run.",
      "Synthetic fixture source preserves declared line ranges; it is structural context evidence rather than a production task corpus."
    ]
  };
}

async function measureFixture(fixture: LegacyWorkflowFixture): Promise<ContextFixtureBenchmark> {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), `graphcode-agent-context-${fixture.id}-`));
  const database = openDatabase(path.join(fixtureRoot, "context.sqlite"));
  try {
    migrate(database);
    const repository = new GraphRepository(database);
    const projectId = `context-${fixture.id}`;
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
    const sources = syntheticFixtureSources(fixture);
    const sourceHashes = Object.fromEntries([...sources.keys()].map((sourcePath) => [sourcePath, `fixture-hash:${sourcePath}`]));
    const preview = repository.previewGraphPartitionedCodingWorkflow(projectId, fixture.scopeNodeId, {
      indexRevision: "fixture-index-1",
      workspaceRevision: "fixture-workspace-1",
      graphRevision: repository.currentGraphRevision(projectId),
      indexState: "complete",
      sourceHashes,
      capturedAt: "2026-07-18T12:00:00.000Z"
    });
    const orchestration = preview.orchestration!;
    const graph = fixtureToLegacyPlanningGraph(fixture, projectId);
    const workUnits: ContextUnitBenchmark[] = [];
    for (const workUnit of orchestration.workUnits) {
      const context = await compileStoredWorkUnitContext({
        repository,
        projectId,
        workflowId: preview.id,
        workUnitId: workUnit.id,
        task: fixture.task,
        observedRevision: orchestration.revision,
        indexState: "complete",
        readSource: async (sourcePath) => sources.get(sourcePath) ?? null,
        compiledAt: "2026-07-18T13:00:00.000Z"
      });
      const targetNodeId = workUnit.ownedNodeIds[0];
      const targetNode = targetNodeId ? repository.getNode(targetNodeId) : repository.getNode(fixture.scopeNodeId);
      const detail = repository.getNodeDetail(targetNode.id);
      const scopeCanvas = await repository.getCanvasGraph({ projectId, rootNodeId: targetNode.id, includeAttachments: true }).catch(() => null);
      const targetSourcePath = targetNode.source.path ?? targetNode.code.directory;
      const source = targetSourcePath ? sources.get(targetSourcePath) ?? "" : "";
      const execution = repository.resolveExecutionMetadata(targetNode.id);
      const coverageNotice = "Index coverage: COMPLETE deterministic fixture revision.";
      const legacyCodingContexts = benchmarkLegacyCodingContexts({
        detail,
        graph,
        scopeCanvas,
        source,
        gitStatus: "",
        execution,
        prompt: fixture.task,
        coverageNotice
      });
      const legacyReviewContexts = benchmarkLegacyReviewContexts({
        targetRun: null,
        detail,
        graph,
        scopeCanvas,
        source,
        gitStatus: "",
        execution,
        diff: "",
        coverageNotice
      });
      const legacyCoding = legacyCodingContexts.find((entry) => entry.mode === workUnit.selectedScale)!;
      const legacyReview = legacyReviewContexts.find((entry) => entry.mode === workUnit.selectedScale)!;
      const comparison = compareWorkUnitContextToLegacy(context, {
        legacyCodingPromptCharacters: legacyCoding.promptCharacters,
        legacyReviewPromptCharacters: legacyReview.promptCharacters
      });
      const rendered = renderWorkUnitContext(context, { provider: "generic", purpose: "coding" });
      workUnits.push({
        workUnitId: workUnit.id,
        scale: workUnit.selectedScale,
        ownedNodes: workUnit.ownedNodeIds.length,
        sourceReads: context.provenance.sourceReads,
        exactOwnedSourceOrVisibleFailure: workUnit.ownedNodeIds.every(
          (nodeId) =>
            context.sources.some((entry) => entry.symbolId === nodeId && entry.role === "owned" && entry.exact && entry.availability === "present") ||
            context.omissions.some(
              (omission) => omission.entityType === "source" && omission.entityId === nodeId && omission.required && ["unavailable", "stale", "unsupported"].includes(omission.reason)
            )
        ),
        withinBudget: rendered.estimatedInputTokens <= context.budget.maxInputTokens,
        isolatedEstimatedTokens: comparison.isolatedEstimatedTokens,
        legacyCodingEstimatedTokens: legacyCoding.estimatedInputTokens,
        legacyReviewEstimatedTokens: legacyReview.estimatedInputTokens,
        legacyCodingEstimatedTokensByScale: Object.fromEntries(
          legacyCodingContexts.map((entry) => [entry.mode, entry.estimatedInputTokens])
        ) as Record<CodingAgentMode, number>,
        legacyReviewEstimatedTokensByScale: Object.fromEntries(
          legacyReviewContexts.map((entry) => [entry.mode, entry.estimatedInputTokens])
        ) as Record<CodingAgentMode, number>,
        codingTokenReductionRatio: comparison.codingTokenReductionRatio,
        reviewTokenReductionRatio: comparison.reviewTokenReductionRatio,
        fullProjectReadUsedByCompiler: false
      });
    }
    return { fixtureId: fixture.id, behavior: fixture.behavior, workUnits };
  } finally {
    database.close();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function syntheticFixtureSources(fixture: LegacyWorkflowFixture): Map<string, string> {
  const maximumLineByPath = new Map<string, number>();
  for (const node of fixture.nodes) {
    maximumLineByPath.set(node.source.path, Math.max(maximumLineByPath.get(node.source.path) ?? 0, node.source.endLine));
  }
  return new Map(
    [...maximumLineByPath.entries()].map(([sourcePath, maximumLine]) => [
      sourcePath,
      Array.from({ length: maximumLine }, (_, index) => `// ${sourcePath} fixture line ${index + 1}`).join("\n")
    ])
  );
}

function loadFixtures(fixtureDirectory: string): LegacyWorkflowFixture[] {
  return fs
    .readdirSync(fixtureDirectory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => legacyWorkflowFixtureSchema.parse(JSON.parse(fs.readFileSync(path.join(fixtureDirectory, name), "utf8"))));
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function reductionRatio(legacyTokens: number, isolatedTokens: number): number {
  return legacyTokens === 0 ? 0 : (legacyTokens - isolatedTokens) / legacyTokens;
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

function renderTable(result: AgentContextShadowBenchmark): string {
  const summary = result.summary;
  return [
    `Fixtures: ${result.fixtureCount}, work units: ${result.workUnitCount}`,
    `Estimated tokens: isolated=${summary.isolatedEstimatedTokens}, legacy coding=${summary.legacyCodingEstimatedTokens}, legacy review=${summary.legacyReviewEstimatedTokens}`,
    `Token delta: coding=${(summary.codingTokenReductionRatio * 100).toFixed(1)}%, review=${(summary.reviewTokenReductionRatio * 100).toFixed(1)}%`,
    `Validation: owned source visible=${summary.allOwnedSourceVisible}, within budget=${summary.allContextsWithinBudget}, compiler full-project read=${summary.fullProjectReadUsedByCompiler}, provider calls=${summary.providerCalls}`
  ].join("\n");
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const result = await runAgentContextShadowBenchmark();
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
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
