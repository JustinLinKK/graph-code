import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import crossSpawn from "cross-spawn";
import {
  buildLegacyRoundRobinPlanningChunks,
  estimateLegacyInputTokens,
  inspectLegacyRoundRobinPlanningChunks,
  type LegacyPlanningGraph
} from "./orchestration/legacy-baseline";
import {
  AVAILABLE_EXTENSION_PACKAGES,
  type AgentConfig,
  type AgentKind,
  type AgentRun,
  type AgentStatus,
  type BlockExecutionMetadata,
  type CanvasGraph,
  CLAUDE_REASONING_EFFORTS,
  type CodingAgentRequest,
  type CodingWorkUnit,
  type CodeProposalArtifactManifest,
  type ContractUpdate,
  type GraphEdge,
  type GraphNode,
  type GraphPatch,
  type GraphStatusPatch,
  type IndexState,
  type InterfaceContract,
  type NodeDetail,
  type WorkUnitProposal,
  workUnitProposalSchema,
    type PlanningChatRequest,
    type ReviewAgentRequest,
    type ReviewAgentMode,
  extensionNodeDetailsMutationSchema,
  type ScanningAgentRequest,
  type ScanningAgentConfig,
  type ScanningAgentMode,
  graphEdgeKindSchema,
  graphNodeKindSchema,
  ioKindSchema,
  languageTypeSchema,
  processKindSchema,
  formatKindSchema,
  codeProposalArtifactManifestSchema,
  sourceRangeSchema,
  SCANNING_AGENT_MODES,
  graphPatchSchema,
  isAttachmentNodeKind,
  isDomainNodeKind
} from "@graphcode/graph-model";
import { z } from "zod";
import {
  renderedWorkUnitContextSchema,
  workUnitContextSchema,
  type RenderedWorkUnitContext,
  type WorkUnitContext
} from "./context/contracts";
import { validateActualWriteScopes } from "./context/render";

export * from "./context/compiler";
export * from "./context/contracts";
export * from "./context/render";
export * from "./context/retrieval";

export {
  benchmarkLegacyConflictSchedule,
  buildLegacyRoundRobinPlanningChunks,
  createDelayedFakeProvider,
  estimateLegacyInputTokens,
  fixtureToLegacyPlanningGraph,
  inspectLegacyRoundRobinPlanningChunks,
  legacyWorkflowFixtureSchema
} from "./orchestration/legacy-baseline";
export type {
  DelayedFakeProvider,
  LegacyPlanningChunkDiagnostic,
  LegacyPlanningChunkInspection,
  LegacyPlanningGraph,
  LegacyScheduleBenchmark,
  LegacyScheduleItem,
  LegacyWorkflowFixture
} from "./orchestration/legacy-baseline";

export type GraphCodeToolbox = {
  readGraph: (projectId: string) => Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>;
  getIndexState: (projectId: string) => Promise<IndexState>;
  getNodeDetail: (nodeId: string) => Promise<NodeDetail>;
  getCanvasGraph: (projectId: string, rootNodeId: string, includeAttachments?: boolean) => Promise<CanvasGraph>;
  resolveExecutionMetadata: (nodeId: string) => Promise<BlockExecutionMetadata>;
  setStatuses: (projectId: string, patches: GraphStatusPatch[]) => Promise<void>;
  applyGraphPatch: (projectId: string, patch: GraphPatch, runId?: string) => Promise<void>;
  listScannableFiles: (projectId: string) => Promise<ScannableFile[]>;
  getScanFileStates: (projectId: string) => Promise<ScanFileState[]>;
  buildFakeLocalScanOutput: (projectId: string, file: ScannableFile) => Promise<ScanLocalOutput>;
  applyScanResult: (projectId: string, result: ScanPipelineResult, runId?: string | null) => Promise<CodeGraphRefreshResult>;
  readSourceFile: (relativePath: string) => Promise<string>;
  writeCodeProposal: (
    projectId: string,
    runId: string | null,
    targetNodeId: string | null,
    diff: string,
    artifactManifest?: CodeProposalArtifactManifest | null,
    workUnitProposal?: WorkUnitProposal | null
  ) => Promise<void>;
  readGitStatus: (projectId: string) => Promise<string>;
  readGitDiff?: (projectId: string) => Promise<string>;
  refreshCodeGraph: (
    projectId: string,
    rootPath?: string
  ) => Promise<{
    nodeCount: number;
    edgeCount: number;
    fileCount: number;
    symbolCount: number;
    workflowNodeCount: number;
  }>;
};

type PlanningGraph = LegacyPlanningGraph;

export type AgentContextBenchmark = {
  durationMs: number;
  promptCharacters: number;
  estimatedInputTokens: number;
  chunks: number;
  nodes: number;
  edges: number;
  orphanEdges: number;
};

export function benchmarkAgentContext(graph: PlanningGraph, parallelLimit = 4): AgentContextBenchmark {
  const startedAt = performance.now();
  const inspection = inspectLegacyRoundRobinPlanningChunks(graph, parallelLimit);
  const promptCharacters = inspection.chunks.reduce((total, chunk) => total + chunk.promptCharacters, 0);
  return {
    durationMs: performance.now() - startedAt,
    promptCharacters,
    estimatedInputTokens: estimateLegacyInputTokens(promptCharacters),
    chunks: inspection.chunks.length,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    orphanEdges: inspection.orphanEdgeIds.length
  };
}

export type AgentRuntimeOptions = {
  config: AgentConfig;
  scanningConfigs?: Partial<Record<ScanningAgentMode, ScanningAgentConfig & { skipCodexDefaultSystemPrompt?: boolean }>>;
  runId?: string;
  workspaceRoot?: string;
  toolbox: GraphCodeToolbox;
  signal?: AbortSignal;
};

export type AgentResult = {
  response: string;
  diff?: string;
  graphPatch?: GraphPatch | null;
  touched?: GraphStatusPatch[];
};

export type IntegrationAgentContext = {
  schemaVersion: 1;
  workflowId: string;
  layerIndex: number;
  parent: { workUnitId: string | null; objective: string };
  children: Array<{
    workUnitId: string;
    objective: string;
    outputSummary: string;
    diff: string;
    contractUpdates: ContractUpdate[];
  }>;
  contracts: InterfaceContract[];
  failures: Array<{
    kind: string;
    status: "passed" | "failed" | "blocked";
    itemId: string | null;
    diagnostics: Record<string, unknown>;
  }>;
  relevantSource: Array<{ path: string; startLine: number | null; endLine: number | null; content: string }>;
  authority: "propose_reconciliation_only";
};

type PromptMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type AgentTask = {
  kind: AgentKind;
  prompt: string;
  execute: () => Promise<AgentResult>;
};

export type ScannableFile = {
  path: string;
  contentHash: string;
  size: number;
  language: string;
};

export type ScanFileState = {
  filePath: string;
  contentHash: string;
};

export type CodeGraphRefreshResult = {
  nodeCount: number;
  edgeCount: number;
  fileCount: number;
  symbolCount: number;
  workflowNodeCount: number;
};

const scanDetailSchema = z.object({
  ioKind: ioKindSchema.optional(),
  channel: z.string().optional(),
  schemaHint: z.string().nullable().optional(),
  processKind: processKindSchema.optional(),
  trigger: z.string().nullable().optional(),
  formatKind: formatKindSchema.optional(),
  spec: z.string().optional(),
  notes: z.string().optional(),
  extensionDetails: extensionNodeDetailsMutationSchema.optional()
});

export const scanNodeDraftSchema = z.object({
  stableKey: z.string().min(1),
  kind: graphNodeKindSchema,
  name: z.string().min(1),
  summary: z.string().default(""),
  codeContext: z.string().default(""),
  source: sourceRangeSchema.default({ path: null, startLine: null, endLine: null }),
  language: languageTypeSchema.default("unknown"),
  parentStableKey: z.string().nullable().optional(),
  attachedToStableKey: z.string().nullable().optional(),
  detail: scanDetailSchema.optional()
});

export const scanEdgeDraftSchema = z.object({
  stableKey: z.string().min(1),
  kind: graphEdgeKindSchema,
  sourceStableKey: z.string().min(1),
  targetStableKey: z.string().min(1),
  label: z.string().nullable().optional(),
  codeContext: z.string().default(""),
  source: sourceRangeSchema.default({ path: null, startLine: null, endLine: null }),
  animated: z.boolean().optional()
});

export const scanLocalOutputSchema = z.object({
  filePath: z.string().min(1),
  contentHash: z.string().min(1),
  summary: z.string().default(""),
  nodes: z.array(scanNodeDraftSchema).default([]),
  edges: z.array(scanEdgeDraftSchema).default([])
});

export const scanMediumOutputSchema = z.object({
  scopePath: z.string().min(1),
  summary: z.string().default(""),
  nodes: z.array(scanNodeDraftSchema).default([]),
  edges: z.array(scanEdgeDraftSchema).default([])
});

export const scanGlobalOutputSchema = z.object({
  summary: z.string().default(""),
  nodes: z.array(scanNodeDraftSchema).default([]),
  edges: z.array(scanEdgeDraftSchema).default([])
});

export const scanPipelineResultSchema = z.object({
  initial: z.boolean(),
  inventory: z.array(z.object({ path: z.string(), contentHash: z.string(), size: z.number(), language: z.string() })),
  changedFiles: z.array(z.object({ path: z.string(), contentHash: z.string(), size: z.number(), language: z.string() })),
  deletedFiles: z.array(z.object({ filePath: z.string(), contentHash: z.string() })),
  localOutputs: z.array(scanLocalOutputSchema),
  mediumOutputs: z.array(scanMediumOutputSchema),
  globalOutput: scanGlobalOutputSchema
});

