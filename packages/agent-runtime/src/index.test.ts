import { describe, expect, it, vi } from "vitest";
import type { AgentConfig, GraphEdge, GraphNode, NodeDetail } from "@graphcode/graph-model";
import { runCodingAgent, runPlanningAgent, runReviewAgent, runScanningAgent, type GraphCodeToolbox } from "./index";

const baseConfig: AgentConfig = {
  agentKind: "planning",
  provider: "fake",
  model: "fake",
  parallelLimit: 2,
  apiKeySource: { type: "env", value: "" },
  systemPromptSource: { type: "manual", value: "Test prompt" }
};

const node: GraphNode = {
  id: "node-1",
  projectId: "project",
  kind: "module",
  name: "Module",
  summary: "Module summary",
  code: {
    context: "Scoped code context",
    directory: "src/module.ts",
    startLine: 1,
    endLine: 4,
    language: "typescript"
  },
  parentId: null,
  attachedToId: null,
  customTypeId: null,
  source: { path: "src/module.ts", startLine: 1, endLine: 4 },
  position: { x: 0, y: 0 },
  size: { width: 224, height: 120 },
  childCount: 0,
  hasChildren: false,
  agentStatus: "none",
  gitStatus: null,
  tags: [],
  createdAt: "now",
  updatedAt: "now"
};

const detail: NodeDetail = {
  node,
  childCount: 0,
  hasChildren: false,
  dependencies: [],
  inputs: [],
  outputs: [],
  processes: [],
  formats: [],
  basicDetails: [],
  incomingEdges: [],
  outgoingEdges: [],
  relatedNodes: [],
  reusedIn: []
};

function toolbox(overrides: Partial<GraphCodeToolbox> = {}): GraphCodeToolbox {
  return {
    readGraph: vi.fn(async () => ({ nodes: [node], edges: [] as GraphEdge[] })),
    getNodeDetail: vi.fn(async () => detail),
    setStatuses: vi.fn(async () => {}),
    applyGraphPatch: vi.fn(async () => {}),
    readSourceFile: vi.fn(async () => "export const value = 1;\n"),
    writeCodeProposal: vi.fn(async () => {}),
    readGitStatus: vi.fn(async () => ""),
    listScannableFiles: vi.fn(async () => ["src/a.ts", "src/b.ts", "README.md"]),
    upsertScannedFileNode: vi.fn(async (_projectId, filePath) => ({ ...node, id: `scan-${filePath}`, name: filePath, source: { ...node.source, path: filePath } })),
    ...overrides
  };
}

describe("GraphCode agent runtime", () => {
  it("runs the planning agent through LangGraph and marks scoped status", async () => {
    const tools = toolbox();
    const result = await runPlanningAgent(
      {
        projectId: "project",
        prompt: "Add a cache block",
        scopeNodeId: "node-1"
      },
      { config: baseConfig, runId: "run-1", toolbox: tools }
    );

    expect(result.response).toContain("Fake planning response");
    expect(result.response).toContain("Parallel graph slice notes");
    expect(tools.setStatuses).toHaveBeenCalledWith("project", [expect.objectContaining({ entityId: "node-1", status: "planning" })]);
  });

  it("stores a scoped coding proposal and marks the block coded", async () => {
    const tools = toolbox();
    const result = await runCodingAgent(
      {
        projectId: "project",
        nodeId: "node-1",
        prompt: "Update value"
      },
      { config: { ...baseConfig, agentKind: "coding" }, runId: "run-2", toolbox: tools }
    );

    expect(result.diff).toContain("src/module.ts");
    expect(tools.writeCodeProposal).toHaveBeenCalled();
    expect(tools.setStatuses).toHaveBeenCalledWith("project", [expect.objectContaining({ status: "coded" })]);
  });

  it("rejects coding diffs that leave the selected source scope", async () => {
    await expect(
      runCodingAgent(
        {
          projectId: "project",
          nodeId: "node-1"
        },
        {
          config: { ...baseConfig, agentKind: "coding", provider: "fake" },
          runId: "run-3",
          toolbox: toolbox({
            readSourceFile: vi.fn(async () => "diff --git a/src/other.ts b/src/other.ts\n--- a/src/other.ts\n+++ b/src/other.ts\n@@\n+bad")
          })
        }
      )
    ).rejects.toThrow(/escaped/);
  });

  it("scans files with the configured parallel limit", async () => {
    const tools = toolbox();
    const result = await runScanningAgent(
      { projectId: "project" },
      { config: { ...baseConfig, agentKind: "scanning", parallelLimit: 2 }, runId: "run-4", toolbox: tools }
    );

    expect(result.response).toContain("Scanned 3 files");
    expect(tools.upsertScannedFileNode).toHaveBeenCalledTimes(3);
    expect(tools.setStatuses).toHaveBeenCalledWith("project", expect.arrayContaining([expect.objectContaining({ status: "implemented" })]));
  });

  it("marks reviewed or bugged after review", async () => {
    const passTools = toolbox();
    await runReviewAgent(
      { projectId: "project", runId: "run-coded", targetNodeId: "node-1", diff: "diff --git a/src/module.ts b/src/module.ts\n+ok" },
      { config: { ...baseConfig, agentKind: "review" }, runId: "run-review-pass", toolbox: passTools }
    );
    expect(passTools.setStatuses).toHaveBeenCalledWith("project", [expect.objectContaining({ status: "reviewed" })]);

    const failTools = toolbox();
    await runReviewAgent(
      { projectId: "project", runId: "run-coded", targetNodeId: "node-1", diff: "diff --git a/src/module.ts b/src/module.ts\n+BUG" },
      { config: { ...baseConfig, agentKind: "review" }, runId: "run-review-fail", toolbox: failTools }
    );
    expect(failTools.setStatuses).toHaveBeenCalledWith("project", [expect.objectContaining({ status: "bugged" })]);
  });
});
