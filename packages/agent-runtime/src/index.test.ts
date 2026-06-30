import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AgentConfig, CanvasGraph, GraphEdge, GraphNode, NodeDetail } from "@graphcode/graph-model";
import { runCodingAgent, runPlanningAgent, runReviewAgent, runScanningAgent, type GraphCodeToolbox } from "./index";

const baseConfig: AgentConfig = {
  agentKind: "planning",
  provider: "fake",
  model: "fake",
  parallelLimit: 2,
  apiKeySource: { type: "env", value: "" },
  systemPromptSource: { type: "manual", value: "Test prompt" }
};

const execution = {
  testScriptDirectory: "tests/generated",
  virtualEnvironment: ".venv",
  workingDirectory: ".",
  setupCommand: "pnpm install",
  testCommand: "pnpm test"
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
	  execution,
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

function canvas(nodes: GraphNode[] = [node], edges: GraphEdge[] = []): CanvasGraph {
  return {
    project: {
      id: "project",
      name: "Project",
      rootPath: "/tmp/project",
      description: "",
      scanningInstructions: "",
      createdAt: "now",
      updatedAt: "now"
    },
    rootNodeId: nodes[0]?.id ?? null,
    scopeNodeId: nodes[0]?.id ?? null,
    scopeLabel: nodes[0]?.name ?? "Project",
    nodes,
    edges,
    boundaries: [],
    dependencies: [],
    io: [],
    processes: [],
    formats: [],
    basicDetails: [],
    customTypes: [],
    nodeTypeStyles: [],
    reuses: []
  };
}

function toolbox(overrides: Partial<GraphCodeToolbox> = {}): GraphCodeToolbox {
  return {
    readGraph: vi.fn(async () => ({ nodes: [node], edges: [] as GraphEdge[] })),
	    getNodeDetail: vi.fn(async () => detail),
	    getCanvasGraph: vi.fn(async () => canvas()),
	    resolveExecutionMetadata: vi.fn(async () => execution),
	    setStatuses: vi.fn(async () => {}),
    applyGraphPatch: vi.fn(async () => {}),
    readSourceFile: vi.fn(async () => "export const value = 1;\n"),
    writeCodeProposal: vi.fn(async () => {}),
    readGitStatus: vi.fn(async () => ""),
    refreshCodeGraph: vi.fn(async () => ({ nodeCount: 12, edgeCount: 4, fileCount: 3, symbolCount: 5, workflowNodeCount: 4 })),
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
        mode: "medium",
        prompt: "Update value"
      },
      { config: { ...baseConfig, agentKind: "coding" }, runId: "run-2", toolbox: tools }
    );

	    expect(result.diff).toContain("src/module.ts");
	    expect(result.response).toContain("virtualEnvironment=.venv");
	    expect(result.response).toContain("testScriptDirectory=tests/generated");
	    expect(tools.writeCodeProposal).toHaveBeenCalled();
	    expect(tools.setStatuses).toHaveBeenCalledWith("project", [expect.objectContaining({ status: "coded" })]);
	  });

	  it("stores parsed test artifact manifests with coding proposals", async () => {
	    const command = path.join(os.tmpdir(), `graphcode-agent-${crypto.randomUUID()}.sh`);
	    fs.writeFileSync(
	      command,
	      [
	        "#!/bin/sh",
	        "cat <<'EOF'",
	        "diff --git a/src/module.ts b/src/module.ts",
	        "--- a/src/module.ts",
	        "+++ b/src/module.ts",
	        "@@",
	        "+export const value = 2;",
	        "GRAPHCODE_TEST_ARTIFACTS_JSON",
	        "{\"testScriptDirectory\":\"tests/generated\",\"scripts\":[{\"relativePath\":\"module.test.ts\",\"content\":\"test('value', () => {})\"}]}",
	        "EOF"
	      ].join("\n"),
	      { mode: 0o755 }
	    );
	    const tools = toolbox();

	    await runCodingAgent(
	      {
	        projectId: "project",
	        nodeId: "node-1",
	        mode: "small",
	        prompt: "Update value and test it"
	      },
	      { config: { ...baseConfig, agentKind: "coding", provider: "claudecode", model: command }, runId: "run-artifact", toolbox: tools }
	    );

	    expect(tools.writeCodeProposal).toHaveBeenCalledWith(
	      "project",
	      "run-artifact",
	      "node-1",
	      expect.stringContaining("diff --git a/src/module.ts b/src/module.ts"),
	      expect.objectContaining({
	        scripts: [expect.objectContaining({ relativePath: "module.test.ts" })]
	      })
	    );
	  });

  it("includes function workflow canvas context for medium coding runs", async () => {
    const functionNode: GraphNode = {
      ...node,
      id: "function-do-work",
      kind: "function",
      name: "doWork",
      summary: "Function summary"
    };
    const processNode: GraphNode = {
      ...node,
      id: "process-validate",
      kind: "process",
      name: "Validate input",
      summary: "Checks the input before returning.",
      parentId: null,
      attachedToId: functionNode.id,
      source: { path: "src/module.ts", startLine: 2, endLine: 3 }
    };
    const outputNode: GraphNode = {
      ...node,
      id: "output-result",
      kind: "output",
      name: "Result",
      summary: "Returned value.",
      parentId: null,
      attachedToId: functionNode.id
    };
    const flow: GraphEdge = {
      id: "flow-process-output",
      projectId: "project",
      kind: "flows",
      sourceNodeId: processNode.id,
      targetNodeId: outputNode.id,
      label: "return",
      codeContext: "Validated data flows to the return value.",
      color: "#059669",
      animated: true,
      pointingEnabled: true,
      pointingDirection: "source_to_target",
      agentStatus: "implemented",
      gitStatus: null,
      tags: [],
      createdAt: "now"
    };
    const tools = toolbox({
      readGraph: vi.fn(async () => ({ nodes: [functionNode, processNode, outputNode], edges: [flow] })),
      getNodeDetail: vi.fn(async () => ({ ...detail, node: functionNode })),
      getCanvasGraph: vi.fn(async () => canvas([functionNode, processNode, outputNode], [flow]))
    });

    const result = await runCodingAgent(
      {
        projectId: "project",
        nodeId: functionNode.id,
        mode: "medium",
        prompt: "Use workflow context"
      },
      { config: { ...baseConfig, agentKind: "coding" }, runId: "run-workflow", toolbox: tools }
    );

    expect(tools.getCanvasGraph).toHaveBeenCalledWith("project", functionNode.id, true);
    expect(result.response).toContain("Coding mode: medium");
    expect(result.response).toContain("process-validate");
    expect(result.response).toContain("flow-process-output");
  });

	  it("rejects coding diffs that leave the selected source scope", async () => {
	    const command = path.join(os.tmpdir(), `graphcode-agent-bad-${crypto.randomUUID()}.sh`);
	    fs.writeFileSync(
	      command,
	      ["#!/bin/sh", "cat <<'EOF'", "diff --git a/src/other.ts b/src/other.ts", "--- a/src/other.ts", "+++ b/src/other.ts", "@@", "+bad", "EOF"].join("\n"),
	      { mode: 0o755 }
	    );
	    await expect(
	      runCodingAgent(
        {
          projectId: "project",
          nodeId: "node-1",
          mode: "medium"
        },
	        {
	          config: { ...baseConfig, agentKind: "coding", provider: "claudecode", model: command },
	          runId: "run-3",
	          toolbox: toolbox()
	        }
	      )
    ).rejects.toThrow(/escaped/);
  });

  it("refreshes the parser-backed code graph", async () => {
    const tools = toolbox();
    const result = await runScanningAgent(
      { projectId: "project" },
      { config: { ...baseConfig, agentKind: "scanning", parallelLimit: 2 }, runId: "run-4", toolbox: tools }
    );

    expect(result.response).toContain("Scanned 3 files");
    expect(result.response).toContain("12 Code Graph nodes");
    expect(tools.refreshCodeGraph).toHaveBeenCalledWith("project", undefined);
    expect(tools.setStatuses).not.toHaveBeenCalled();
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