export type ScanNodeDraft = z.infer<typeof scanNodeDraftSchema>;
export type ScanEdgeDraft = z.infer<typeof scanEdgeDraftSchema>;
export type ScanLocalOutput = z.infer<typeof scanLocalOutputSchema>;
export type ScanMediumOutput = z.infer<typeof scanMediumOutputSchema>;
export type ScanGlobalOutput = z.infer<typeof scanGlobalOutputSchema>;
export type ScanPipelineResult = z.infer<typeof scanPipelineResultSchema>;

const planningAgentOutputSchema = z.object({
  response: z.string().default(""),
  graphPatch: graphPatchSchema
});

const AgentState = Annotation.Root({
  task: Annotation<AgentTask>(),
  result: Annotation<AgentResult | null>({
    reducer: (_, value) => value,
    default: () => null
  })
});

export async function runPlanningAgent(input: PlanningChatRequest, options: AgentRuntimeOptions): Promise<AgentResult> {
  return runLangGraphTask({
    kind: "planning",
    prompt: input.prompt,
    execute: async () => {
      const provider = createProvider(options.config, options.workspaceRoot);
      const [fallbackGraph, scopedCanvas, indexState] = await Promise.all([
        input.scopeNodeId ? Promise.resolve(null) : options.toolbox.readGraph(input.projectId),
        input.scopeNodeId ? options.toolbox.getCanvasGraph(input.projectId, input.scopeNodeId, true).catch(() => null) : Promise.resolve(null),
        options.toolbox.getIndexState(input.projectId)
      ]);
      const graph = scopedCanvas
        ? { nodes: scopedCanvas.nodes, edges: scopedCanvas.edges }
        : fallbackGraph ?? { nodes: [], edges: [] };
      const coverageNotice = formatIndexCoverageForPrompt(indexState);
      const scope = input.scopeNodeId ? graph.nodes.find((node) => node.id === input.scopeNodeId) ?? null : null;
      const response = await provider.invoke([
        {
          role: "system",
          content: resolveSystemPrompt(
            options.config,
            "Plan safe GraphCode graph patches from user intent. Return only strict JSON with {response, graphPatch:{summary, operations}}."
          )
        },
        {
          role: "user",
          content: [
            `Prompt: ${input.prompt}`,
            coverageNotice,
            scope ? `Scope: ${scope.name} (${scope.kind}) ${scope.summary}` : "Scope: workspace",
            `Writable node ids:\n${graph.nodes.slice(0, 120).map((node) => `${node.id}: ${node.name} (${node.kind})`).join("\n")}`,
            `Writable edge ids:\n${graph.edges.slice(0, 160).map((edge) => `${edge.id}: ${edge.sourceNodeId}->${edge.targetNodeId} (${edge.kind})`).join("\n")}`,
            `Return shape:
{
  "response": "human-readable plan summary",
  "graphPatch": {
    "summary": "short patch summary",
    "operations": [
      { "entityType": "node", "entityId": "existing-node-id", "action": "update", "fields": { "summary": "planned summary" } }
    ]
  }
}`,
            "Emit at least one graphPatch operation when a scoped or root node can represent the plan. Prefer updating existing node summaries or codeContext over creating speculative new nodes.",
            `Topology-scoped planning evidence:\nNodes:\n${graph.nodes.map((node) => `${node.id}:${node.name}:${node.kind}:${node.summary}`).join("\n")}\nEdges:\n${graph.edges.map((edge) => `${edge.id}:${edge.sourceNodeId}->${edge.targetNodeId}:${edge.kind}:${edge.label ?? ""}`).join("\n")}`
          ].join("\n")
        }
      ]);
      const output = parsePlanningAgentOutput(response, input.prompt, graph, scope);
      const patch = output.graphPatch;
      if (input.scopeNodeId) {
        await options.toolbox.setStatuses(input.projectId, [
          {
            entityType: "node",
            entityId: input.scopeNodeId,
            status: "planning",
            note: patch.summary,
            agentRunId: options.runId ?? null
          }
        ]);
      }
      return {
        response: output.response,
        graphPatch: patch,
        touched: input.scopeNodeId
          ? [
              {
                entityType: "node",
                entityId: input.scopeNodeId,
                status: "planning",
                note: patch.summary,
                agentRunId: options.runId ?? null
              }
            ]
          : []
      };
    }
  });
}

export async function runCodingAgent(input: CodingAgentRequest, options: AgentRuntimeOptions): Promise<AgentResult> {
  return runLangGraphTask({
    kind: "coding",
    prompt: input.prompt ?? "",
    execute: async () => {
      const provider = createProvider(options.config, options.workspaceRoot);
      const mode = input.mode ?? "medium";
      const detail = await options.toolbox.getNodeDetail(input.nodeId);
      const scopeRootNodeId = detail.node.parentId ?? detail.node.id;
      const [boundedCanvas, indexState] = await Promise.all([
        options.toolbox.getCanvasGraph(input.projectId, scopeRootNodeId, true),
        options.toolbox.getIndexState(input.projectId)
      ]);
      const graph = { nodes: boundedCanvas.nodes, edges: boundedCanvas.edges };
      const organizationScope = resolveCodingOrganizationScope(detail.node, graph.nodes);
      const scopeCanvas = mode !== "small" ? boundedCanvas : null;
        const allowedPath = detail.node.source.path ?? detail.node.code.directory;
        const source = allowedPath ? await options.toolbox.readSourceFile(allowedPath) : "";
        const gitStatus = await options.toolbox.readGitStatus(input.projectId);
        const execution = await options.toolbox.resolveExecutionMetadata(input.nodeId);
        const context = buildCodingContextBundle({
          mode,
          detail,
          graph,
          organizationScope,
          scopeCanvas,
          allowedPath,
          source,
          gitStatus,
          execution,
          recommendedModeReason: input.recommendedModeReason,
          prompt: input.prompt,
          coverageNotice: formatIndexCoverageForPrompt(indexState)
        });
        const response = await provider.invoke([
          { role: "system", content: resolveSystemPrompt(options.config, "Return a unified diff scoped only to the selected GraphCode block. If you create test scripts, append GRAPHCODE_TEST_ARTIFACTS_JSON followed by a compact JSON artifact manifest.") },
          { role: "user", content: context }
        ]);
        const { content: responseWithoutArtifacts, artifactManifest } = extractCodeProposalArtifactManifest(response);
        const directEditMode = usesCliDirectEditMode(options.config);
        const directDiff = directEditMode ? await (options.toolbox.readGitDiff?.(input.projectId) ?? Promise.resolve("")) : "";
        if (directEditMode && directDiff.trim()) {
          await options.toolbox.refreshCodeGraph(input.projectId).catch(() => undefined);
        }
        const diff = directDiff.trim() ? directDiff : normalizeDiff(responseWithoutArtifacts, allowedPath);
        if (!directEditMode) {
          assertDiffInScope(diff, allowedPath);
        }
        await options.toolbox.writeCodeProposal(input.projectId, options.runId ?? null, input.nodeId, diff, artifactManifest);
      const touched: GraphStatusPatch[] = [
        {
          entityType: "node",
          entityId: input.nodeId,
          status: "coded",
          note: usesCliDirectEditMode(options.config) ? "Coding agent applied or captured direct workspace edits." : "Coding agent produced a patch proposal.",
          agentRunId: options.runId ?? null
        }
      ];
      await options.toolbox.setStatuses(input.projectId, touched);
      return { response, diff, touched };
    }
  });
}

export type WorkUnitCodingRequest = {
  projectId: string;
  targetNodeId: string;
  context: WorkUnitContext;
  rendered: RenderedWorkUnitContext;
  allowContractUpdates?: boolean;
};

export async function runCodingWorkUnitAgent(input: WorkUnitCodingRequest, options: AgentRuntimeOptions): Promise<AgentResult> {
  return runLangGraphTask({
    kind: "coding",
    prompt: input.context.task,
    execute: async () => {
      const context = workUnitContextSchema.parse(input.context);
      const rendered = renderedWorkUnitContextSchema.parse(input.rendered);
      if (rendered.purpose !== "coding") throw new Error("Work-unit coding execution requires a coding context render.");
      if (context.projectId !== input.projectId || !context.workUnit.ownedNodeIds.includes(input.targetNodeId)) {
        throw new Error("Work-unit coding request identity does not match its compiled context.");
      }
      if (usesCliDirectEditMode(options.config)) {
        throw new Error("Parallel work-unit execution is proposal-only; direct-edit CLI permission modes are not allowed.");
      }
      throwIfAgentCancelled(options.signal);
      const provider = createProvider(options.config, options.workspaceRoot);
      const customSystemPrompt =
        (options.config.systemPromptSource.type === "manual" || options.config.systemPromptSource.type === "file") &&
        options.config.systemPromptSource.value?.trim()
          ? `\n\nAdditional workspace policy:\n${options.config.systemPromptSource.value.trim()}`
          : "";
      const response = await provider.invoke([
        {
          role: "system",
          content: `${rendered.systemPrompt}${customSystemPrompt}\n\nReturn a unified diff. Append GRAPHCODE_WORK_UNIT_METADATA_JSON followed by JSON containing ${
            input.allowContractUpdates === false ? "discoveredDependencies, assumptions, unresolvedIssues, and confidence" : "contractUpdates, discoveredDependencies, assumptions, unresolvedIssues, and confidence"
          }.`
        },
        { role: "user", content: rendered.userPrompt }
      ]);
      throwIfAgentCancelled(options.signal);
      const { content: responseWithoutMetadata, metadata } = extractWorkUnitProposalMetadata(response);
      const { content: responseWithoutArtifacts, artifactManifest } = extractCodeProposalArtifactManifest(responseWithoutMetadata);
      const diff =
        options.config.provider === "fake"
          ? fakeWorkUnitDiff(context, responseWithoutArtifacts)
          : normalizeDiff(responseWithoutArtifacts, context.allowedWrites[0]?.path);
      const actualWriteScopes = extractUnifiedDiffWriteScopes(diff);
      if (actualWriteScopes.length === 0) throw new Error("Work-unit coding response did not contain a parseable unified diff.");
      validateActualWriteScopes(context.workUnit, actualWriteScopes);
      const workUnitProposal = workUnitProposalSchema.parse({
        workUnitId: context.workUnit.id,
        baseRevision: context.workUnit.baseRevision,
        diff,
        actualWriteScopes,
        contractUpdates: input.allowContractUpdates === false ? [] : metadata?.contractUpdates ?? [],
        discoveredDependencies: metadata?.discoveredDependencies ?? [],
        testsProposed: [],
        assumptions: metadata?.assumptions ?? [],
        unresolvedIssues: metadata?.unresolvedIssues ?? [],
        confidence: metadata?.confidence ?? "medium"
      });
      await options.toolbox.writeCodeProposal(input.projectId, options.runId ?? null, input.targetNodeId, diff, artifactManifest, workUnitProposal);
      const touched = context.workUnit.ownedNodeIds.map((nodeId) => ({
        entityType: "node" as const,
        entityId: nodeId,
        status: "coded" as const,
        note: `Work unit ${context.workUnit.id} produced a bounded proposal.`,
        agentRunId: options.runId ?? null
      }));
      await options.toolbox.setStatuses(input.projectId, touched);
      return { response, diff, touched };
    }
  });
}

