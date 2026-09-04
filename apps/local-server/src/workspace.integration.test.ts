import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceRuntime } from "./workspace";

const cleanups: string[] = [];

afterEach(() => {
  for (const target of cleanups.splice(0)) fs.rmSync(target, { recursive: true, force: true });
});

function sha1(value: string): string {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

function diffFor(filePath: string, before: string, after: string): string {
  return [
    `diff --git a/${filePath} b/${filePath}`,
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    "@@ -1,1 +1,1 @@",
    `-${before}`,
    `+${after}`,
    ""
  ].join("\n");
}

function writeDirectEditCli(relativePath: string, content: string): string {
  const commandRoot = fs.mkdtempSync(path.join(os.tmpdir(), "graphcode-direct-cli-"));
  cleanups.push(commandRoot);
  const runner = path.join(commandRoot, "runner.cjs");
  const runnerSource = [
    'const fs = require("node:fs");',
    'const path = require("node:path");',
    'process.stdin.resume();',
    'process.stdin.on("end", () => {',
    `  fs.writeFileSync(path.join(process.cwd(), ${JSON.stringify(relativePath)}), ${JSON.stringify(content)}, "utf8");`,
    '  process.stdout.write("Implemented the requested workspace edit.\\n");',
    '});'
  ].join("\n");
  fs.writeFileSync(runner, runnerSource, "utf8");
  if (process.platform === "win32") {
    const command = path.join(commandRoot, "claude.cmd");
    fs.writeFileSync(command, `@echo off\r\nnode "%~dp0runner.cjs" %*\r\n`, "utf8");
    return command;
  }
  const command = path.join(commandRoot, "claude");
  fs.writeFileSync(command, `#!/bin/sh\nexec node "$(dirname "$0")/runner.cjs" "$@"\n`, { encoding: "utf8", mode: 0o755 });
  return command;
}

function setupWorkflow() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "graphcode-ma5-workspace-"));
  cleanups.push(rootPath);
  fs.mkdirSync(path.join(rootPath, "src"), { recursive: true });
  const source = "export const value = 1;\n";
  fs.writeFileSync(path.join(rootPath, "src/value.ts"), source, "utf8");
  const runtime = new WorkspaceRuntime(path.join(rootPath, "graphcode.sqlite"), rootPath, {
    graphPartitionedWorkflows: true,
    workUnitContext: true,
    modelRouterV2: true,
    edgeContracts: true,
    integrationGate: true
  });
  const repo = runtime.repo();
  const project = repo.createProject({ id: `project-${crypto.randomUUID()}`, name: "MA-5", rootPath });
  repo.createNode({ id: `root-${project.id}`, projectId: project.id, kind: "framework", name: "Root", agentStatus: "implemented" });
  const moduleId = `module-${project.id}`;
  const functionId = `function-${project.id}`;
  repo.createNode({ id: moduleId, projectId: project.id, kind: "module", name: "Module", parentId: `root-${project.id}`, agentStatus: "planning" });
  repo.createNode({
    id: functionId,
    projectId: project.id,
    kind: "function",
    name: "value",
    parentId: moduleId,
    sourcePath: "src/value.ts",
    sourceStartLine: 1,
    sourceEndLine: 1,
    agentStatus: "planning"
  });
  const workflow = repo.previewGraphPartitionedCodingWorkflow(project.id, functionId, {
    indexRevision: "index-1",
    workspaceRevision: "workspace-1",
    graphRevision: repo.currentGraphRevision(project.id),
    indexState: "complete",
    sourceHashes: { "src/value.ts": sha1(source) },
    capturedAt: "2026-07-18T12:00:00.000Z"
  });
  const item = workflow.items[0];
  return { runtime, repo, project, workflow, item, rootPath, functionId, source };
}

