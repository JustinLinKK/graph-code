import crypto from "node:crypto";
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
      expect(fs.readFileSync(path.join(fixture.rootPath, "src/value.ts"), "utf8")).toBe("export const value = 2;\n");
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
      expect(fs.readFileSync(path.join(fixture.rootPath, "src/value.ts"), "utf8")).toBe("export const value = 2;\n");
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