export async function runIntegrationAgent(
  input: { scale: "medium" | "large"; context: IntegrationAgentContext },
  options: AgentRuntimeOptions
): Promise<string> {
  if (usesCliDirectEditMode(options.config)) {
    throw new Error("Integration agents are proposal-only; direct-edit CLI permission modes are not allowed.");
  }
  throwIfAgentCancelled(options.signal);
  const provider = createProvider(options.config, options.workspaceRoot);
  const response = await provider.invoke([
    {
      role: "system",
      content: [
        "Reconcile only the bounded child proposals, interface contracts, failures, and exact source in the supplied integration capsule.",
        "Do not request or infer a complete repository graph.",
        "Return a reconciliation proposal only. Never apply workspace edits.",
        `Integration scale: ${input.scale}.`
      ].join(" ")
    },
    { role: "user", content: `GRAPHCODE_BOUNDED_INTEGRATION_CONTEXT_JSON\n${JSON.stringify(input.context)}` }
  ]);
  throwIfAgentCancelled(options.signal);
  return response;
}

export function extractUnifiedDiffWriteScopes(diff: string): CodingWorkUnit["plannedWriteScopes"] {
  const scopes: CodingWorkUnit["plannedWriteScopes"] = [];
  const lines = diff.split(/\r?\n/);
  let oldPath: string | null = null;
  let newPath: string | null = null;
  let currentPath: string | null = null;
  let permission: "edit" | "create" | "delete" = "edit";
  for (const line of lines) {
    if (line.startsWith("--- ")) {
      oldPath = normalizeDiffHeaderPath(line.slice(4));
      continue;
    }
    if (line.startsWith("+++ ")) {
      newPath = normalizeDiffHeaderPath(line.slice(4));
      currentPath = newPath ?? oldPath;
      permission = oldPath === null ? "create" : newPath === null ? "delete" : "edit";
      continue;
    }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (!hunk || !currentPath) continue;
    const startLine = Number.parseInt(hunk[1], 10);
    const count = hunk[2] === undefined ? 1 : Number.parseInt(hunk[2], 10);
    scopes.push({
      path: currentPath,
      startLine: permission === "edit" ? startLine : null,
      endLine: permission === "edit" ? startLine + Math.max(1, count) - 1 : null,
      symbolId: null,
      permission
    });
  }
  return scopes;
}

export async function runReviewAgent(
  input: ReviewAgentRequest & { diff?: string; targetNodeId?: string | null; targetRun?: AgentRun | null },
  options: AgentRuntimeOptions
): Promise<AgentResult> {
  return runLangGraphTask({
    kind: "review",
    prompt: input.runId,
    execute: async () => {
      const provider = createProvider(options.config, options.workspaceRoot);
      const mode = input.mode ?? "medium";
      const diff = input.diff ?? "";
      const detail = input.targetNodeId ? await options.toolbox.getNodeDetail(input.targetNodeId) : null;
      const [boundedCanvas, indexState] = await Promise.all([
        detail ? options.toolbox.getCanvasGraph(input.projectId, detail.node.parentId ?? detail.node.id, true).catch(() => null) : Promise.resolve(null),
        options.toolbox.getIndexState(input.projectId)
      ]);
      const graph = { nodes: boundedCanvas?.nodes ?? (detail ? [detail.node] : []), edges: boundedCanvas?.edges ?? [] };
      const organizationScope = detail ? resolveCodingOrganizationScope(detail.node, graph.nodes) : null;
      const scopeCanvas = detail && mode !== "small" ? boundedCanvas : null;
      const allowedPath = detail?.node.source.path ?? detail?.node.code.directory ?? null;
      const source = allowedPath ? await options.toolbox.readSourceFile(allowedPath).catch(() => "") : "";
      const gitStatus = await options.toolbox.readGitStatus(input.projectId);
      const execution = input.targetNodeId ? await options.toolbox.resolveExecutionMetadata(input.targetNodeId) : null;
      const context = buildReviewContextBundle({
        mode,
        targetRun: input.targetRun ?? null,
        detail,
        graph,
        organizationScope,
        scopeCanvas,
        allowedPath,
        source,
        gitStatus,
        execution,
        diff,
        coverageNotice: formatIndexCoverageForPrompt(indexState)
      });
      const response = await provider.invoke([
        {
          role: "system",
          content: resolveSystemPrompt(
            options.config,
            "Review GraphCode coding proposals for bugs, verification gaps, and scope leaks. End with GRAPHCODE_REVIEW_VERDICT: reviewed or GRAPHCODE_REVIEW_VERDICT: bugged."
          )
        },
        { role: "user", content: context }
      ]);
      const forcedBug = diffEscapesScope(diff, allowedPath);
      const parsedVerdict = parseReviewVerdict(response);
      const status: AgentStatus = forcedBug || parsedVerdict !== "reviewed" ? "bugged" : "reviewed";
      const touched = input.targetNodeId
        ? [
            {
              entityType: "node" as const,
              entityId: input.targetNodeId,
              status,
              note: status === "bugged" ? "Review agent found a likely issue or failed a deterministic review guard." : "Review agent accepted the patch proposal.",
              agentRunId: options.runId ?? null
            }
          ]
        : [];
      if (touched.length > 0) {
        await options.toolbox.setStatuses(options.runId ? input.projectId : input.projectId, touched);
      }
      return { response, touched };
    }
  });
}

export async function runScanningAgent(input: ScanningAgentRequest, options: AgentRuntimeOptions): Promise<AgentResult> {
  return runLangGraphTask({
    kind: "scanning",
    prompt: scanningPrompt(input),
    execute: async () => {
      throwIfAgentCancelled(options.signal);
      const scanConfigs = resolveScanningConfigs(options);
      const inventory = await options.toolbox.listScannableFiles(input.projectId);
      const indexState = await options.toolbox.getIndexState(input.projectId);
      const coverageNotice = formatIndexCoverageForPrompt(indexState);
      throwIfAgentCancelled(options.signal);
      const previousStates = await options.toolbox.getScanFileStates(input.projectId);
      const previousByPath = new Map(previousStates.map((state) => [state.filePath, state.contentHash]));
      const inventoryByPath = new Map(inventory.map((file) => [file.path, file]));
      const changedFiles = inventory.filter((file) => previousByPath.get(file.path) !== file.contentHash);
      const deletedFiles = previousStates.filter((state) => !inventoryByPath.has(state.filePath));
      const initial = previousStates.length === 0;
      const localTargets = initial ? inventory : changedFiles;
      const localOutputs = await boundedMap(
        localTargets,
        scanConfigs.local.parallelLimit,
        (file) => runLocalScan(input, file, scanConfigs.local, options.toolbox, coverageNotice, options.workspaceRoot),
        options.signal
      );
      const mediumScopes = directoriesForScan(initial ? inventory : [...changedFiles, ...deletedFiles.map((file) => ({ path: file.filePath, contentHash: file.contentHash, size: 0, language: "unknown" }))]);
      const mediumOutputs = await boundedMap(
        mediumScopes,
        scanConfigs.medium.parallelLimit,
        (scopePath) => runMediumScan(input, scopePath, inventory, localOutputs, scanConfigs.medium, coverageNotice, options.workspaceRoot),
        options.signal
      );
      const unchangedGraphSummary = initial
        ? { nodes: [], edges: [] }
        : compactUnchangedGraphSummary(await options.toolbox.readGraph(input.projectId), [
            ...changedFiles.map((file) => file.path),
            ...deletedFiles.map((file) => file.filePath)
          ]);
      throwIfAgentCancelled(options.signal);
      const globalOutput = await runGlobalScan(input, inventory, localOutputs, mediumOutputs, unchangedGraphSummary, scanConfigs.global, coverageNotice, options.workspaceRoot);
      const pipeline = scanPipelineResultSchema.parse({
        initial,
        inventory,
        changedFiles,
        deletedFiles,
        localOutputs,
        mediumOutputs,
        globalOutput
      });
      const result = await options.toolbox.applyScanResult(input.projectId, pipeline, options.runId ?? null);
      const finalIndexState = await options.toolbox.getIndexState(input.projectId);
      return {
        response: [
          `Scanned ${result.fileCount} files into ${result.nodeCount} Code Graph nodes.`,
          `Changed ${changedFiles.length} files, removed ${deletedFiles.length} files, ran ${localOutputs.length} local, ${mediumOutputs.length} medium, and 1 global scan pass.`,
          `Extracted ${result.symbolCount} symbols, ${result.workflowNodeCount} workflow blocks, and ${result.edgeCount} edges.`,
          finalIndexState.completeness.status === "complete"
            ? "Index coverage is complete for the discovered supported files."
            : `Index coverage is ${finalIndexState.completeness.status}; repository-wide coverage must not be claimed.`
        ].join(" "),
        touched: []
      };
    }
  });
}