describe("WorkspaceRuntime MA-5 integration gate", () => {
  it("captures staged and untracked files when verifying direct CLI edits", async () => {
    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "graphcode-direct-diff-workspace-"));
    const databaseRoot = fs.mkdtempSync(path.join(os.tmpdir(), "graphcode-direct-diff-db-"));
    cleanups.push(rootPath, databaseRoot);
    fs.mkdirSync(path.join(rootPath, "src"), { recursive: true });
    fs.writeFileSync(path.join(rootPath, "src/tracked.ts"), "export const tracked = 1;\n", "utf8");
    execFileSync("git", ["init"], { cwd: rootPath });
    execFileSync("git", ["config", "user.email", "graphcode@example.invalid"], { cwd: rootPath });
    execFileSync("git", ["config", "user.name", "GraphCode Test"], { cwd: rootPath });
    execFileSync("git", ["add", "src/tracked.ts"], { cwd: rootPath });
    execFileSync("git", ["commit", "-m", "fixture"], { cwd: rootPath });
    fs.writeFileSync(path.join(rootPath, "src/tracked.ts"), "export const tracked = 2;\n", "utf8");
    execFileSync("git", ["add", "src/tracked.ts"], { cwd: rootPath });
    fs.writeFileSync(path.join(rootPath, "src/new.ts"), "export const added = true;\n", "utf8");
    fs.mkdirSync(path.join(rootPath, ".graphcode/memory"), { recursive: true });
    fs.writeFileSync(path.join(rootPath, ".graphcode/memory/state.md"), "internal state\n", "utf8");

    const runtime = new WorkspaceRuntime(path.join(databaseRoot, "graphcode.sqlite"), rootPath);
    try {
      const project = runtime.repo().createProject({ id: `project-${crypto.randomUUID()}`, name: "Direct diff", rootPath });
      const diff = (await runtime.readGitDiff(project.id)).replace(/\r\n/g, "\n");

      expect(diff).toContain("diff --git a/src/tracked.ts b/src/tracked.ts");
      expect(diff).toContain("+export const tracked = 2;");
      expect(diff).toContain("diff --git a/src/new.ts b/src/new.ts");
      expect(diff).toContain("+export const added = true;");
      expect(diff).not.toContain(".graphcode/");
    } finally {
      runtime.close();
    }
  }, 20000);

  it("records a verified direct-edit coding result as implemented", async () => {
    const fixture = setupWorkflow();
    try {
      const run = fixture.repo.createAgentRun({
        projectId: fixture.project.id,
        agentKind: "coding",
        codingMode: "small",
        targetNodeId: fixture.functionId,
        prompt: "Apply a direct edit.",
        status: "running"
      });
      const runtime = fixture.runtime as unknown as {
        finishAgentRun: (
          agentRun: typeof run,
          execute: () => Promise<{ response: string; diff: string; workspaceEditsApplied: boolean }>
        ) => Promise<typeof run>;
      };

      const completed = await runtime.finishAgentRun(run, async () => ({
        response: "Edited the workspace.",
        diff: diffFor("src/value.ts", "export const value = 1;", "export const value = 2;"),
        workspaceEditsApplied: true
      }));

      expect(completed.error).toBeNull();
      expect(completed.status).toBe("succeeded");
      expect(completed.implementedAt).toBeTruthy();
    } finally {
      fixture.runtime.close();
    }
  });

  it("runs a Claude-compatible direct editor, verifies its diff, and marks the run implemented", async () => {
    const fixture = setupWorkflow();
    try {
      fs.writeFileSync(path.join(fixture.rootPath, ".gitignore"), "graphcode.sqlite\n", "utf8");
      execFileSync("git", ["init"], { cwd: fixture.rootPath });
      execFileSync("git", ["config", "user.email", "graphcode@example.invalid"], { cwd: fixture.rootPath });
      execFileSync("git", ["config", "user.name", "GraphCode Test"], { cwd: fixture.rootPath });
      execFileSync("git", ["add", ".gitignore", "src/value.ts"], { cwd: fixture.rootPath });
      execFileSync("git", ["commit", "-m", "fixture"], { cwd: fixture.rootPath });
      const command = writeDirectEditCli("src/value.ts", "export const value = 2;\n");
      fixture.repo.saveWorkspaceSettings(fixture.project.id, {
        general: { theme: "system" },
        github: { enabled: false, repository: "", clientId: "" },
        automation: { autoReviewAfterCoding: false },
        extensions: { enabledPackageIds: [], configs: {} },
        agents: [],
        codingAgents: [{
          mode: "small",
          provider: "claudecode",
          model: "sonnet",
          cliCommand: command,
          reasoningEffort: "medium",
          speedTier: "standard",
          permissionMode: "full_access",
          codexSystemPromptMode: "default",
          claudeSystemPromptMode: "default",
          parallelLimit: 1,
          apiKeySource: { type: "env", value: "" },
          systemPromptSource: { type: "manual", value: "" }
        }],
        reviewAgents: [],
        scanningAgents: []
      });

      const completed = await fixture.runtime.runCoding(
        { projectId: fixture.project.id, nodeId: fixture.functionId, mode: "small", prompt: "Change the value to 2." },
        { autoReview: false }
      );

      expect(completed.error).toBeNull();
      expect(completed.status).toBe("succeeded");
      expect(completed.implementedAt).toBeTruthy();
      expect(completed.diff).toContain("+export const value = 2;");
      expect(fs.readFileSync(path.join(fixture.rootPath, "src/value.ts"), "utf8").replace(/\r\n/g, "\n")).toBe("export const value = 2;\n");
      expect(fixture.repo.getNode(fixture.functionId).agentStatus).toBe("implemented");
    } finally {
      fixture.runtime.close();
    }
  }, 30000);

  it("implements a reviewed direct coding proposal once and records the result", async () => {
    const fixture = setupWorkflow();
    try {
      const diff = diffFor("src/value.ts", "export const value = 1;", "export const value = 2;");
      const codingRun = fixture.repo.createAgentRun({
        projectId: fixture.project.id,
        agentKind: "coding",
        codingMode: "small",
        targetNodeId: fixture.functionId,
        prompt: "Update the value.",
        status: "succeeded",
        response: diff,
        diff
      });
      fixture.repo.storeCodeProposal({
        projectId: fixture.project.id,
        agentRunId: codingRun.id,
        targetNodeId: fixture.functionId,
        diff
      });
      fixture.repo.createAgentRun({
        projectId: fixture.project.id,
        agentKind: "review",
        reviewMode: "small",
        targetNodeId: fixture.functionId,
        prompt: `Review ${codingRun.id}`,
        status: "succeeded",
        response: "No findings.\nGRAPHCODE_REVIEW_VERDICT: reviewed"
      });

      const implemented = await fixture.runtime.applyCodeProposal({ projectId: fixture.project.id, runId: codingRun.id });

      expect(implemented.implementedAt).toBeTruthy();
      expect(normalizeNewlines(fs.readFileSync(path.join(fixture.rootPath, "src/value.ts"), "utf8"))).toBe("export const value = 2;\n");
      await expect(fixture.runtime.applyCodeProposal({ projectId: fixture.project.id, runId: codingRun.id })).resolves.toMatchObject({
        id: codingRun.id,
        implementedAt: implemented.implementedAt
      });
    } finally {
      fixture.runtime.close();
    }
  }, 20000);

  it("blocks implementation when the attached review requests changes", async () => {
    const fixture = setupWorkflow();
    try {
      const diff = diffFor("src/value.ts", "export const value = 1;", "export const value = 2;");
      const codingRun = fixture.repo.createAgentRun({
        projectId: fixture.project.id,
        agentKind: "coding",
        targetNodeId: fixture.functionId,
        status: "succeeded",
        diff
      });
      fixture.repo.storeCodeProposal({ projectId: fixture.project.id, agentRunId: codingRun.id, targetNodeId: fixture.functionId, diff });
      fixture.repo.createAgentRun({
        projectId: fixture.project.id,
        agentKind: "review",
        targetNodeId: fixture.functionId,
        prompt: `Review ${codingRun.id}`,
        status: "succeeded",
        response: "The patch is unsafe.\nGRAPHCODE_REVIEW_VERDICT: bugged"
      });

      await expect(fixture.runtime.applyCodeProposal({ projectId: fixture.project.id, runId: codingRun.id })).rejects.toThrow(/requested changes/i);
      expect(fs.readFileSync(path.join(fixture.rootPath, "src/value.ts"), "utf8")).toBe(fixture.source);
      expect(fixture.repo.getAgentRun(codingRun.id).implementedAt).toBeNull();
    } finally {
      fixture.runtime.close();
    }
  }, 20000);

  it("returns a failed work-unit retry immediately and continues it in the background", async () => {
    const fixture = setupWorkflow();
    let releaseRetry!: () => void;
    const retryGate = new Promise<void>((resolve) => {
      releaseRetry = resolve;
    });
    const mutableRuntime = fixture.runtime as unknown as {
      runCodingWorkflowCurrentLayer: (workflowId: string) => Promise<void>;
    };
    mutableRuntime.runCodingWorkflowCurrentLayer = async () => {
      await retryGate;
      throw new Error("OpenRouter retry failed.");
    };
    fixture.repo.saveCodingWorkUnitContextDiagnostics({
      projectId: fixture.project.id,
      workflowId: fixture.workflow.id,
      workUnitId: fixture.item.id,
      compilerVersion: "test",
      diagnostics: {
        runtimeFailure: {
          status: "failed",
          reason: "OpenRouter request failed.",
          attempts: 2,
          providerId: "openrouter",
          modelId: "test/model"
        }
      }
    });
    fixture.repo.updateCodingWorkflowItem({ itemId: fixture.item.id, status: "failed" });
    fixture.repo.updateCodingWorkflowStatus(fixture.workflow.id, "failed", fixture.item.layerIndex);

    const retryRequest = fixture.runtime
      .controlCodingWorkflow({
        projectId: fixture.project.id,
        workflowId: fixture.workflow.id,
        action: "retry",
        itemId: fixture.item.id
      });
    let retryTimeout: ReturnType<typeof setTimeout> | undefined;
    let retryReleased = false;

    try {
      const retried = await Promise.race([
        retryRequest,
        new Promise<null>((resolve) => {
          retryTimeout = setTimeout(() => resolve(null), 100);
        })
      ]);
      expect(retried, "Retry should return before background coding completes.").not.toBeNull();
      if (!retried) return;
      expect(retried).toMatchObject({
        status: "running",
        items: [expect.objectContaining({ id: fixture.item.id, status: "pending", agentRunId: null, proposalId: null })]
      });
      expect(retried?.items[0].contextDiagnostics).not.toHaveProperty("runtimeFailure");

      releaseRetry();
      retryReleased = true;
      let failed = fixture.repo.getCodingWorkflow(fixture.workflow.id);
      for (let attempt = 0; attempt < 20 && failed.status !== "failed"; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        failed = fixture.repo.getCodingWorkflow(fixture.workflow.id);
      }
      expect(failed).toMatchObject({
        status: "failed",
        items: [
          expect.objectContaining({
            id: fixture.item.id,
            status: "failed",
            contextDiagnostics: expect.objectContaining({
              runtimeFailure: expect.objectContaining({ reason: "OpenRouter retry failed.", status: "failed" })
            })
          })
        ]
      });
    } finally {
      if (retryTimeout) clearTimeout(retryTimeout);
      if (!retryReleased) releaseRetry();
      await retryRequest;
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.runtime.close();
    }
  });

  it("validates without mutation, then applies a clean layer only after checks pass", async () => {
    const fixture = setupWorkflow();
    try {
      const diff = diffFor("src/value.ts", "export const value = 1;", "export const value = 2;");
      const proposalId = fixture.repo.storeCodeProposal({ projectId: fixture.project.id, targetNodeId: fixture.functionId, diff });
      fixture.repo.updateCodingWorkflowItem({ itemId: fixture.item.id, status: "proposed", proposalId });
      fixture.repo.updateCodingWorkflowStatus(fixture.workflow.id, "blocked", fixture.item.layerIndex);

      const integrated = await fixture.runtime.controlCodingWorkflow({
        projectId: fixture.project.id,
        workflowId: fixture.workflow.id,
        action: "integrate"
      });

      expect(integrated.status).toBe("blocked");
      expect(integrated.items[0].status).toBe("proposed");
      expect(integrated.integrationChecks).toHaveLength(7);
      expect(integrated.integrationChecks?.every((check) => check.status === "passed")).toBe(true);
      expect(fs.readFileSync(path.join(fixture.rootPath, "src/value.ts"), "utf8")).toBe(fixture.source);

      const applied = await fixture.runtime.applyCodingWorkflowLayer({
        projectId: fixture.project.id,
        workflowId: fixture.workflow.id,
        layerIndex: fixture.item.layerIndex
      });

      expect(applied.status).toBe("succeeded");
      expect(applied.items[0]).toMatchObject({ status: "applied", proposalRevision: 1 });
      expect(applied.integrationChecks).toHaveLength(7);
      expect(applied.integrationChecks?.every((check) => check.status === "passed")).toBe(true);
      expect(normalizeNewlines(fs.readFileSync(path.join(fixture.rootPath, "src/value.ts"), "utf8"))).toBe("export const value = 2;\n");
    } finally {
      fixture.runtime.close();
    }
  }, 20000);

  it("does not mutate or succeed when a required proposal escapes its write scope", async () => {
    const fixture = setupWorkflow();
    try {
      const diff = diffFor("src/forbidden.ts", "export const secret = 1;", "export const secret = 2;");
      const proposalId = fixture.repo.storeCodeProposal({ projectId: fixture.project.id, targetNodeId: fixture.functionId, diff });
      fixture.repo.updateCodingWorkflowItem({ itemId: fixture.item.id, status: "proposed", proposalId });
      fixture.repo.updateCodingWorkflowStatus(fixture.workflow.id, "blocked", fixture.item.layerIndex);

      await expect(fixture.runtime.applyCodingWorkflowLayer({
        projectId: fixture.project.id,
        workflowId: fixture.workflow.id,
        layerIndex: fixture.item.layerIndex
      })).rejects.toThrow(/integration gate failed/i);

      const rejected = fixture.repo.getCodingWorkflow(fixture.workflow.id);
      expect(rejected.status).toBe("blocked");
      expect(rejected.items[0].status).toBe("blocked");
      expect(rejected.integrationChecks).toEqual(expect.arrayContaining([
        expect.objectContaining({ checkKind: "write_authorization", status: "failed" }),
        expect.objectContaining({ checkKind: "combined_patch", status: "blocked" })
      ]));
      expect(fs.readFileSync(path.join(fixture.rootPath, "src/value.ts"), "utf8")).toBe(fixture.source);
      expect(fs.existsSync(path.join(fixture.rootPath, "src/forbidden.ts"))).toBe(false);
    } finally {
      fixture.runtime.close();
    }
  }, 20000);
});
