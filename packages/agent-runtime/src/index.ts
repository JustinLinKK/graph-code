import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import {
  type AgentConfig,
  type AgentKind,
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
  type ScanningAgentRequest,
  codeProposalArtifactManifestSchema,
  graphPatchSchema,
  isAttachmentNodeKind,
  isDomainNodeKind
} from "@graphcode/graph-model";
import { z } from "zod";

const execFileAsync = promisify(execFile);

export type GraphCodeToolbox = {
  readGraph: (projectId: string) => Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>;
  getNodeDetail: (nodeId: string) => Promise<NodeDetail>;
  getCanvasGraph: (projectId: string, rootNodeId: string, includeAttachments?: boolean) => Promise<CanvasGraph>;
  resolveExecutionMetadata: (nodeId: string) => Promise<BlockExecutionMetadata>;
  setStatuses: (projectId: string, patches: GraphStatusPatch[]) => Promise<void>;
  applyGraphPatch: (projectId: string, patch: GraphPatch, runId?: string) => Promise<void>;
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
  runId?: string;
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
      const provider = createProvider(options.config);
      const graph = await options.toolbox.readGraph(input.projectId);
      const scope = input.scopeNodeId ? graph.nodes.find((node) => node.id === input.scopeNodeId) : null;
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
        { role: "system", content: resolveSystemPrompt(options.config, "Plan safe GraphCode graph patches from user intent.") },
        {
          role: "user",
          content: [
            `Prompt: ${input.prompt}`,
            scope ? `Scope: ${scope.name} (${scope.kind}) ${scope.summary}` : "Scope: workspace",
            `Parallel graph slice notes:\n${chunkNotes.map((note, index) => `Slice ${index + 1}: ${note}`).join("\n\n")}`
          ].join("\n")
        }
      ]);
      const patch = graphPatchSchema.parse({
        summary: response.trim() || `Planned graph changes for: ${input.prompt}`,
        operations: []
      });
      if (input.scopeNodeId) {
        await options.toolbox.setStatuses(input.projectId, [
          {
            entityType: "node",
            entityId: input.scopeNodeId,
            status: "planning",
            note: "Planning agent scoped this graph block.",
            agentRunId: options.runId ?? null
          }
        ]);
      }
      return {
        response,
        graphPatch: patch,
        touched: input.scopeNodeId
          ? [
              {
                entityType: "node",
                entityId: input.scopeNodeId,
                status: "planning",
                note: "Planning agent scoped this graph block.",
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
      const provider = createProvider(options.config);
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

export async function runReviewAgent(input: ReviewAgentRequest & { diff?: string; targetNodeId?: string | null }, options: AgentRuntimeOptions): Promise<AgentResult> {
  return runLangGraphTask({
    kind: "review",
    prompt: input.runId,
    execute: async () => {
      const provider = createProvider(options.config);
      const diff = input.diff ?? "";
      const hasBug = /\bBUG\b|\bFAIL\b|\berror\b/i.test(diff);
      const response = await provider.invoke([
        { role: "system", content: resolveSystemPrompt(options.config, "Review diffs for bugs, test gaps, and scope leaks.") },
        { role: "user", content: `Review this diff:\n${diff || "(no diff available)"}` }
      ]);
      const status: AgentStatus = hasBug ? "bugged" : "reviewed";
      const touched = input.targetNodeId
        ? [
            {
              entityType: "node" as const,
              entityId: input.targetNodeId,
              status,
              note: hasBug ? "Review agent found a likely issue." : "Review agent accepted the patch proposal.",
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
      const result = await options.toolbox.refreshCodeGraph(input.projectId, input.rootPath);
      return {
        response: [
          `Scanned ${result.fileCount} files into ${result.nodeCount} Code Graph nodes.`,
          `Extracted ${result.symbolCount} symbols, ${result.workflowNodeCount} workflow blocks, and ${result.edgeCount} edges.`
        ].join(" "),
        touched: []
      };
    }
  });
}

function scanningPrompt(input: ScanningAgentRequest): string {
  return (
    [
      input.rootPath ? `Root path: ${input.rootPath}` : `Project: ${input.projectId}`,
      input.projectDescription ? `Project description:\n${input.projectDescription}` : "",
      input.scanningInstructions ? `Scanning instructions:\n${input.scanningInstructions}` : ""
    ]
      .filter(Boolean)
      .join("\n\n") || input.projectId
  );
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

function createProvider(config: AgentConfig): { invoke: (messages: PromptMessage[]) => Promise<string> } {
	  if (config.provider === "fake") {
	    return {
	      invoke: async (messages) => `Fake ${config.agentKind} response: ${messages.at(-1)?.content.slice(0, 4000) ?? ""}`
	    };
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
  return {
    invoke: async (messages) => {
      const command = config.model || "claude";
      const prompt = messages.map((message) => `${message.role}: ${message.content}`).join("\n\n");
      const { stdout } = await execFileAsync(command, ["-p", prompt], {
        timeout: 120000,
        maxBuffer: 1024 * 1024 * 4
      });
      return stdout.trim();
    }
  };
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

function resolveApiKey(config: AgentConfig): string | undefined {
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

function resolveSystemPrompt(config: AgentConfig, fallback: string): string {
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
  if (!allowedPath) {
    return;
  }
  const normalized = allowedPath.replace(/^\/+/, "");
  const touched = [...diff.matchAll(/^(?:\+\+\+|---) [ab]\/(.+)$/gm)].map((match) => match[1]);
  const outOfScope = touched.some((path) => path !== normalized && !path.startsWith(`${normalized}/`));
  if (outOfScope) {
    throw new Error(`Coding agent diff escaped the selected block scope: ${normalized}`);
  }
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