function scanningPrompt(input: ScanningAgentRequest): string {
  const enabledExtensions = AVAILABLE_EXTENSION_PACKAGES.filter((extensionPackage) => input.enabledExtensionPackageIds?.includes(extensionPackage.id));
  return (
    [
      input.rootPath ? `Root path: ${input.rootPath}` : `Project: ${input.projectId}`,
      input.projectDescription ? `Project description:\n${input.projectDescription}` : "",
      input.scanningInstructions ? `Scanning instructions:\n${input.scanningInstructions}` : "",
      enabledExtensions.length > 0
        ? [
            "Enabled extension packages:",
            ...enabledExtensions.map((extensionPackage) =>
              [
                `${extensionPackage.id}: ${extensionPackage.name}`,
                extensionPackage.promptAddendum,
                `Node kinds: ${extensionPackage.nodeKinds
                  .map((definition) => `${definition.kind}(${definition.category}; schema=${definition.detailSchemaId}; fields=${definition.fields.map((field) => field.key).join("|") || "none"})`)
                  .join(", ")}`
              ].join("\n")
            )
          ].join("\n\n")
        : "No extension packages are enabled. Do not emit extension node kinds."
    ]
      .filter(Boolean)
      .join("\n\n") || input.projectId
  );
}

function resolveScanningConfigs(options: AgentRuntimeOptions): Record<ScanningAgentMode, ScanningAgentConfig> {
  return Object.fromEntries(
    SCANNING_AGENT_MODES.map((mode) => {
      const configured = options.scanningConfigs?.[mode];
      return [
        mode,
        configured ?? {
          mode,
          provider: options.config.provider,
          model: options.config.model,
          cliCommand: options.config.cliCommand,
          reasoningEffort: options.config.reasoningEffort,
          speedTier: options.config.speedTier,
          permissionMode: options.config.permissionMode,
          codexSystemPromptMode: options.config.codexSystemPromptMode,
          claudeSystemPromptMode: options.config.claudeSystemPromptMode,
          parallelLimit: options.config.parallelLimit,
          apiKeySource: options.config.apiKeySource,
          systemPromptSource: options.config.systemPromptSource
        }
      ];
    })
  ) as Record<ScanningAgentMode, ScanningAgentConfig>;
}

async function runLocalScan(
  input: ScanningAgentRequest,
  file: ScannableFile,
  config: ScanningAgentConfig,
  toolbox: GraphCodeToolbox,
  coverageNotice: string,
  workspaceRoot?: string
): Promise<ScanLocalOutput> {
  if (config.provider === "fake") {
    return scanLocalOutputSchema.parse(await toolbox.buildFakeLocalScanOutput(input.projectId, file));
  }
  const provider = createProvider(config, workspaceRoot);
  const source = await toolbox.readSourceFile(file.path);
  const response = await provider.invoke([
    { role: "system", content: resolveSystemPrompt(config, "Return strict JSON for one GraphCode local scan file analysis.") },
    {
      role: "user",
      content: [
        scanningPrompt(input),
        coverageNotice,
        `Mode: local`,
        `File: ${file.path}`,
        `Content hash: ${file.contentHash}`,
        "Return only JSON matching this shape: {filePath, contentHash, summary, nodes:[{stableKey, kind, name, summary, codeContext, source:{path,startLine,endLine}, language, parentStableKey, attachedToStableKey, detail:{..., extensionDetails:{packageId,schemaId,payload}}}], edges:[{stableKey, kind, sourceStableKey, targetStableKey, label, codeContext, source:{path,startLine,endLine}}]}.",
        "Every source range must be exact and use 1-based inclusive line numbers from this file.",
        numberedSource(source)
      ].join("\n\n")
    }
  ]);
  return scanLocalOutputSchema.parse(parseJsonResponse(response));
}

async function runMediumScan(
  input: ScanningAgentRequest,
  scopePath: string,
  inventory: ScannableFile[],
  localOutputs: ScanLocalOutput[],
  config: ScanningAgentConfig,
  coverageNotice: string,
  workspaceRoot?: string
): Promise<ScanMediumOutput> {
  if (config.provider === "fake") {
    return fakeMediumOutput(scopePath);
  }
  const provider = createProvider(config, workspaceRoot);
  const response = await provider.invoke([
    { role: "system", content: resolveSystemPrompt(config, "Return strict JSON for one GraphCode medium scan consolidation.") },
    {
      role: "user",
      content: [
        scanningPrompt(input),
        coverageNotice,
        `Mode: medium`,
        `Scope path: ${scopePath}`,
        `Files in scope:\n${inventory.filter((file) => fileInScope(file.path, scopePath)).map((file) => `${file.path} ${file.contentHash}`).join("\n")}`,
        `Changed local outputs:\n${JSON.stringify(localOutputs.filter((output) => fileInScope(output.filePath, scopePath)).map(compactLocalOutput), null, 2)}`,
        "Return only JSON matching this shape: {scopePath, summary, nodes, edges}. Medium nodes should describe directory/package/module grouping and exported surfaces."
      ].join("\n\n")
    }
  ]);
  return scanMediumOutputSchema.parse(parseJsonResponse(response));
}

async function runGlobalScan(
  input: ScanningAgentRequest,
  inventory: ScannableFile[],
  localOutputs: ScanLocalOutput[],
  mediumOutputs: ScanMediumOutput[],
  unchangedGraphSummary: { nodes: object[]; edges: object[] },
  config: ScanningAgentConfig,
  coverageNotice: string,
  workspaceRoot?: string
): Promise<ScanGlobalOutput> {
  if (config.provider === "fake") {
    return fakeGlobalOutput(input);
  }
  const provider = createProvider(config, workspaceRoot);
  const response = await provider.invoke([
    { role: "system", content: resolveSystemPrompt(config, "Return strict JSON for one GraphCode global scan synthesis.") },
    {
      role: "user",
      content: [
        scanningPrompt(input),
        coverageNotice,
        `Mode: global`,
        `Repository inventory:\n${inventory.map((file) => `${file.path} ${file.contentHash}`).join("\n")}`,
        `Compact unchanged graph summaries:\n${JSON.stringify(unchangedGraphSummary, null, 2)}`,
        `Changed local summaries:\n${JSON.stringify(localOutputs.map(compactLocalOutput), null, 2)}`,
        `Medium outputs:\n${JSON.stringify(mediumOutputs, null, 2)}`,
        "Return only JSON matching this shape: {summary, nodes, edges}. Global nodes should include the repository root and high-level subsystem modules; edges should wire functions, files, modules, and directories with exact source evidence where available."
      ].join("\n\n")
    }
  ]);
  return scanGlobalOutputSchema.parse(parseJsonResponse(response));
}

function fakeMediumOutput(scopePath: string): ScanMediumOutput {
  const normalized = normalizeDirectory(scopePath);
  const parent = normalized === "." ? "root" : `dir:${normalizeDirectory(normalized.split("/").slice(0, -1).join("/") || ".")}`;
  return scanMediumOutputSchema.parse({
    scopePath: normalized,
    summary: normalized === "." ? "Repository source root." : `Directory module ${normalized}.`,
    nodes: [
      {
        stableKey: `dir:${normalized}`,
        kind: "module",
        name: normalized === "." ? "Code Graph" : normalized.split("/").at(-1),
        summary: normalized === "." ? "Generated bottom-up code graph" : `Directory ${normalized}`,
        codeContext: normalized === "." ? "Generated scanner root directory." : `Generated directory module for ${normalized}.`,
        source: { path: normalized, startLine: null, endLine: null },
        language: "unknown",
        parentStableKey: normalized === "." ? "root" : parent
      }
    ],
    edges: []
  });
}

function fakeGlobalOutput(input: ScanningAgentRequest): ScanGlobalOutput {
  return scanGlobalOutputSchema.parse({
    summary: "Whole-repository scan synthesis.",
    nodes: [
      {
        stableKey: "root",
        kind: "framework",
        name: "Scanned Workspace",
        summary: "Scanned repository workspace",
        codeContext: scanningPrompt(input),
        source: { path: null, startLine: null, endLine: null },
        language: "unknown"
      }
    ],
    edges: []
  });
}

function compactUnchangedGraphSummary(graph: PlanningGraph, affectedPaths: string[]): { nodes: object[]; edges: object[] } {
  const affected = new Set(affectedPaths.filter(Boolean));
  const isAffected = (path: string | null | undefined) => Boolean(path && affected.has(path));
  return {
    nodes: graph.nodes
      .filter((node) => !isAffected(node.source.path) && !isAffected(node.code.directory))
      .slice(0, 200)
      .map((node) => ({
        id: node.id,
        kind: node.kind,
        name: node.name,
        summary: node.summary,
        parentId: node.parentId,
        attachedToId: node.attachedToId,
        source: node.source
      })),
    edges: graph.edges
      .filter((edge) => !isAffected(edge.source.path))
      .slice(0, 300)
      .map((edge) => ({
        id: edge.id,
        kind: edge.kind,
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: edge.targetNodeId,
        label: edge.label,
        source: edge.source
      }))
  };
}

function directoriesForScan(files: Array<Pick<ScannableFile, "path">>): string[] {
  const directories = new Set<string>(["."]);
  for (const file of files) {
    const parts = file.path.split("/").slice(0, -1);
    for (let index = 1; index <= parts.length; index += 1) {
      directories.add(parts.slice(0, index).join("/") || ".");
    }
  }
  return [...directories].sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
}

