import {
  codingWorkflowOrchestrationSchema,
  type CodingWorkUnit,
  type ContextBudget,
  type GraphEdge,
  type GraphNode,
  type WorkflowRevision
} from "@graphcode/graph-model";
import { describe, expect, it, vi } from "vitest";
import { compileWorkUnitContext, WorkUnitContextBudgetError, type WorkUnitContextCompilerInput } from "./compiler";
import { compareWorkUnitContextToLegacy, renderWorkUnitContext, validateActualWriteScopes } from "./render";
import { validateWorkUnitContextRetrievalRequest, WorkUnitContextEscalationRequiredError } from "./retrieval";
import { runCodingWorkUnitAgent } from "../index";

const revision: WorkflowRevision = {
  indexRevision: "index-1",
  workspaceRevision: "workspace-1",
  graphRevision: 4,
  sourceHashes: {
    "src/owned.ts": "hash-owned",
    "src/halo.ts": "hash-halo",
    "tests/owned.test.ts": "hash-test"
  },
  contextCompilerVersion: "uncompiled-v1",
  routingFeatureVersion: "partition-preview-v1",
  capturedAt: "2026-07-18T12:00:00.000Z"
};

const defaultBudget: ContextBudget = {
  maxInputTokens: 16000,
  maxSourceTokens: 8000,
  maxGraphTokens: 4000,
  maxContractTokens: 2000,
  maxFiles: 4,
  maxNodes: 64,
  maxEdges: 128
};

const sourceFiles: Record<string, string> = {
  "src/owned.ts": ["const before = 0;", "export function owned() {", "  return halo();", "}", "", "export const after = 1;"].join("\n"),
  "src/halo.ts": ["export function halo() {", "  return 1;", "}"].join("\n"),
  "tests/owned.test.ts": ["import { owned } from '../src/owned';", "it('works', () => expect(owned()).toBe(1));"].join("\n")
};

