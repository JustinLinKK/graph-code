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
  type CodingAgentRequest,
  type GraphEdge,
  type GraphNode,
  type GraphPatch,
  type GraphStatusPatch,
  type NodeDetail,
  type PlanningChatRequest,
  type ReviewAgentRequest,
  type ScanningAgentRequest,
  graphPatchSchema
} from "@graphcode/graph-model";
import { z } from "zod";

const execFileAsync = promisify(execFile);

export type GraphCodeToolbox = {
  readGraph: (projectId: string) => Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>;
  getNodeDetail: (nodeId: string) => Promise<NodeDetail>;
  setStatuses: (projectId: string, patches: GraphStatusPatch[]) => Promise<void>;
  applyGraphPatch: (projectId: string, patch: GraphPatch, runId?: string) => Promise<void>;
  readSourceFile: (relativePath: string) => Promise<string>;
  writeCodeProposal: (projectId: string, runId: string | null, targetNodeId: string | null, diff: string) => Promise<void>;
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
      const detail = await options.toolbox.getNodeDetail(input.nodeId);
      const allowedPath = detail.node.source.path ?? detail.node.code.directory;
      const source = allowedPath ? await options.toolbox.readSourceFile(allowedPath) : "";
      const gitStatus = await options.toolbox.readGitStatus(input.projectId);
      const response = await provider.invoke([
        { role: "system", content: resolveSystemPrompt(options.config, "Return a unified diff scoped only to the selected GraphCode block.") },
        {
          role: "user",
          content: [
            `Node: ${detail.node.name} (${detail.node.id})`,
            `Allowed path: ${allowedPath ?? "none"}`,
            `Code context: ${detail.node.code.context}`,
            `User prompt: ${input.prompt ?? "Implement the scoped graph change."}`,
            `Git status:\n${gitStatus}`,
            source ? `Source:\n${source.slice(0, 12000)}` : "Source unavailable; produce a proposal note."
          ].join("\n\n")
        }
      ]);
      const diff = normalizeDiff(response, allowedPath);
      assertDiffInScope(diff, allowedPath);
      await options.toolbox.writeCodeProposal(input.projectId, options.runId ?? null, input.nodeId, diff);
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
    prompt: input.rootPath ?? input.projectId,
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

export const graphDatabaseToolSchemas = {
  "graphcode.db.read_graph": z.object({ projectId: z.string() }),
  "graphcode.db.get_node_detail": z.object({ nodeId: z.string() }),
  "graphcode.db.apply_graph_patch": z.object({ projectId: z.string(), patch: graphPatchSchema }),
  "graphcode.db.set_statuses": z.object({ projectId: z.string(), patches: z.array(z.unknown()) }),
  "graphcode.repo.read_git_status": z.object({ projectId: z.string() }),
  "graphcode.repo.read_source_file": z.object({ path: z.string() }),
  "graphcode.repo.write_code_proposal": z.object({ projectId: z.string(), runId: z.string().nullable(), targetNodeId: z.string().nullable(), diff: z.string() })
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
      invoke: async (messages) => `Fake ${config.agentKind} response: ${messages.at(-1)?.content.slice(0, 600) ?? ""}`
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