function normalizeDirectory(value: string): string {
  const trimmed = value.replace(/^\.\/+/, "").replace(/\/+$/, "");
  return trimmed || ".";
}

function fileInScope(filePath: string, scopePath: string): boolean {
  return scopePath === "." || filePath === scopePath || filePath.startsWith(`${scopePath}/`);
}

function compactLocalOutput(output: ScanLocalOutput): object {
  return {
    filePath: output.filePath,
    contentHash: output.contentHash,
    summary: output.summary,
    nodes: output.nodes.map((node) => ({ stableKey: node.stableKey, kind: node.kind, name: node.name, source: node.source })),
    edges: output.edges.map((edge) => ({ stableKey: edge.stableKey, kind: edge.kind, sourceStableKey: edge.sourceStableKey, targetStableKey: edge.targetStableKey, source: edge.source }))
  };
}

function numberedSource(source: string): string {
  return source
    .split(/\r?\n/)
    .map((line, index) => `${String(index + 1).padStart(5, " ")} | ${line}`)
    .join("\n");
}

function parseJsonResponse(response: string): unknown {
  const trimmed = response.trim();
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed);
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    return JSON.parse(fenced[1]);
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }
  throw new Error("Scanning agent did not return JSON.");
}

function parsePlanningAgentOutput(response: string, prompt: string, graph: PlanningGraph, scope: GraphNode | null): z.infer<typeof planningAgentOutputSchema> {
  try {
    const parsed = planningAgentOutputSchema.parse(parseJsonResponse(response));
    if (parsed.graphPatch.operations.length > 0 && graphPatchOperationsReferenceKnownEntities(parsed.graphPatch, graph)) {
      return parsed;
    }
    return fallbackPlanningOutput(response, prompt, graph, scope);
  } catch {
    return fallbackPlanningOutput(response, prompt, graph, scope);
  }
}

function graphPatchOperationsReferenceKnownEntities(patch: GraphPatch, graph: PlanningGraph): boolean {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const edgeIds = new Set(graph.edges.map((edge) => edge.id));
  return patch.operations.every((operation) => {
    if (operation.action === "create" || operation.entityType === "boundary") {
      return true;
    }
    if (operation.entityType === "node") {
      return nodeIds.has(operation.entityId);
    }
    return edgeIds.has(operation.entityId);
  });
}

function fallbackPlanningOutput(response: string, prompt: string, graph: PlanningGraph, scope: GraphNode | null): z.infer<typeof planningAgentOutputSchema> {
  const target = scope ?? graph.nodes.find((node) => node.parentId === null) ?? graph.nodes[0] ?? null;
  const summary = compactPlanningSummary(response.trim() || `Planned graph changes for: ${prompt}`);
  return planningAgentOutputSchema.parse({
    response: response.trim() || summary,
    graphPatch: {
      summary,
      operations: target
        ? [
            {
              entityType: "node",
              entityId: target.id,
              action: "update",
              fields: {
                summary
              }
            }
          ]
        : []
    }
  });
}

function compactPlanningSummary(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 1000) || "Planning agent proposed graph updates.";
}

type CodingContextInput = {
  mode: CodingAgentRequest["mode"];
  detail: NodeDetail;
  graph: PlanningGraph;
  organizationScope: GraphNode | null;
  scopeCanvas: CanvasGraph | null;
  allowedPath: string | null | undefined;
  source: string;
  gitStatus: string;
  execution: BlockExecutionMetadata;
  recommendedModeReason?: string;
  prompt?: string;
  coverageNotice: string;
};

function buildCodingContextBundle(input: CodingContextInput): string {
  const directWorkflowNodes = [
    ...input.detail.inputs.map((row) => row.node),
    ...input.detail.processes.map((row) => row.node),
    ...input.detail.outputs.map((row) => row.node),
    ...input.detail.formats.map((row) => row.node),
    ...input.detail.basicDetails.map((row) => row.node),
    ...input.detail.dependencies.map((row) => row.node)
  ];
  const canvasWorkflowNodes =
    input.scopeCanvas?.nodes.filter((node) => isAttachmentNodeKind(node.kind) && (node.kind === "input" || node.kind === "process" || node.kind === "output" || node.kind === "format")) ?? [];
  const workflowNodes = uniqueNodes(input.mode === "small" ? directWorkflowNodes : [...directWorkflowNodes, ...canvasWorkflowNodes]);
  const directEdges = [...input.detail.incomingEdges, ...input.detail.outgoingEdges];
  const workflowEdges = input.scopeCanvas?.edges.filter((edge) => edge.kind === "flows" || edge.kind === "describes_format") ?? [];
  const scopedEdges = uniqueEdges(input.mode === "small" ? directEdges : [...workflowEdges, ...directEdges]);
  const largeGraph = input.mode === "large" ? buildLargeGraphContext(input.graph, input.organizationScope ?? input.detail.node) : { nodes: [], edges: [] };
  const sourceLimit = input.mode === "large" ? 20000 : input.mode === "medium" ? 12000 : 4000;

  return [
    `Coding mode: ${input.mode}`,
    input.coverageNotice,
    input.recommendedModeReason ? `Recommended mode reason: ${input.recommendedModeReason}` : "",
    `Target node: ${formatNode(input.detail.node)}`,
    `Organization scope: ${input.organizationScope ? formatNode(input.organizationScope) : "none"}`,
    `Allowed edit path: ${input.allowedPath ?? "none"}`,
    `Allowed source lines: ${input.detail.node.source.startLine ?? input.detail.node.code.startLine ?? "unknown"}-${input.detail.node.source.endLine ?? input.detail.node.code.endLine ?? "unknown"}`,
    `Execution metadata:\n${formatExecutionMetadata(input.execution)}`,
    "Environment rule: use only the resolved virtual environment/setup metadata above. Do not activate unrelated conda, venv, pyenv, nvm, or system environments by guessing.",
    "Test artifact rule: if a new test script is useful, include it only in GRAPHCODE_TEST_ARTIFACTS_JSON; do not assume it has been written into the source tree.",
    `Workflow blocks:\n${formatNodeList(workflowNodes, 28)}`,
    `Workflow flow edges:\n${formatEdgeList(scopedEdges, 36)}`,
    `Related nodes:\n${formatNodeList(input.detail.relatedNodes, 18)}`,
    input.mode === "large" ? `Large-scope nodes:\n${formatNodeList(largeGraph.nodes, 50)}` : "",
    input.mode === "large" ? `Large-scope edges:\n${formatEdgeList(largeGraph.edges, 80)}` : "",
    `Code context:\n${input.detail.node.code.context || "(none)"}`,
    `User prompt:\n${input.prompt ?? "Implement the scoped graph change."}`,
    `Git status:\n${input.gitStatus || "(clean or unavailable)"}`,
    input.source ? `Source (${input.allowedPath ?? "unknown"}):\n${input.source.slice(0, sourceLimit)}` : "Source unavailable; produce a proposal note."
  ]
    .filter(Boolean)
      .join("\n\n");
}

export type LegacyCodingContextBenchmarkInput = {
  detail: NodeDetail;
  graph: LegacyPlanningGraph;
  scopeCanvas: CanvasGraph | null;
  source: string;
  gitStatus: string;
  execution: BlockExecutionMetadata;
  recommendedModeReason?: string;
  prompt?: string;
  coverageNotice: string;
};

export type LegacyCodingContextSize = {
  mode: "small" | "medium" | "large";
  promptCharacters: number;
  estimatedInputTokens: number;
};

export function benchmarkLegacyCodingContexts(input: LegacyCodingContextBenchmarkInput): LegacyCodingContextSize[] {
  const organizationScope = resolveCodingOrganizationScope(input.detail.node, input.graph.nodes);
  const allowedPath = input.detail.node.source.path ?? input.detail.node.code.directory;
  return (["small", "medium", "large"] as const).map((mode) => {
    const context = buildCodingContextBundle({
      ...input,
      mode,
      organizationScope,
      allowedPath
    });
    return {
      mode,
      promptCharacters: context.length,
      estimatedInputTokens: estimateLegacyInputTokens(context.length)
    };
  });
}

export type LegacyReviewContextBenchmarkInput = {
  targetRun: AgentRun | null;
  detail: NodeDetail | null;
  graph: LegacyPlanningGraph;
  scopeCanvas: CanvasGraph | null;
  source: string;
  gitStatus: string;
  execution: BlockExecutionMetadata | null;
  diff: string;
  coverageNotice: string;
};

export function benchmarkLegacyReviewContexts(input: LegacyReviewContextBenchmarkInput): LegacyCodingContextSize[] {
  const organizationScope = input.detail ? resolveCodingOrganizationScope(input.detail.node, input.graph.nodes) : null;
  const allowedPath = input.detail?.node.source.path ?? input.detail?.node.code.directory ?? null;
  return (["small", "medium", "large"] as const).map((mode) => {
    const context = buildReviewContextBundle({
      ...input,
      mode,
      organizationScope,
      allowedPath
    });
    return {
      mode,
      promptCharacters: context.length,
      estimatedInputTokens: estimateLegacyInputTokens(context.length)
    };
  });
}

type ReviewContextInput = {
  mode: ReviewAgentMode;
  targetRun: AgentRun | null;
  detail: NodeDetail | null;
  graph: PlanningGraph;
  organizationScope: GraphNode | null;
  scopeCanvas: CanvasGraph | null;
  allowedPath: string | null;
  source: string;
  gitStatus: string;
  execution: BlockExecutionMetadata | null;
  diff: string;
  coverageNotice: string;
};

