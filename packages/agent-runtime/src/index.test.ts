import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AgentConfig, CanvasGraph, GraphEdge, GraphNode, NodeDetail } from "@graphcode/graph-model";
import { runCodingAgent, runPlanningAgent, runReviewAgent, runScanningAgent, scanLocalOutputSchema, type GraphCodeToolbox, type ScanPipelineResult } from "./index";

const baseConfig: AgentConfig = {
  agentKind: "planning",
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
    extensionDetails: [],
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
      extensionDetails: [],
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
    listScannableFiles: vi.fn(async () => [
      { path: "src/module.ts", contentHash: "hash-module", size: 24, language: "typescript" },
      { path: "src/other.ts", contentHash: "hash-other", size: 12, language: "typescript" },
      { path: "README.md", contentHash: "hash-readme", size: 8, language: "markdown" }
    ]),
    getScanFileStates: vi.fn(async () => []),
    buildFakeLocalScanOutput: vi.fn(async (_projectId, file) => ({
      filePath: file.path,
      contentHash: file.contentHash,
      summary: `Fake local scan for ${file.path}`,
      nodes: [
        {
          stableKey: `file:${file.path}`,
          kind: "module" as const,
          name: file.path.split("/").at(-1) ?? file.path,
          summary: `File ${file.path}`,
          codeContext: `File ${file.path}`,
          source: { path: file.path, startLine: 1, endLine: 1 },
          language: file.language === "markdown" ? ("markdown" as const) : ("typescript" as const),
          parentStableKey: "dir:."
        }
      ],
      edges: []
    })),
    applyScanResult: vi.fn(async (_projectId, result) => ({
      nodeCount: 12,
      edgeCount: 4,
      fileCount: result.inventory.length,
      symbolCount: result.localOutputs.length,
      workflowNodeCount: 4
    })),
    readSourceFile: vi.fn(async () => "export const value = 1;\n"),
    writeCodeProposal: vi.fn(async () => {}),
    readGitStatus: vi.fn(async () => ""),
    refreshCodeGraph: vi.fn(async () => ({ nodeCount: 12, edgeCount: 4, fileCount: 3, symbolCount: 5, workflowNodeCount: 4 })),
    ...overrides
  };
}

function writeFakeCli(outputLines: string[], options: { argsLog?: string; stdinLog?: string } = {}): string {
  const command = path.join(os.tmpdir(), `graphcode-agent-${crypto.randomUUID()}${process.platform === "win32" ? ".cmd" : ".sh"}`);
  if (process.platform === "win32") {
    fs.writeFileSync(command, windowsFakeCli(outputLines, options), { mode: 0o755 });
  } else {
    fs.writeFileSync(command, unixFakeCli(outputLines, options), { mode: 0o755 });
  }
  return command;
}

function unixFakeCli(outputLines: string[], options: { argsLog?: string; stdinLog?: string }): string {
  return [
    "#!/bin/sh",
    options.argsLog ? `printf '%s\\n' "$@" > ${shellQuote(options.argsLog)}` : "",
    options.stdinLog ? `cat > ${shellQuote(options.stdinLog)}` : "",
    "cat <<'EOF'",
    ...outputLines,
    "EOF"
  ]
    .filter(Boolean)
    .join("\n");
}

