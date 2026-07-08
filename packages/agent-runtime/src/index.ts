import { spawn } from "node:child_process";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import {
  AVAILABLE_EXTENSION_PACKAGES,
    type AgentConfig,
    type AgentKind,
    type AgentRun,
    type AgentStatus,
  type BlockExecutionMetadata,
  type CanvasGraph,
  type CodingAgentRequest,
  type CodeProposalArtifactManifest,
  type GraphEdge,
  type GraphNode,
  type GraphPatch,
  type GraphStatusPatch,
  type NodeDetail,
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

export type GraphCodeToolbox = {
  readGraph: (projectId: string) => Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>;
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
  writeCodeProposal: (projectId: string, runId: string | null, targetNodeId: string | null, diff: string, artifactManifest?: CodeProposalArtifactManifest | null) => Promise<void>;
  readGitStatus: (projectId: string) => Promise<string>;
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

type PlanningGraph = Awaited<ReturnType<GraphCodeToolbox["readGraph"]>>;

export type AgentRuntimeOptions = {
  config: AgentConfig;
  scanningConfigs?: Partial<Record<ScanningAgentMode, ScanningAgentConfig>>;
  runId?: string;
  workspaceRoot?: string;
  toolbox: GraphCodeToolbox;
};

export type AgentResult = {
  response: string;
  diff?: string;
  graphPatch?: GraphPatch | null;
  touched?: GraphStatusPatch[];
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
      const graph = await options.toolbox.readGraph(input.projectId);
      const scope = input.scopeNodeId ? graph.nodes.find((node) => node.id === input.scopeNodeId) ?? null : null;
      const planningChunks = buildPlanningContextChunks(graph, options.config.parallelLimit);
      const chunkNotes = await boundedMap(planningChunks, options.config.parallelLimit, async (chunk, index) =>
        provider.invoke([
          { role: "system", content: resolveSystemPrompt(options.config, "Analyze one GraphCode graph slice for a planning agent.") },
          {
            role: "user",
            content: [
              `Planning prompt: ${input.prompt}`,
              scope ? `Scope: ${scope.name} (${scope.kind}) ${scope.summary}` : "Scope: workspace",
              `Slice ${index + 1} of ${planningChunks.length}`,
              `Nodes: ${chunk.nodes.map((node) => `${node.id}:${node.name}:${node.kind}:${node.summary}`).join("\n")}`,
              `Edges: ${chunk.edges.map((edge) => `${edge.id}:${edge.sourceNodeId}->${edge.targetNodeId}:${edge.kind}:${edge.label ?? ""}`).join("\n")}`
            ].join("\n")
          }
        ])
      );
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
            `Parallel graph slice notes:\n${chunkNotes.map((note, index) => `Slice ${index + 1}: ${note}`).join("\n\n")}`
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
      const graph = await options.toolbox.readGraph(input.projectId);
      const organizationScope = resolveCodingOrganizationScope(detail.node, graph.nodes);
      const scopeCanvas =
        organizationScope && mode !== "small" ? await options.toolbox.getCanvasGraph(input.projectId, organizationScope.id, true).catch(() => null) : null;
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
          prompt: input.prompt
        });
        const response = await provider.invoke([
          { role: "system", content: resolveSystemPrompt(options.config, "Return a unified diff scoped only to the selected GraphCode block. If you create test scripts, append GRAPHCODE_TEST_ARTIFACTS_JSON followed by a compact JSON artifact manifest.") },
          { role: "user", content: context }
        ]);
        const { content: responseWithoutArtifacts, artifactManifest } = extractCodeProposalArtifactManifest(response);
        const diff = normalizeDiff(responseWithoutArtifacts, allowedPath);
        assertDiffInScope(diff, allowedPath);
        await options.toolbox.writeCodeProposal(input.projectId, options.runId ?? null, input.nodeId, diff, artifactManifest);
      const touched: GraphStatusPatch[] = [
        {
          entityType: "node",
          entityId: input.nodeId,
          status: "coded",
          note: "Coding agent produced a patch proposal.",
          agentRunId: options.runId ?? null
        }
      ];
      await options.toolbox.setStatuses(input.projectId, touched);
      return { response, diff, touched };
    }
  });
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
      const graph = await options.toolbox.readGraph(input.projectId);
      const detail = input.targetNodeId ? await options.toolbox.getNodeDetail(input.targetNodeId) : null;
      const organizationScope = detail ? resolveCodingOrganizationScope(detail.node, graph.nodes) : null;
      const scopeCanvas =
        detail && organizationScope && mode !== "small" ? await options.toolbox.getCanvasGraph(input.projectId, organizationScope.id, true).catch(() => null) : null;
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
        diff
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
      const scanConfigs = resolveScanningConfigs(options);
      const inventory = await options.toolbox.listScannableFiles(input.projectId);
      const previousStates = await options.toolbox.getScanFileStates(input.projectId);
      const previousByPath = new Map(previousStates.map((state) => [state.filePath, state.contentHash]));
      const inventoryByPath = new Map(inventory.map((file) => [file.path, file]));
      const changedFiles = inventory.filter((file) => previousByPath.get(file.path) !== file.contentHash);
      const deletedFiles = previousStates.filter((state) => !inventoryByPath.has(state.filePath));
      const initial = previousStates.length === 0;
      const localTargets = initial ? inventory : changedFiles;
      const localOutputs = await boundedMap(localTargets, scanConfigs.local.parallelLimit, (file) =>
        runLocalScan(input, file, scanConfigs.local, options.toolbox, options.workspaceRoot)
      );
      const mediumScopes = directoriesForScan(initial ? inventory : [...changedFiles, ...deletedFiles.map((file) => ({ path: file.filePath, contentHash: file.contentHash, size: 0, language: "unknown" }))]);
      const mediumOutputs = await boundedMap(mediumScopes, scanConfigs.medium.parallelLimit, (scopePath) =>
        runMediumScan(input, scopePath, inventory, localOutputs, scanConfigs.medium, options.workspaceRoot)
      );
      const unchangedGraphSummary = initial
        ? { nodes: [], edges: [] }
        : compactUnchangedGraphSummary(await options.toolbox.readGraph(input.projectId), [
            ...changedFiles.map((file) => file.path),
            ...deletedFiles.map((file) => file.filePath)
          ]);
      const globalOutput = await runGlobalScan(input, inventory, localOutputs, mediumOutputs, unchangedGraphSummary, scanConfigs.global, options.workspaceRoot);
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
      return {
        response: [
          `Scanned ${result.fileCount} files into ${result.nodeCount} Code Graph nodes.`,
          `Changed ${changedFiles.length} files, removed ${deletedFiles.length} files, ran ${localOutputs.length} local, ${mediumOutputs.length} medium, and 1 global scan pass.`,
          `Extracted ${result.symbolCount} symbols, ${result.workflowNodeCount} workflow blocks, and ${result.edgeCount} edges.`
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

type ProviderConfig = Omit<AgentConfig, "agentKind"> & { agentKind?: AgentKind; mode?: string };

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

async function invokeCodexCli(config: ProviderConfig, messages: PromptMessage[], workspaceRoot?: string): Promise<string> {
  const command = resolveCliCommand(config, "codex");
  const cwd = workspaceRoot ?? process.cwd();
  const prompt = buildCliPrompt(messages, {
    providerName: "Codex CLI",
    systemInPrompt: true
  });
  const { stdout } = await runCliCommand(command, ["exec", "--cd", cwd, "--sandbox", "read-only", "--ask-for-approval", "never", "-"], {
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
  const prompt = buildCliPrompt(messages, {
    providerName: "Claude Code CLI",
    systemInPrompt: false
  });
  const { stdout } = await runCliCommand(
    command,
    [
      "-p",
      "--append-system-prompt",
      systemPrompt,
      "--permission-mode",
      "plan",
      "--disallowedTools",
      "Edit",
      "MultiEdit",
      "Write",
      "NotebookEdit",
      "--output-format",
      "text",
      prompt
    ],
    {
      cwd,
      timeout: 120000,
      maxBuffer: 1024 * 1024 * 4
    }
  );
  return stdout.trim();
}

function resolveCliCommand(config: ProviderConfig, fallback: string): string {
  return config.model.trim() || fallback;
}

function systemPromptFromMessages(messages: PromptMessage[]): string {
  return messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n")
    .trim();
}

function buildCliPrompt(messages: PromptMessage[], options: { providerName: string; systemInPrompt: boolean }): string {
  const system = systemPromptFromMessages(messages);
  const conversation = messages
    .filter((message) => options.systemInPrompt || message.role !== "system")
    .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
    .join("\n\n");
  return [
    `GraphCode ${options.providerName} account-plan invocation.`,
    "Use the GraphCode role/mode instructions as the active skill for this run.",
    options.systemInPrompt && system ? `GraphCode skill instructions:\n${system}` : "",
    "Do not edit, write, or apply files directly. Return the requested GraphCode response only so the app can store, review, and apply proposals.",
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
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"]
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
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (stdout.length + stderr.length > options.maxBuffer) {
        child.kill("SIGTERM");
        finish(new Error(`${command} produced more than ${options.maxBuffer} bytes of output.`));
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
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
    child.stdin.end(options.input ?? "");
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

function buildPlanningContextChunks(graph: PlanningGraph, parallelLimit: number): PlanningGraph[] {
  const workerCount = Math.max(1, Math.min(parallelLimit, Math.max(graph.nodes.length, 1)));
  const chunks: PlanningGraph[] = Array.from({ length: workerCount }, () => ({ nodes: [], edges: [] }));
  graph.nodes.forEach((node, index) => {
    chunks[index % workerCount].nodes.push(node);
  });
  graph.edges.forEach((edge, index) => {
    chunks[index % workerCount].edges.push(edge);
  });
  return chunks.filter((chunk) => chunk.nodes.length > 0 || chunk.edges.length > 0);
}

async function boundedMap<T, R>(items: T[], parallelLimit: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(parallelLimit, items.length || 1));
  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