function buildReviewContextBundle(input: ReviewContextInput): string {
  const detail = input.detail;
  const directWorkflowNodes = detail
    ? [
        ...detail.inputs.map((row) => row.node),
        ...detail.processes.map((row) => row.node),
        ...detail.outputs.map((row) => row.node),
        ...detail.formats.map((row) => row.node),
        ...detail.basicDetails.map((row) => row.node),
        ...detail.dependencies.map((row) => row.node)
      ]
    : [];
  const canvasWorkflowNodes =
    input.scopeCanvas?.nodes.filter((node) => isAttachmentNodeKind(node.kind) && (node.kind === "input" || node.kind === "process" || node.kind === "output" || node.kind === "format")) ?? [];
  const workflowNodes = uniqueNodes(input.mode === "small" ? directWorkflowNodes : [...directWorkflowNodes, ...canvasWorkflowNodes]);
  const directEdges = detail ? [...detail.incomingEdges, ...detail.outgoingEdges] : [];
  const workflowEdges = input.scopeCanvas?.edges.filter((edge) => edge.kind === "flows" || edge.kind === "describes_format") ?? [];
  const scopedEdges = uniqueEdges(input.mode === "small" ? directEdges : [...workflowEdges, ...directEdges]);
  const largeGraph = input.mode === "large" && detail ? buildLargeGraphContext(input.graph, input.organizationScope ?? detail.node) : { nodes: [], edges: [] };
  const sourceLimit = input.mode === "large" ? 20000 : input.mode === "medium" ? 12000 : 4000;

  return [
    `Review mode: ${input.mode}`,
    input.coverageNotice,
    input.targetRun
      ? [
          `Target run: ${input.targetRun.id}`,
          `Target run kind: ${input.targetRun.agentKind}`,
          `Target coding mode: ${input.targetRun.codingMode ?? "none"}`,
          `Target run status: ${input.targetRun.status}`,
          `Target run prompt:\n${input.targetRun.prompt || "(none)"}`,
          `Target run response:\n${input.targetRun.response || "(none)"}`,
          input.targetRun.error ? `Target run error:\n${input.targetRun.error}` : ""
        ]
          .filter(Boolean)
          .join("\n")
      : "Target run: (not provided)",
    detail ? `Target node: ${formatNode(detail.node)}` : "Target node: none",
    `Organization scope: ${input.organizationScope ? formatNode(input.organizationScope) : "none"}`,
    `Allowed edit path: ${input.allowedPath ?? "none"}`,
    detail
      ? `Allowed source lines: ${detail.node.source.startLine ?? detail.node.code.startLine ?? "unknown"}-${detail.node.source.endLine ?? detail.node.code.endLine ?? "unknown"}`
      : "Allowed source lines: unknown",
    input.execution ? `Execution metadata:\n${formatExecutionMetadata(input.execution)}` : "Execution metadata: unavailable",
    `Workflow blocks:\n${formatNodeList(workflowNodes, 28)}`,
    `Workflow flow edges:\n${formatEdgeList(scopedEdges, 36)}`,
    detail ? `Related nodes:\n${formatNodeList(detail.relatedNodes, 18)}` : "",
    input.mode === "large" ? `Large-scope nodes:\n${formatNodeList(largeGraph.nodes, 50)}` : "",
    input.mode === "large" ? `Large-scope edges:\n${formatEdgeList(largeGraph.edges, 80)}` : "",
    detail ? `Code context:\n${detail.node.code.context || "(none)"}` : "",
    `Git status:\n${input.gitStatus || "(clean or unavailable)"}`,
    input.source ? `Source (${input.allowedPath ?? "unknown"}):\n${input.source.slice(0, sourceLimit)}` : "Source unavailable.",
    `Diff under review:\n${input.diff || "(no diff available)"}`,
    "Verdict rule: end the response with exactly one line: GRAPHCODE_REVIEW_VERDICT: reviewed or GRAPHCODE_REVIEW_VERDICT: bugged."
  ]
    .filter(Boolean)
    .join("\n\n");
}

function resolveCodingOrganizationScope(target: GraphNode, nodes: GraphNode[]): GraphNode | null {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  if (target.kind === "function" || target.kind === "object") {
    return target;
  }

  let current: GraphNode | undefined = target;
  const seen = new Set<string>();
  while (current?.attachedToId && !seen.has(current.attachedToId)) {
    seen.add(current.attachedToId);
    const attachedTo = nodeById.get(current.attachedToId);
    if (!attachedTo) {
      break;
    }
    if (isDomainNodeKind(attachedTo.kind)) {
      return attachedTo;
    }
    current = attachedTo;
  }

  if (isDomainNodeKind(target.kind)) {
    return target;
  }
  if (target.parentId) {
    const parent = nodeById.get(target.parentId);
    if (parent && isDomainNodeKind(parent.kind)) {
      return parent;
    }
  }
  return null;
}

function buildLargeGraphContext(graph: PlanningGraph, scope: GraphNode): PlanningGraph {
  const descendantIds = new Set<string>([scope.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of graph.nodes) {
      if (node.parentId && descendantIds.has(node.parentId) && !descendantIds.has(node.id)) {
        descendantIds.add(node.id);
        changed = true;
      }
    }
  }
  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (descendantIds.has(edge.sourceNodeId) || descendantIds.has(edge.targetNodeId)) {
      edgeIds.add(edge.id);
      descendantIds.add(edge.sourceNodeId);
      descendantIds.add(edge.targetNodeId);
    }
  }
  return {
    nodes: graph.nodes.filter((node) => descendantIds.has(node.id)),
    edges: graph.edges.filter((edge) => edgeIds.has(edge.id))
  };
}

function uniqueNodes(nodes: GraphNode[]): GraphNode[] {
  return [...new Map(nodes.map((node) => [node.id, node])).values()];
}

function uniqueEdges(edges: GraphEdge[]): GraphEdge[] {
  return [...new Map(edges.map((edge) => [edge.id, edge])).values()];
}

function formatNodeList(nodes: GraphNode[], limit: number): string {
  if (nodes.length === 0) {
    return "(none)";
  }
  const formatted = nodes.slice(0, limit).map(formatNode);
  return nodes.length > limit ? [...formatted, `... ${nodes.length - limit} more`].join("\n") : formatted.join("\n");
}

function formatEdgeList(edges: GraphEdge[], limit: number): string {
  if (edges.length === 0) {
    return "(none)";
  }
  const formatted = edges
    .slice(0, limit)
    .map((edge) => `${edge.id}: ${edge.sourceNodeId} -> ${edge.targetNodeId} (${edge.kind}${edge.label ? `, ${edge.label}` : ""}) ${edge.codeContext}`.trim());
  return edges.length > limit ? [...formatted, `... ${edges.length - limit} more`].join("\n") : formatted.join("\n");
}

function formatExecutionMetadata(execution: BlockExecutionMetadata): string {
  return [
    `testScriptDirectory=${execution.testScriptDirectory ?? "(none)"}`,
    `virtualEnvironment=${execution.virtualEnvironment ?? "(none)"}`,
    `workingDirectory=${execution.workingDirectory ?? "(none)"}`,
    `setupCommand=${execution.setupCommand ?? "(none)"}`,
    `testCommand=${execution.testCommand ?? "(none)"}`
  ].join("\n");
}

function formatNode(node: GraphNode): string {
  return `${node.id}: ${node.name} (${node.kind}, status=${node.agentStatus}) ${node.summary}`.trim();
}

export const graphDatabaseToolSchemas = {
  "graphcode.db.read_graph": z.object({ projectId: z.string() }),
  "graphcode.db.get_node_detail": z.object({ nodeId: z.string() }),
  "graphcode.db.get_canvas_graph": z.object({ projectId: z.string(), rootNodeId: z.string(), includeAttachments: z.boolean().optional() }),
  "graphcode.db.apply_graph_patch": z.object({ projectId: z.string(), patch: graphPatchSchema }),
  "graphcode.db.set_statuses": z.object({ projectId: z.string(), patches: z.array(z.unknown()) }),
  "graphcode.repo.read_git_status": z.object({ projectId: z.string() }),
  "graphcode.repo.read_source_file": z.object({ path: z.string() }),
  "graphcode.repo.write_code_proposal": z.object({
    projectId: z.string(),
    runId: z.string().nullable(),
    targetNodeId: z.string().nullable(),
    diff: z.string(),
    artifactManifest: codeProposalArtifactManifestSchema.nullable().optional()
  })
};

async function runLangGraphTask(task: AgentTask): Promise<AgentResult> {
  const graph = new StateGraph(AgentState)
    .addNode("agent", async (state) => ({ result: await state.task.execute() }))
    .addEdge(START, "agent")
    .addEdge("agent", END)
    .compile();
  const result = await graph.invoke({ task });
  return result.result ?? { response: "" };
}

type ProviderConfig = Omit<AgentConfig, "agentKind"> & {
  agentKind?: AgentKind;
  mode?: string;
  skipCodexDefaultSystemPrompt?: boolean;
};