function windowsFakeCli(outputLines: string[], options: { argsLog?: string; stdinLog?: string }): string {
  return [
    "@echo off",
    options.argsLog ? `if exist "${options.argsLog}" del "${options.argsLog}"` : "",
    options.argsLog ? ":args_loop" : "",
    options.argsLog ? "if \"%~1\"==\"\" goto after_args" : "",
    options.argsLog ? `>>"${options.argsLog}" echo(%~1` : "",
    options.argsLog ? "shift" : "",
    options.argsLog ? "goto args_loop" : "",
    options.argsLog ? ":after_args" : "",
    options.stdinLog ? `more > "${options.stdinLog}"` : "",
    ...outputLines.map((line) => `echo(${escapeBatchEcho(line)}`)
  ]
    .filter(Boolean)
    .join("\r\n");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function escapeBatchEcho(value: string): string {
  return value.replace(/\^/g, "^^").replace(/%/g, "%%").replace(/&/g, "^&").replace(/</g, "^<").replace(/>/g, "^>").replace(/\|/g, "^|");
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n");
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
    expect(result.graphPatch?.operations).toEqual([
      expect.objectContaining({ entityType: "node", entityId: "node-1", action: "update" })
    ]);
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
      const argsLog = path.join(os.tmpdir(), `graphcode-agent-${crypto.randomUUID()}.args`);
      const command = writeFakeCli(
        [
          "diff --git a/src/module.ts b/src/module.ts",
          "--- a/src/module.ts",
          "+++ b/src/module.ts",
          "@@",
          "+export const value = 2;",
          "GRAPHCODE_TEST_ARTIFACTS_JSON",
          "{\"testScriptDirectory\":\"tests/generated\",\"scripts\":[{\"relativePath\":\"module.test.ts\",\"content\":\"test('value', () => {})\"}]}"
        ],
        { argsLog }
      );
      const tools = toolbox();

      await runCodingAgent(
        {
          projectId: "project",
          nodeId: "node-1",
          mode: "small",
          prompt: "Update value and test it"
        },
        { config: { ...baseConfig, agentKind: "coding", provider: "claudecode", cliCommand: command, model: "sonnet" }, runId: "run-artifact", toolbox: tools }
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
      const args = normalizeNewlines(fs.readFileSync(argsLog, "utf8"));
      expect(args).toContain("--append-system-prompt\nTest prompt");
      expect(args).toContain("--permission-mode\nplan");
      expect(args).toContain("--disallowedTools\nEdit\n--disallowedTools\nMultiEdit\n--disallowedTools\nWrite\n--disallowedTools\nNotebookEdit");
      expect(args).toContain("--model\nsonnet");
      expect(args).toContain("--effort\nmedium");
      expect(args).toContain("GraphCode Claude Code CLI account-plan invocation.");
    });

    it("runs Claude Code direct-edit modes with model, effort, fast settings, and git diff capture", async () => {
      const argsLog = path.join(os.tmpdir(), `graphcode-claude-${crypto.randomUUID()}.args`);
      const command = writeFakeCli(["Claude edited files directly"], { argsLog });
      const directDiff = ["diff --git a/src/module.ts b/src/module.ts", "--- a/src/module.ts", "+++ b/src/module.ts", "@@", "+export const value = 4;"].join("\n");
      const tools = toolbox({
        readGitDiff: vi.fn(async () => directDiff)
      });

      const result = await runCodingAgent(
        {
          projectId: "project",
          nodeId: "node-1",
          mode: "small",
          prompt: "Edit directly with Claude"
        },
        {
          config: {
            ...baseConfig,
            agentKind: "coding",
            provider: "claudecode",
            cliCommand: command,
            model: "opus",
            reasoningEffort: "high",
            speedTier: "fast",
            permissionMode: "full_access",
            claudeSystemPromptMode: "default"
          },
          runId: "run-claude-direct",
          toolbox: tools
        }
      );

      const args = normalizeNewlines(fs.readFileSync(argsLog, "utf8"));
      expect(args).toContain("--permission-mode\nbypassPermissions");
      expect(args).toContain("--model\nopus");
      expect(args).toContain("--effort\nhigh");
      expect(args).toContain("--settings\n{\"fastMode\":true}");
      expect(args).not.toContain("--append-system-prompt");
      expect(result.diff).toContain("export const value = 4");
      expect(tools.writeCodeProposal).toHaveBeenCalledWith("project", "run-claude-direct", "node-1", directDiff, null);
      expect(tools.refreshCodeGraph).toHaveBeenCalledWith("project");
    });

    it("runs Codex CLI providers with workspace root and prompt skills on stdin", async () => {
      const argsLog = path.join(os.tmpdir(), `graphcode-codex-${crypto.randomUUID()}.args`);
      const stdinLog = path.join(os.tmpdir(), `graphcode-codex-${crypto.randomUUID()}.stdin`);
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "graphcode-workspace-"));
      const command = writeFakeCli(
        ["diff --git a/src/module.ts b/src/module.ts", "--- a/src/module.ts", "+++ b/src/module.ts", "@@", "+export const value = 3;"],
        { argsLog, stdinLog }
      );
      const tools = toolbox();

      const result = await runCodingAgent(
        {
          projectId: "project",
          nodeId: "node-1",
          mode: "small",
          prompt: "Update value through codex"
        },
        {
          config: { ...baseConfig, agentKind: "coding", provider: "codex", cliCommand: command, model: "gpt-5.4" },
          runId: "run-codex",
          workspaceRoot,
          toolbox: tools
        }
      );

      expect(result.diff).toContain("src/module.ts");
      expect(normalizeNewlines(fs.readFileSync(argsLog, "utf8"))).toBe(
        `--ask-for-approval\nnever\n-c\nmodel_reasoning_effort="medium"\n-c\ndeveloper_instructions="Test prompt"\nexec\n--cd\n${workspaceRoot}\n--sandbox\nread-only\n--model\ngpt-5.4\n-\n`
      );
      const stdin = fs.readFileSync(stdinLog, "utf8");
      expect(stdin).toContain("GraphCode Codex CLI account-plan invocation.");
      expect(stdin).not.toContain("GraphCode skill instructions:\nTest prompt");
      expect(stdin).toContain("Update value through codex");
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
      source: { path: "src/module.ts", startLine: 2, endLine: 3 },
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
      const command = writeFakeCli(["diff --git a/src/other.ts b/src/other.ts", "--- a/src/other.ts", "+++ b/src/other.ts", "@@", "+bad"]);
      await expect(
        runCodingAgent(
        {
          projectId: "project",
          nodeId: "node-1",
          mode: "medium"
        },
          {
            config: { ...baseConfig, agentKind: "coding", provider: "claudecode", cliCommand: command, model: "sonnet" },
            runId: "run-3",
            toolbox: toolbox()
          }
        )
    ).rejects.toThrow(/escaped/);
  });

  it("runs the initial three-mode scan pipeline", async () => {
    const tools = toolbox();
    const result = await runScanningAgent(
      { projectId: "project" },
      { config: { ...baseConfig, agentKind: "scanning", parallelLimit: 2 }, runId: "run-4", toolbox: tools }
    );

    expect(result.response).toContain("Scanned 3 files");
    expect(result.response).toContain("12 Code Graph nodes");
    expect(result.response).toContain("ran 3 local, 2 medium, and 1 global scan pass");
    expect(tools.buildFakeLocalScanOutput).toHaveBeenCalledTimes(3);
    expect(tools.refreshCodeGraph).not.toHaveBeenCalled();
    const scanResult = vi.mocked(tools.applyScanResult).mock.calls[0]?.[1] as ScanPipelineResult;
    expect(scanResult.initial).toBe(true);
    expect(scanResult.localOutputs.map((output) => output.filePath).sort()).toEqual(["README.md", "src/module.ts", "src/other.ts"]);
    expect(scanResult.mediumOutputs.map((output) => output.scopePath).sort()).toEqual([".", "src"]);
    expect(scanResult.globalOutput.nodes).toHaveLength(1);
    expect(tools.setStatuses).not.toHaveBeenCalled();
  });

  it("rescans only changed files while consolidating affected medium and global passes", async () => {
    const tools = toolbox({
      getScanFileStates: vi.fn(async () => [
        { filePath: "src/module.ts", contentHash: "hash-module", scannedAt: "before" },
        { filePath: "src/other.ts", contentHash: "old-other", scannedAt: "before" },
        { filePath: "README.md", contentHash: "hash-readme", scannedAt: "before" },
        { filePath: "src/deleted.ts", contentHash: "hash-deleted", scannedAt: "before" }
      ])
    });

    const result = await runScanningAgent(
      { projectId: "project" },
      { config: { ...baseConfig, agentKind: "scanning", parallelLimit: 4 }, runId: "run-5", toolbox: tools }
    );

    expect(result.response).toContain("Changed 1 files, removed 1 files, ran 1 local, 2 medium, and 1 global scan pass");
    expect(tools.buildFakeLocalScanOutput).toHaveBeenCalledTimes(1);
    expect(vi.mocked(tools.buildFakeLocalScanOutput).mock.calls[0]?.[1].path).toBe("src/other.ts");
    const scanResult = vi.mocked(tools.applyScanResult).mock.calls[0]?.[1] as ScanPipelineResult;
    expect(scanResult.initial).toBe(false);
    expect(scanResult.changedFiles.map((file) => file.path)).toEqual(["src/other.ts"]);
    expect(scanResult.deletedFiles.map((file) => file.filePath)).toEqual(["src/deleted.ts"]);
    expect(scanResult.mediumOutputs.map((output) => output.scopePath).sort()).toEqual([".", "src"]);
    expect(scanResult.globalOutput.summary).toContain("Whole-repository");
  });

  it("cleans up deleted files without re-running local scans for unchanged files", async () => {
    const tools = toolbox({
      getScanFileStates: vi.fn(async () => [
        { filePath: "src/module.ts", contentHash: "hash-module", scannedAt: "before" },
        { filePath: "src/other.ts", contentHash: "hash-other", scannedAt: "before" },
        { filePath: "README.md", contentHash: "hash-readme", scannedAt: "before" },
        { filePath: "src/deleted.ts", contentHash: "hash-deleted", scannedAt: "before" }
      ])
    });

    const result = await runScanningAgent(
      { projectId: "project" },
      { config: { ...baseConfig, agentKind: "scanning", parallelLimit: 4 }, runId: "run-6", toolbox: tools }
    );

    expect(result.response).toContain("Changed 0 files, removed 1 files, ran 0 local, 2 medium, and 1 global scan pass");
    expect(tools.buildFakeLocalScanOutput).not.toHaveBeenCalled();
    const scanResult = vi.mocked(tools.applyScanResult).mock.calls[0]?.[1] as ScanPipelineResult;
    expect(scanResult.deletedFiles.map((file) => file.filePath)).toEqual(["src/deleted.ts"]);
  });

  it("honors the local scanning parallel limit", async () => {
    let active = 0;
    let maxActive = 0;
    const files = Array.from({ length: 5 }, (_, index) => ({
      path: `src/file-${index}.ts`,
      contentHash: `hash-${index}`,
      size: 12,
      language: "typescript"
    }));
    const tools = toolbox({
      listScannableFiles: vi.fn(async () => files),
      buildFakeLocalScanOutput: vi.fn(async (_projectId, file) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return {
          filePath: file.path,
          contentHash: file.contentHash,
          summary: `Fake local scan for ${file.path}`,
          nodes: [
            {
              stableKey: `file:${file.path}`,
              kind: "module" as const,
              name: file.path,
              summary: `File ${file.path}`,
              codeContext: `File ${file.path}`,
              source: { path: file.path, startLine: 1, endLine: 1 },
              language: "typescript" as const
            }
          ],
          edges: []
        };
      })
    });

    await runScanningAgent(
      { projectId: "project" },
      {
        config: { ...baseConfig, agentKind: "scanning", parallelLimit: 8 },
        scanningConfigs: {
          local: { ...baseConfig, mode: "local", parallelLimit: 2 },
          medium: { ...baseConfig, mode: "medium", parallelLimit: 8 },
          global: { ...baseConfig, mode: "global", parallelLimit: 1 }
        },
        runId: "run-7",
        toolbox: tools
      }
    );

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(tools.buildFakeLocalScanOutput).toHaveBeenCalledTimes(5);
  });

  it("rejects inverted source ranges in structured scan output", () => {
    expect(() =>
      scanLocalOutputSchema.parse({
        filePath: "src/module.ts",
        contentHash: "hash-module",
        nodes: [
          {
            stableKey: "function:bad",
            kind: "function",
            name: "bad",
            source: { path: "src/module.ts", startLine: 4, endLine: 2 }
          }
        ],
        edges: []
      })
    ).toThrow(/startLine/);
  });

  it("accepts extension details in structured scan output", () => {
    const parsed = scanLocalOutputSchema.parse({
      filePath: "models/train.py",
      contentHash: "hash-model",
      nodes: [
        {
          stableKey: "optimizer:adamw",
          kind: "ml_optimizer",
          name: "AdamW",
          source: { path: "models/train.py", startLine: 10, endLine: 12 },
          detail: {
            extensionDetails: {
              packageId: "@graphcode/extension-ml-pipeline",
              schemaId: "ml_optimizer",
              payload: { optimizerType: "adamw", learningRate: "1e-4" }
            }
          }
        }
      ],
      edges: []
    });

    expect(parsed.nodes[0]?.detail?.extensionDetails?.schemaId).toBe("ml_optimizer");
  });

      it("marks reviewed or bugged after review", async () => {
      const passTools = toolbox();
      await runReviewAgent(
        {
          projectId: "project",
          runId: "run-coded",
          mode: "medium",
          targetNodeId: "node-1",
          diff: "diff --git a/src/module.ts b/src/module.ts\n--- a/src/module.ts\n+++ b/src/module.ts\n+ok",
          targetRun: {
            id: "run-coded",
            projectId: "project",
            agentKind: "coding",
            codingMode: "medium",
            reviewMode: null,
            status: "succeeded",
            baseGraphRevision: 0,
            appliedGraphRevision: null,
            conflictReason: null,
            targetNodeId: "node-1",
            prompt: "Patch value",
            response: "Coded",
            diff: "diff --git",
            graphPatch: null,
            error: null,
            createdAt: "now",
            updatedAt: "now"
          }
        },
        { config: { ...baseConfig, agentKind: "review" }, runId: "run-review-pass", toolbox: passTools }
      );
      expect(passTools.setStatuses).toHaveBeenCalledWith("project", [expect.objectContaining({ status: "reviewed" })]);
      expect(passTools.getCanvasGraph).toHaveBeenCalledWith("project", "node-1", true);

      const errorDiffTools = toolbox();
      await runReviewAgent(
        {
          projectId: "project",
          runId: "run-coded",
          targetNodeId: "node-1",
          diff: "diff --git a/src/module.ts b/src/module.ts\n--- a/src/module.ts\n+++ b/src/module.ts\n+throw new Error('invalid state');"
        },
        { config: { ...baseConfig, agentKind: "review" }, runId: "run-review-error", toolbox: errorDiffTools }
      );
      expect(errorDiffTools.setStatuses).toHaveBeenCalledWith("project", [expect.objectContaining({ status: "reviewed" })]);

      const scopeLeakTools = toolbox();
      const scopeLeakResult = await runReviewAgent(
        {
          projectId: "project",
          runId: "run-coded",
          mode: "large",
          targetNodeId: "node-1",
          diff: "diff --git a/src/other.ts b/src/other.ts\n--- a/src/other.ts\n+++ b/src/other.ts\n+leak"
        },
        { config: { ...baseConfig, agentKind: "review" }, runId: "run-review-scope", toolbox: scopeLeakTools }
      );
      expect(scopeLeakResult.response).toContain("Review mode: large");
      expect(scopeLeakTools.setStatuses).toHaveBeenCalledWith("project", [expect.objectContaining({ status: "bugged" })]);
    });
});
