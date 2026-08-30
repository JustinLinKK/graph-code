import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parsePlanningAgentOutput } from "@graphcode/agent-runtime";
import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceRuntime } from "./workspace";

const cleanups: string[] = [];

afterEach(() => {
  for (const target of cleanups.splice(0)) fs.rmSync(target, { recursive: true, force: true });
});

describe("example project layered workflow", () => {
  it("falls back from a missing-kind planning patch and executes review-proposal-lab", async () => {
    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "graphcode-review-proposal-lab-"));
    cleanups.push(rootPath);
    fs.cpSync(path.resolve(process.cwd(), "../../examples/review-proposal-lab"), rootPath, { recursive: true });
    const runtime = new WorkspaceRuntime(path.join(rootPath, "bootstrap.sqlite"), rootPath);

    try {
      const opened = runtime.openWorkspace({
        rootPath,
        createIfMissing: true,
        creationMode: "scan",
        initialization: {
          projectName: "Review Proposal Lab",
          projectDescription: "Example project for layered workflow regression coverage.",
          scanningInstructions: "Group pricing, order creation, and tests.",
          topModulePaths: [],
          enabledExtensionPackageIds: [],
          skipCodexDefaultSystemPrompt: false
        }
      });
      expect(opened.status).toBe("created");
      if (opened.status !== "created") return;

      const scan = await waitForScan(runtime, opened.project.id);
      expect(scan.status).toBe("succeeded");

      const nodes = runtime.repo().listProjectNodes(opened.project.id);
      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes.every((node) => Boolean(node.kind))).toBe(true);
      const scope = nodes.find((node) => node.kind === "module" && node.source.path?.endsWith(".ts"));
      expect(scope).toBeTruthy();
      if (!scope) return;

      const planned = parsePlanningAgentOutput(
        JSON.stringify({
          response: "Create a reset task.",
          graphPatch: {
            summary: "Reset the game",
            operations: [
              {
                entityType: "node",
                entityId: "reset-the-game",
                action: "create",
                fields: { name: "reset the game", summary: "Reset the game state." }
              }
            ]
          }
        }),
        "reset the game",
        { nodes, edges: runtime.repo().listProjectEdges(opened.project.id) },
        scope
      );
      expect(planned.graphPatch.operations).toEqual([
        expect.objectContaining({ entityType: "node", entityId: scope.id, action: "update" })
      ]);
      const planningRun = runtime.repo().createAgentRun({
        projectId: opened.project.id,
        agentKind: "planning",
        targetNodeId: scope.id,
        prompt: "reset the game",
        status: "succeeded",
        response: planned.response,
        graphPatch: planned.graphPatch
      });
      expect(runtime.repo().applyAgentGraphPatch(opened.project.id, planningRun.id).status).toBe("succeeded");

      const started = await runtime.startCodingWorkflow({
        projectId: opened.project.id,
        scopeNodeId: scope.id,
        background: false
      });

      expect(started.items.length).toBeGreaterThan(0);
      expect(started.items.every((item) => Boolean(item.nodeKind))).toBe(true);
      expect(started.items.every((item) => item.status === "proposed")).toBe(true);
      expect(started.status).toBe("blocked");
    } finally {
      runtime.close();
    }
  }, 20_000);

  it("executes a source-linked block created by an applied planning patch", async () => {
    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "graphcode-planned-block-"));
    cleanups.push(rootPath);
    fs.cpSync(path.resolve(process.cwd(), "../../examples/review-proposal-lab"), rootPath, { recursive: true });
    const runtime = new WorkspaceRuntime(path.join(rootPath, "bootstrap.sqlite"), rootPath);

    try {
      const opened = runtime.openWorkspace({
        rootPath,
        createIfMissing: true,
        creationMode: "scan",
        initialization: {
          projectName: "Planned Block Lab",
          projectDescription: "Regression coverage for graph-to-code handoff.",
          scanningInstructions: "Group TypeScript modules and functions.",
          topModulePaths: [],
          enabledExtensionPackageIds: [],
          skipCodexDefaultSystemPrompt: false
        }
      });
      expect(opened.status).toBe("created");
      if (opened.status !== "created") return;
      expect((await waitForScan(runtime, opened.project.id)).status).toBe("succeeded");

      const scope = runtime.repo().listProjectNodes(opened.project.id).find((node) => node.kind === "module");
      expect(scope).toBeTruthy();
      if (!scope) return;
      const planningRun = runtime.repo().createAgentRun({
        projectId: opened.project.id,
        agentKind: "planning",
        targetNodeId: scope.id,
        prompt: "Add a cache helper in a new source file.",
        status: "succeeded",
        graphPatch: {
          summary: "Add the planned cache helper.",
          operations: [
            {
              entityType: "node",
              entityId: "planned-cache-helper",
              action: "create",
              fields: {
                kind: "function",
                name: "plannedCacheHelper",
                summary: "Cache repeated calculations.",
                codeContext: "Export a small deterministic cache helper.",
                codeDirectory: "src/planned_cache.ts",
                language: "typescript",
                parentId: scope.id
              }
            }
          ]
        }
      });
      expect(runtime.repo().applyAgentGraphPatch(opened.project.id, planningRun.id).status).toBe("succeeded");

      const started = await runtime.startCodingWorkflow({
        projectId: opened.project.id,
        scopeNodeId: scope.id,
        background: false
      });
      const item = started.items.find((candidate) => candidate.nodeId === "planned-cache-helper");
      expect(item?.status).toBe("proposed");
      expect(started.status).toBe("blocked");
      expect(item?.agentRunId).toBeTruthy();
      if (!item?.agentRunId) return;
      const proposal = runtime.repo().getLatestCodeProposalForRun(item.agentRunId);
      expect(proposal).toBeTruthy();
      if (!proposal) return;
      expect(runtime.repo().getCodeProposal(proposal.id).diff).toContain("+++ b/src/planned_cache.ts");
    } finally {
      runtime.close();
    }
  }, 20_000);
});

async function waitForScan(runtime: WorkspaceRuntime, projectId: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const scan = runtime.repo().listAgentRuns(projectId).find((run) => run.agentKind === "scanning");
    if (scan && scan.status !== "queued" && scan.status !== "running") return scan;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for the example project scan.");
}