function createProvider(config: ProviderConfig, workspaceRoot?: string): { invoke: (messages: PromptMessage[]) => Promise<string> } {
      if (config.provider === "fake") {
        return {
          invoke: async (messages) => {
            const content = messages.at(-1)?.content.slice(0, 4000) ?? "";
            if (config.agentKind === "review") {
              const verdict = diffEscapesScope(content, extractAllowedPath(content)) ? "bugged" : "reviewed";
              return `Fake review response: ${content}\nGRAPHCODE_REVIEW_VERDICT: ${verdict}`;
            }
            return `Fake ${config.agentKind ?? config.mode ?? "agent"} response: ${content}`;
          }
        };
      }
  if (config.provider === "codex") {
    return { invoke: (messages) => invokeCodexCli(config, messages, workspaceRoot) };
  }
  if (config.provider === "openai" || config.provider === "openrouter") {
    const apiKey = resolveApiKey(config);
    const model = new ChatOpenAI({
      model: config.model,
      apiKey,
      temperature: 0,
      ...(config.provider === "openrouter"
        ? {
            configuration: {
              baseURL: "https://openrouter.ai/api/v1"
            }
          }
        : {})
    });
    return { invoke: (messages) => invokeChatModel(model, messages) };
  }
  if (config.provider === "gemini") {
    const model = new ChatGoogleGenerativeAI({
      model: config.model,
      apiKey: resolveApiKey(config),
      temperature: 0
    });
    return { invoke: (messages) => invokeChatModel(model, messages) };
  }
  if (config.provider === "claudecode") {
    return { invoke: (messages) => invokeClaudeCodeCli(config, messages, workspaceRoot) };
  }
  throw new Error(`Unsupported agent provider: ${config.provider}`);
}

function usesCliDirectEditMode(config: ProviderConfig): boolean {
  return (config.provider === "codex" || config.provider === "claudecode") && (config.permissionMode === "approve_for_me" || config.permissionMode === "full_access");
}

function codexPermissionProfile(permissionMode: ProviderConfig["permissionMode"]): {
  approvalPolicy: string;
  sandboxMode: string;
  directEdits: boolean;
  configOverrides: string[];
} {
  if (permissionMode === "full_access") {
    return {
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
      directEdits: true,
      configOverrides: []
    };
  }
  if (permissionMode === "approve_for_me") {
    return {
      approvalPolicy: "on-request",
      sandboxMode: "workspace-write",
      directEdits: true,
      configOverrides: ['approvals_reviewer="auto_review"']
    };
  }
  return {
    approvalPolicy: "never",
    sandboxMode: "read-only",
    directEdits: false,
    configOverrides: []
  };
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

async function invokeCodexCli(config: ProviderConfig, messages: PromptMessage[], workspaceRoot?: string): Promise<string> {
  const command = resolveCliCommand(config, "codex");
  const cwd = workspaceRoot ?? process.cwd();
  const permission = codexPermissionProfile(config.permissionMode);
  const configOverrides = [
    config.reasoningEffort ? `model_reasoning_effort=${tomlString(config.reasoningEffort)}` : "",
    config.speedTier === "fast" ? `service_tier=${tomlString("fast")}` : "",
    config.speedTier === "fast" ? "features.fast_mode=true" : "",
    config.codexSystemPromptMode === "custom" && config.systemPromptSource.value?.trim()
      ? `developer_instructions=${tomlString(config.systemPromptSource.value.trim())}`
      : "",
    config.skipCodexDefaultSystemPrompt ? `base_instructions=${tomlString("")}` : "",
    ...permission.configOverrides
  ].filter(Boolean);
  const prompt = buildCliPrompt(messages, {
    providerName: "Codex CLI",
    systemInPrompt: false,
    allowDirectEdits: permission.directEdits
  });
  const args = [
    "--ask-for-approval",
    permission.approvalPolicy,
    ...configOverrides.flatMap((override) => ["-c", override]),
    "exec",
    "--cd",
    cwd,
    "--sandbox",
    permission.sandboxMode,
    "--skip-git-repo-check",
    ...(config.model.trim() ? ["--model", config.model.trim()] : []),
    "-"
  ];
  const { stdout } = await runCliCommand(command, args, {
    cwd,
    input: prompt,
    timeout: 120000,
    maxBuffer: 1024 * 1024 * 4
  });
  return stdout.trim();
}

async function invokeClaudeCodeCli(config: ProviderConfig, messages: PromptMessage[], workspaceRoot?: string): Promise<string> {
  const command = resolveCliCommand(config, "claude");
  const cwd = workspaceRoot ?? process.cwd();
  const systemPrompt = systemPromptFromMessages(messages);
  const permission = claudePermissionProfile(config.permissionMode);
  const prompt = buildCliPrompt(messages, {
    providerName: "Claude Code CLI",
    systemInPrompt: false,
    allowDirectEdits: permission.directEdits
  });
  const args = [
    "-p",
    ...(config.claudeSystemPromptMode === "custom" && systemPrompt ? ["--append-system-prompt", systemPrompt] : []),
    "--permission-mode",
    permission.permissionMode,
    ...permission.disallowedTools.flatMap((tool) => ["--disallowedTools", tool]),
    "--output-format",
    "text",
    ...(config.model.trim() ? ["--model", config.model.trim()] : []),
    ...(isClaudeReasoningEffort(config.reasoningEffort) ? ["--effort", config.reasoningEffort] : []),
    ...(config.speedTier === "fast" ? ["--settings", JSON.stringify({ fastMode: true })] : []),
    prompt
  ];
  const { stdout } = await runCliCommand(
    command,
    args,
    {
      cwd,
      timeout: 120000,
      maxBuffer: 1024 * 1024 * 4
    }
  );
  return stdout.trim();
}

function resolveCliCommand(config: ProviderConfig, fallback: string): string {
  return config.cliCommand?.trim() || fallback;
}

function claudePermissionProfile(permissionMode: ProviderConfig["permissionMode"]): {
  permissionMode: string;
  directEdits: boolean;
  disallowedTools: string[];
} {
  if (permissionMode === "full_access") {
    return {
      permissionMode: "bypassPermissions",
      directEdits: true,
      disallowedTools: []
    };
  }
  if (permissionMode === "approve_for_me") {
    return {
      permissionMode: "acceptEdits",
      directEdits: true,
      disallowedTools: []
    };
  }
  return {
    permissionMode: "plan",
    directEdits: false,
    disallowedTools: ["Edit", "MultiEdit", "Write", "NotebookEdit"]
  };
}

function isClaudeReasoningEffort(value: string): value is (typeof CLAUDE_REASONING_EFFORTS)[number] {
  return (CLAUDE_REASONING_EFFORTS as readonly string[]).includes(value);
}

function systemPromptFromMessages(messages: PromptMessage[]): string {
  return messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n")
    .trim();
}

function buildCliPrompt(messages: PromptMessage[], options: { providerName: string; systemInPrompt: boolean; allowDirectEdits?: boolean }): string {
  const system = systemPromptFromMessages(messages);
  const conversation = messages
    .filter((message) => options.systemInPrompt || message.role !== "system")
    .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
    .join("\n\n");
  return [
    `GraphCode ${options.providerName} account-plan invocation.`,
    "Use the GraphCode role/mode instructions as the active skill for this run.",
    options.systemInPrompt && system ? `GraphCode skill instructions:\n${system}` : "",
    options.allowDirectEdits
      ? "You may edit workspace files directly when needed. Return a concise final message; GraphCode will capture the resulting git diff."
      : "Do not edit, write, or apply files directly. Return the requested GraphCode response only so the app can store, review, and apply proposals.",
    "For coding runs, return a clean unified diff and append GRAPHCODE_TEST_ARTIFACTS_JSON only when test artifacts are proposed. For scanning runs, return strict JSON only.",
    conversation
  ]
    .filter(Boolean)
    .join("\n\n");
}

function runCliCommand(
  command: string,
  args: string[],
  options: { cwd: string; input?: string; timeout: number; maxBuffer: number }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = crossSpawn(command, args, {
      cwd: options.cwd,
      stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error: Error | null, result?: { stdout: string; stderr: string }) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (error) {
        reject(error);
      } else {
        resolve(result ?? { stdout, stderr });
      }
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(new Error(`${command} timed out after ${options.timeout}ms.`));
    }, options.timeout);
    child.on("error", (error) => finish(error));
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (stdout.length + stderr.length > options.maxBuffer) {
        child.kill("SIGTERM");
        finish(new Error(`${command} produced more than ${options.maxBuffer} bytes of output.`));
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stdout.length + stderr.length > options.maxBuffer) {
        child.kill("SIGTERM");
        finish(new Error(`${command} produced more than ${options.maxBuffer} bytes of output.`));
      }
    });
    child.on("close", (code, signal) => {
      if (code === 0) {
        finish(null, { stdout, stderr });
        return;
      }
      const detail = stderr.trim() || stdout.trim() || (signal ? `signal ${signal}` : `exit code ${code}`);
      finish(new Error(`${command} failed: ${detail}`));
    });
    if (options.input !== undefined) {
      child.stdin?.on("error", (error: NodeJS.ErrnoException) => {
        if (error.code !== "EPIPE") {
          finish(error);
        }
      });
      child.stdin?.end(options.input);
    }
  });
}

async function invokeChatModel(model: { invoke: (messages: Array<SystemMessage | HumanMessage | AIMessage>) => Promise<unknown> }, messages: PromptMessage[]): Promise<string> {
  const output = await model.invoke(
    messages.map((message) => {
      if (message.role === "system") {
        return new SystemMessage(message.content);
      }
      if (message.role === "assistant") {
        return new AIMessage(message.content);
      }
      return new HumanMessage(message.content);
    })
  );
  if (typeof output === "string") {
    return output;
  }
  if (output && typeof output === "object" && "content" in output) {
    const content = (output as { content: unknown }).content;
    return Array.isArray(content) ? content.map(String).join("\n") : String(content ?? "");
  }
  return String(output ?? "");
}

function resolveApiKey(config: ProviderConfig): string | undefined {
  const value = config.apiKeySource.value?.trim();
  if (!value) {
    return undefined;
  }
  if (config.apiKeySource.type === "env") {
    return process.env[value];
  }
  if (config.apiKeySource.type === "manual" || config.apiKeySource.type === "file") {
    return value;
  }
  return undefined;
}

function resolveSystemPrompt(config: ProviderConfig, fallback: string): string {
  if ((config.systemPromptSource.type === "manual" || config.systemPromptSource.type === "file") && config.systemPromptSource.value?.trim()) {
    return config.systemPromptSource.value;
  }
  return fallback;
}