describe("MA-3 isolated work-unit context compiler", () => {
  it("compiles exact owned source, typed graph evidence, contracts, tests, provenance, and bounded provider prompts", async () => {
    const readSource = vi.fn(async (sourcePath: string) => sourceFiles[sourcePath] ?? null);
    const input = compilerInput({ readSource });
    const context = await compileWorkUnitContext(input);

    expect(context.sources.find((source) => source.symbolId === "owned")).toEqual(
      expect.objectContaining({
        role: "owned",
        availability: "present",
        exact: true,
        writable: true,
        startLine: 2,
        endLine: 4,
        content: ["export function owned() {", "  return halo();", "}"].join("\n")
      })
    );
    expect(context.sources.find((source) => source.role === "test")?.path).toBe("tests/owned.test.ts");
    expect(context.sources.some((source) => source.role === "halo")).toBe(false);
    expect(context.omissions).toContainEqual(expect.objectContaining({ entityType: "source", entityId: "halo", reason: "scale_policy" }));
    expect(context.nodes.every((node) => node.role && node.selectionReason)).toBe(true);
    expect(context.edges.every((edge) => edge.role && edge.selectionReason)).toBe(true);
    expect(context.contracts).toHaveLength(1);
    expect(context.tokenUsage.estimatedInputTokens).toBeLessThanOrEqual(context.budget.maxInputTokens);
    expect(context.provenance.scopedNodeCount).toBe(3);
    expect(readSource).toHaveBeenCalledTimes(2);

    for (const provider of ["generic", "openai", "anthropic", "google"] as const) {
      const rendered = renderWorkUnitContext(context, { provider, purpose: "coding" });
      expect(rendered.userPrompt).toContain("GRAPHCODE_WORK_UNIT_CONTEXT_JSON ma3-context-v1");
      expect(rendered.estimatedInputTokens).toBeLessThanOrEqual(context.budget.maxInputTokens);
    }
  });

  it("makes stale owned source visible without reading or presenting unverified content", async () => {
    const readSource = vi.fn(async (sourcePath: string) => sourceFiles[sourcePath] ?? null);
    const input = compilerInput({
      readSource,
      observedRevision: { ...revision, sourceHashes: { ...revision.sourceHashes, "src/owned.ts": "changed-hash" } }
    });
    const context = await compileWorkUnitContext(input);
    const ownedSource = context.sources.find((source) => source.symbolId === "owned");

    expect(ownedSource).toEqual(expect.objectContaining({ availability: "stale", content: "", fingerprint: null, writable: false }));
    expect(context.omissions).toContainEqual(expect.objectContaining({ entityType: "source", entityId: "owned", reason: "stale", required: true }));
    expect(readSource).not.toHaveBeenCalledWith("src/owned.ts");
  });

  it("trims optional halo evidence before owned source when graph budgets are tight", async () => {
    const input = compilerInput({ budget: { ...defaultBudget, maxNodes: 2 }, readSource: async (sourcePath) => sourceFiles[sourcePath] ?? null });
    const context = await compileWorkUnitContext(input);

    expect(context.nodes).toContainEqual(expect.objectContaining({ nodeId: "owned", role: "owned" }));
    expect(context.nodes).toHaveLength(2);
    expect(context.omissions).toContainEqual(expect.objectContaining({ entityType: "node", reason: "budget", required: false }));
    expect(context.tokenUsage.estimatedInputTokens).toBeLessThanOrEqual(context.budget.maxInputTokens);
  });

  it("requires escalation instead of silently truncating exact owned source", async () => {
    const input = compilerInput({
      budget: { ...defaultBudget, maxSourceTokens: 3 },
      readSource: async (sourcePath) => sourceFiles[sourcePath] ?? null
    });

    await expect(compileWorkUnitContext(input)).rejects.toBeInstanceOf(WorkUnitContextBudgetError);
  });

  it("rejects actual writes outside declared ownership, including broad small-tier file writes", () => {
    const workUnit = compilerInput().orchestration.workUnits[0];

    expect(() =>
      validateActualWriteScopes(workUnit, [{ path: "src/owned.ts", startLine: 2, endLine: 3, symbolId: "owned", permission: "edit" }])
    ).not.toThrow();
    expect(() =>
      validateActualWriteScopes(workUnit, [{ path: "src/owned.ts", startLine: null, endLine: null, symbolId: "owned", permission: "edit" }])
    ).toThrow(/small-tier escalation is required/);
    expect(() =>
      validateActualWriteScopes(workUnit, [{ path: "src/other.ts", startLine: 1, endLine: 2, symbolId: null, permission: "edit" }])
    ).toThrow(/outside its declared ownership/);
  });

  it("reports a shadow comparison without invoking a full-project graph read", async () => {
    const context = await compileWorkUnitContext(compilerInput({ readSource: async (sourcePath) => sourceFiles[sourcePath] ?? null }));
    const comparison = compareWorkUnitContextToLegacy(context, {
      legacyCodingPromptCharacters: 20000,
      legacyReviewPromptCharacters: 24000
    });

    expect(comparison.fullProjectReadUsed).toBe(false);
    expect(comparison.isolatedEstimatedTokens).toBe(context.tokenUsage.estimatedInputTokens);
    expect(comparison.codingTokenReductionRatio).toBeGreaterThan(0);
    expect(comparison.reviewTokenReductionRatio).toBeGreaterThan(0);
  });

  it("bounds follow-up retrievals and escalates attempted write-boundary expansion", async () => {
    const context = await compileWorkUnitContext(compilerInput({ readSource: async (sourcePath) => sourceFiles[sourcePath] ?? null }));
    const remainingBudget = {
      maxInputTokens: Math.min(200, context.budget.maxInputTokens - context.tokenUsage.estimatedInputTokens),
      maxSourceTokens: Math.min(100, context.budget.maxSourceTokens - context.tokenUsage.sourceTokens),
      maxGraphTokens: Math.min(100, context.budget.maxGraphTokens - context.tokenUsage.graphTokens),
      maxContractTokens: Math.min(100, context.budget.maxContractTokens - context.tokenUsage.contractTokens),
      maxFiles: 1,
      maxNodes: 1,
      maxEdges: 1
    };
    const request = {
      requestId: "retrieval-1",
      workUnitId: context.workUnit.id,
      missingFact: "Confirm the neighbor return type.",
      reason: "The boundary summary does not include the exact return annotation.",
      requestedNodeIds: ["halo"],
      requestedSources: [{ path: "src/halo.ts", startLine: 1, endLine: 3, intent: "read" as const }],
      remainingBudget
    };

    expect(validateWorkUnitContextRetrievalRequest(context, request)).toEqual(request);
    expect(() =>
      validateWorkUnitContextRetrievalRequest(context, {
        ...request,
        requestId: "retrieval-write-outside",
        requestedSources: [{ path: "src/halo.ts", startLine: 1, endLine: 3, intent: "write" }]
      })
    ).toThrow(WorkUnitContextEscalationRequiredError);
    expect(() =>
      validateWorkUnitContextRetrievalRequest(context, {
        ...request,
        requestId: "retrieval-over-budget",
        remainingBudget: { ...remainingBudget, maxInputTokens: context.budget.maxInputTokens }
      })
    ).toThrow(/exceeding the compiler's remaining/);
  });

  it("executes a bounded proposal without reading the full graph or uncompiled source", async () => {
    const context = await compileWorkUnitContext(compilerInput({ readSource: async (sourcePath) => sourceFiles[sourcePath] ?? null }));
    const rendered = renderWorkUnitContext(context, { provider: "generic", purpose: "coding" });
    const toolbox = {
      readGraph: vi.fn(async () => ({ nodes: [], edges: [] })),
      getIndexState: vi.fn(),
      getNodeDetail: vi.fn(),
      getCanvasGraph: vi.fn(),
      resolveExecutionMetadata: vi.fn(),
      setStatuses: vi.fn(async () => undefined),
      applyGraphPatch: vi.fn(),
      listScannableFiles: vi.fn(),
      getScanFileStates: vi.fn(),
      buildFakeLocalScanOutput: vi.fn(),
      applyScanResult: vi.fn(),
      readSourceFile: vi.fn(async () => "should not be read"),
      writeCodeProposal: vi.fn(async () => undefined),
      readGitStatus: vi.fn(),
      refreshCodeGraph: vi.fn()
    };

    const result = await runCodingWorkUnitAgent(
      { projectId: context.projectId, targetNodeId: "owned", context, rendered },
      {
        config: {
          agentKind: "coding",
          provider: "fake",
          model: "fake",
          cliCommand: "",
          reasoningEffort: "medium",
          speedTier: "standard",
          permissionMode: "ask_for_permission",
          codexSystemPromptMode: "custom",
          claudeSystemPromptMode: "custom",
          parallelLimit: 2,
          apiKeySource: { type: "env", value: "" },
          systemPromptSource: { type: "manual", value: "" }
        },
        runId: "run-bounded",
        workspaceRoot: "/tmp/work-unit",
        toolbox
      }
    );

    expect(result.diff).toContain("diff --git a/src/owned.ts b/src/owned.ts");
    expect(toolbox.writeCodeProposal).toHaveBeenCalledWith(
      context.projectId,
      "run-bounded",
      "owned",
      expect.stringContaining("@@ -2,2 +2,2 @@"),
      null,
      expect.objectContaining({
        workUnitId: context.workUnit.id,
        actualWriteScopes: [expect.objectContaining({ path: "src/owned.ts", startLine: 2, endLine: 3 })],
        contractUpdates: []
      })
    );
    expect(toolbox.readGraph).not.toHaveBeenCalled();
    expect(toolbox.readSourceFile).not.toHaveBeenCalled();
  });
});

function compilerInput(
  overrides: Partial<WorkUnitContextCompilerInput> & { budget?: ContextBudget } = {}
): WorkUnitContextCompilerInput {
  const nodes = fixtureNodes();
  const edges = fixtureEdges();
  const budget = overrides.budget ?? defaultBudget;
  const primaryUnit = workUnit("unit-owned", ["owned"], ["halo", "test"], ["edge-owned-halo"], budget);
  const neighborUnit = workUnit("unit-halo", ["halo"], ["owned"], ["edge-owned-halo"], defaultBudget);
  const orchestration = codingWorkflowOrchestrationSchema.parse({
    schemaVersion: 1,
    featureVersion: "ma2-partition-v1",
    workflowId: "workflow-1",
    projectId: "project-1",
    revision,
    workUnits: [primaryUnit, neighborUnit],
    boundaryEdges: [{ id: "edge-owned-halo", sourceNodeId: "owned", targetNodeId: "halo", kind: "calls" }],
    interfaceContracts: [
      {
        id: "contract-owned-halo",
        workflowId: "workflow-1",
        edgeId: "edge-owned-halo",
        edgeKind: "calls",
        producerWorkUnitId: "unit-owned",
        consumerWorkUnitId: "unit-halo",
        direction: "producer_to_consumer",
        subjectNodeIds: ["owned", "halo"],
        contractKind: "signature",
        baseline: {
          formatVersion: 1,
          summary: "owned calls halo",
          normalizedValue: "owned():number -> halo():number",
          fingerprint: "contract-hash",
          metadata: {}
        },
        proposed: null,
        status: "stable",
        evidence: [{ path: "src/owned.ts", startLine: 2, endLine: 4, symbolId: "owned", origin: "source", fingerprint: "hash-owned" }]
      }
    ],
    routingDecisions: [routingDecision(primaryUnit), routingDecision(neighborUnit)],
    warnings: []
  });
  return {
    orchestration,
    workUnitId: "unit-owned",
    task: "Update owned without changing the halo signature.",
    scopedNodes: nodes,
    scopedEdges: edges,
    observedRevision: revision,
    indexState: "complete",
    readSource: async (sourcePath) => sourceFiles[sourcePath] ?? null,
    compiledAt: "2026-07-18T13:00:00.000Z",
    ...overrides
  };
}

function workUnit(
  id: string,
  ownedNodeIds: string[],
  readHaloNodeIds: string[],
  boundaryEdgeIds: string[],
  contextBudget: ContextBudget
): CodingWorkUnit {
  return {
    id,
    workflowId: "workflow-1",
    projectId: "project-1",
    parentWorkUnitId: null,
    layerIndex: 0,
    title: id,
    objective: `Implement ${id} inside its declared source range.`,
    ownedNodeIds,
    readHaloNodeIds,
    boundaryEdgeIds,
    dependencyWorkUnitIds: [],
    coordinationWorkUnitIds: id === "unit-owned" ? ["unit-halo"] : ["unit-owned"],
    plannedWriteScopes:
      id === "unit-owned"
        ? [{ path: "src/owned.ts", startLine: 2, endLine: 4, symbolId: "owned", permission: "edit" }]
        : [{ path: "src/halo.ts", startLine: 1, endLine: 3, symbolId: "halo", permission: "edit" }],
    expectedOutputs: [{ kind: "diff", description: "Scoped patch proposal.", required: true, path: null }],
    recommendedScale: "small",
    selectedScale: "small",
    routingDecisionId: `routing-${id}`,
    contextBudget,
    baseRevision: revision,
    status: "pending"
  };
}

function routingDecision(unit: CodingWorkUnit) {
  return {
    id: unit.routingDecisionId,
    workUnitId: unit.id,
    recommendedScale: unit.recommendedScale,
    selectedScale: unit.selectedScale,
    featureVersion: "partition-preview-v1",
    features: {
      ownedSymbolCount: unit.ownedNodeIds.length,
      estimatedSourceTokens: 20,
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
      testAvailability: "available",
      blastRadius: "local",
      languageConfidence: 1,
      indexState: "complete",
      taskAmbiguity: "low",
      planningConfidence: 1,
      risks: ["cross_file"]
    },
    reasons: ["Fixture routing."],
    estimatedInputTokens: 20,
    estimatedOutputTokens: 10,
    estimatedCost: null,
    override: null
  };
}

function fixtureNodes(): GraphNode[] {
  return [
    graphNode("owned", "owned", "src/owned.ts", 2, 4),
    graphNode("halo", "halo", "src/halo.ts", 1, 3),
    graphNode("test", "owned test", "tests/owned.test.ts", 1, 2)
  ];
}

function graphNode(id: string, name: string, sourcePath: string, startLine: number, endLine: number): GraphNode {
  return {
    id,
    projectId: "project-1",
    kind: "function",
    name,
    summary: `${name} fixture summary.`,
    code: { context: `${name} context`, directory: sourcePath, startLine, endLine, language: "typescript" },
    parentId: null,
    attachedToId: null,
    customTypeId: null,
    source: { path: sourcePath, startLine, endLine },
    execution: {
      testScriptDirectory: "tests",
      virtualEnvironment: null,
      workingDirectory: ".",
      setupCommand: null,
      testCommand: "pnpm test"
    },
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

function fixtureEdges(): GraphEdge[] {
  return [
    {
      id: "edge-owned-halo",
      projectId: "project-1",
      kind: "calls",
      sourceNodeId: "owned",
      targetNodeId: "halo",
      label: "owned calls halo",
      codeContext: "owned calls halo",
      source: { path: "src/owned.ts", startLine: 3, endLine: 3 },
      color: "#64748b",
      animated: false,
      pointingEnabled: true,
      pointingDirection: "source_to_target",
      agentStatus: "none",
      gitStatus: null,
      tags: [],
      createdAt: "fixture"
    }
  ];
}