function extractCodeProposalArtifactManifest(response: string): { content: string; artifactManifest: CodeProposalArtifactManifest | null } {
  const marker = "GRAPHCODE_TEST_ARTIFACTS_JSON";
  const markerIndex = response.indexOf(marker);
  if (markerIndex < 0) {
    return { content: response, artifactManifest: null };
  }
  const content = response.slice(0, markerIndex).trimEnd();
  const raw = response
    .slice(markerIndex + marker.length)
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return { content, artifactManifest: codeProposalArtifactManifestSchema.parse(JSON.parse(raw)) };
  } catch {
    return { content: response, artifactManifest: null };
  }
}

const workUnitProposalMetadataSchema = z.object({
  contractUpdates: workUnitProposalSchema.shape.contractUpdates.default([]),
  discoveredDependencies: workUnitProposalSchema.shape.discoveredDependencies.default([]),
  assumptions: workUnitProposalSchema.shape.assumptions.default([]),
  unresolvedIssues: workUnitProposalSchema.shape.unresolvedIssues.default([]),
  confidence: workUnitProposalSchema.shape.confidence.default("medium")
});

export function extractWorkUnitProposalMetadata(response: string): {
  content: string;
  metadata: z.infer<typeof workUnitProposalMetadataSchema> | null;
} {
  const marker = "GRAPHCODE_WORK_UNIT_METADATA_JSON";
  const markerIndex = response.indexOf(marker);
  if (markerIndex < 0) return { content: response, metadata: null };
  const tail = response.slice(markerIndex + marker.length).trimStart();
  const nextMarkerMatch = tail.match(/\nGRAPHCODE_[A-Z_]+/);
  const nextMarkerIndex = nextMarkerMatch?.index ?? -1;
  const rawBlock = (nextMarkerIndex < 0 ? tail : tail.slice(0, nextMarkerIndex))
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const remaining = nextMarkerIndex < 0 ? "" : tail.slice(nextMarkerIndex + 1);
  try {
    return {
      content: [response.slice(0, markerIndex).trimEnd(), remaining.trimStart()].filter(Boolean).join("\n"),
      metadata: workUnitProposalMetadataSchema.parse(JSON.parse(rawBlock))
    };
  } catch {
    throw new Error("Work-unit proposal metadata is not valid GRAPHCODE_WORK_UNIT_METADATA_JSON.");
  }
}

function normalizeDiff(response: string, allowedPath: string | null | undefined): string {
  if (response.includes("diff --git") || response.includes("--- ") || response.includes("+++ ")) {
    return response;
  }
  const path = allowedPath ?? "SCOPED_BLOCK.md";
  return [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, "@@", `+${response.replace(/\n/g, "\n+")}`].join("\n");
}

function assertDiffInScope(diff: string, allowedPath: string | null | undefined): void {
  if (diffEscapesScope(diff, allowedPath)) {
    throw new Error(`Coding agent diff escaped the selected block scope: ${allowedPath?.replace(/^\/+/, "")}`);
  }
}

function fakeWorkUnitDiff(context: WorkUnitContext, response: string): string {
  const workUnit = context.workUnit;
  const scope = workUnit.plannedWriteScopes[0];
  if (!scope) throw new Error(`Work unit ${workUnit.id} has no write scope for the fake provider.`);
  if (scope.permission === "rename") throw new Error("The fake work-unit provider does not synthesize rename proposals.");
  const startLine = scope.startLine ?? 1;
  const summary = response.replace(/\s+/g, " ").slice(0, 160);
  if (scope.permission === "create") {
    return [
      `diff --git a/${scope.path} b/${scope.path}`,
      "--- /dev/null",
      `+++ b/${scope.path}`,
      "@@ -0,0 +1,1 @@",
      `+${fakeProposalLine(scope.path, "", summary)}`
    ].join("\n");
  }

  const source = context.sources.find(
    (candidate) => candidate.path === scope.path && candidate.availability === "present" && candidate.exact
  );
  const sourceLines = source?.content.split(/\r?\n/) ?? [];
  const sourceStart = source?.startLine ?? 1;
  const sourceEnd = source?.endLine ?? sourceStart + Math.max(0, sourceLines.length - 1);
  const allowedEnd = scope.endLine ?? sourceEnd;
  const firstAllowedIndex = Math.max(0, startLine - sourceStart);
  let lineIndex = sourceLines.findIndex(
    (line, index) => index >= firstAllowedIndex && sourceStart + index <= allowedEnd && line.trim().length > 0
  );
  if (lineIndex < 0) lineIndex = firstAllowedIndex;
  const lineNumber = sourceStart + lineIndex;
  const originalLine = sourceLines[lineIndex] ?? "";

  if (scope.permission === "delete") {
    return [
      `diff --git a/${scope.path} b/${scope.path}`,
      `--- a/${scope.path}`,
      "+++ /dev/null",
      `@@ -${lineNumber},1 +${lineNumber},0 @@`,
      `-${originalLine}`
    ].join("\n");
  }

  const nextLine = sourceStart + lineIndex + 1 <= allowedEnd ? sourceLines[lineIndex + 1] : undefined;
  const previousLine = lineIndex > 0 && lineNumber - 1 >= startLine ? sourceLines[lineIndex - 1] : undefined;
  const hunkStart = previousLine === undefined ? lineNumber : lineNumber - 1;
  const hunkLines = previousLine === undefined
    ? [
        `-${originalLine}`,
        `+${fakeProposalLine(scope.path, originalLine, summary)}`,
        ...(nextLine === undefined ? [] : [` ${nextLine}`])
      ]
    : [
        ` ${previousLine}`,
        `-${originalLine}`,
        `+${fakeProposalLine(scope.path, originalLine, summary)}`
      ];
  const hunkCount = nextLine === undefined && previousLine === undefined ? 1 : 2;

  return [
    `diff --git a/${scope.path} b/${scope.path}`,
    `--- a/${scope.path}`,
    `+++ b/${scope.path}`,
    `@@ -${hunkStart},${hunkCount} +${hunkStart},${hunkCount} @@`,
    ...hunkLines
  ].join("\n");
}

function fakeProposalLine(filePath: string, originalLine: string, summary: string): string {
  const safeSummary = `GraphCode fake proposal: ${summary}`.replaceAll("*/", "* /");
  const extension = filePath.split(".").pop()?.toLowerCase() ?? "";
  if (["ts", "tsx", "js", "jsx", "mjs", "cjs", "go", "c", "h", "cc", "cpp", "hpp", "java", "kt", "rs", "swift"].includes(extension)) {
    return `${originalLine} // ${safeSummary}`;
  }
  if (["py", "rb", "sh", "bash", "zsh", "yml", "yaml", "toml"].includes(extension)) {
    return `${originalLine} # ${safeSummary}`;
  }
  if (["sql", "lua"].includes(extension)) {
    return `${originalLine} -- ${safeSummary}`;
  }
  if (["css", "scss", "less"].includes(extension)) {
    return `${originalLine} /* ${safeSummary} */`;
  }
  if (["html", "xml", "md", "mdx"].includes(extension)) {
    return `${originalLine} <!-- ${safeSummary} -->`;
  }
  return `${originalLine} `;
}

function normalizeDiffHeaderPath(value: string): string | null {
  const header = value.trim().split(/\s+/)[0];
  if (header === "/dev/null") return null;
  return header.replace(/^[ab]\//, "");
}

function diffEscapesScope(diff: string, allowedPath: string | null | undefined): boolean {
  if (!allowedPath) {
    return false;
  }
  const normalized = allowedPath.replace(/^\/+/, "");
  const touched = [...diff.matchAll(/^(?:\+\+\+|---) [ab]\/(.+)$/gm)].map((match) => match[1]);
  return touched.some((path) => path !== normalized && !path.startsWith(`${normalized}/`));
}

function parseReviewVerdict(response: string): "reviewed" | "bugged" | null {
  const match = response.trim().match(/GRAPHCODE_REVIEW_VERDICT:\s*(reviewed|bugged)\s*$/i);
  return match ? (match[1].toLowerCase() as "reviewed" | "bugged") : null;
}

function extractAllowedPath(content: string): string | null {
  const match = content.match(/^Allowed edit path:\s*(.+)$/m);
  const value = match?.[1]?.trim();
  return value && value !== "none" ? value : null;
}

async function boundedMap<T, R>(
  items: T[],
  parallelLimit: number,
  mapper: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(parallelLimit, items.length || 1));
  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      throwIfAgentCancelled(signal);
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function throwIfAgentCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const error = new Error("Agent indexing was cancelled.");
    error.name = "AbortError";
    throw error;
  }
}

function formatIndexCoverageForPrompt(state: IndexState): string {
  const counts = state.counts;
  const countSummary = `discovered=${counts.discovered}, supported=${counts.supported}, indexed=${counts.indexed}, unsupported=${counts.unsupported}, excluded=${counts.excluded}, failed=${counts.failed}`;
  if (state.completeness.status === "complete") {
    return `Index coverage: COMPLETE (${countSummary}). Repository-wide claims may use only this indexed revision.`;
  }
  if (state.completeness.status === "partial") {
    return `Index coverage warning: PARTIAL (${countSummary}). Reasons: ${state.completeness.reasons.join(" ")} Do not describe findings as repository-wide; explicitly identify omitted or unindexed regions.`;
  }
  if (state.completeness.status === "stale") {
    return `Index coverage warning: STALE since ${state.completeness.sinceRevision}; ${state.completeness.changedFiles.length} changed files are not represented. Do not claim current repository-wide coverage.`;
  }
  return `Index coverage warning: FAILED (${state.completeness.errorCode}); last complete revision ${state.completeness.lastCompleteRevision ?? "none"}. Do not claim repository-wide coverage.`;
}
