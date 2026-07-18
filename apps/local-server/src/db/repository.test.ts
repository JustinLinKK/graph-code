import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanRepositoryCodeGraph } from "@graphcode/parser";
import type { ScanPipelineResult } from "@graphcode/agent-runtime";
import { openDatabase, type GraphDatabase } from "./connection";
import { GraphRepository } from "./repository";
import { migrate } from "./schema";
import { buildElkEdgesForLayout } from "../layout/elk";

let db: GraphDatabase;
let repo: GraphRepository;
const selfRootPath = path.join(os.tmpdir(), "graph-code-self-test");
const codexSettingDefaults = {
  cliCommand: "",
  reasoningEffort: "medium" as const,
  speedTier: "standard" as const,
  permissionMode: "ask_for_permission" as const,
  codexSystemPromptMode: "custom" as const,
  claudeSystemPromptMode: "custom" as const
};

beforeEach(() => {
  const dbPath = path.join(os.tmpdir(), `graphcode-${crypto.randomUUID()}.sqlite`);
  db = openDatabase(dbPath);
  migrate(db);
  repo = new GraphRepository(db);
});

afterEach(() => {
  db.close();
});

describe("SQLite graph repository", () => {
  it("creates the planned tables", () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(tables).toEqual(
      expect.arrayContaining([
        "projects",
        "graph_nodes",
        "graph_edges",
        "graph_boundaries",
        "graph_boundary_nodes",
        "graph_tags",
        "graph_node_tags",
        "graph_edge_tags",
        "graph_boundary_tags",
        "graph_node_reuses",
        "dependency_details",
        "io_details",
        "process_details",
        "format_details",
        "extension_node_details",
        "graph_node_layouts",
          "graph_node_type_styles",
          "graph_revisions",
          "graph_entity_versions",
            "workspace_settings",
            "workspace_extension_settings",
            "coding_agent_settings",
            "review_agent_settings",
          "scanning_agent_settings",
        "scan_file_state",
          "agent_settings",
          "agent_runs",
          "agent_messages",
          "graph_status_history",
          "code_proposals",
          "coding_workflows",
          "coding_workflow_items",
          "coding_work_unit_nodes",
          "coding_work_unit_edges",
          "coding_work_unit_dependencies",
          "interface_contracts",
          "model_routing_decisions",
          "integration_checks"
        ])
      );
    });

  it("saves settings with masked views and records agent status history", () => {
    const project = repo.seedSelfGraph(selfRootPath);
    const settings = repo.saveWorkspaceSettings(project.id, {
      general: { theme: "dark" },
      github: { enabled: true, repository: "owner/repo", clientId: "github-client" },
      automation: { autoReviewAfterCoding: false },
      extensions: { enabledPackageIds: [], configs: {} },
      agents: [
        {
          agentKind: "coding",
          provider: "openai",
          model: "gpt-4.1-mini",
          ...codexSettingDefaults,
          parallelLimit: 2,
          apiKeySource: { type: "manual", value: "secret-value" },
          systemPromptSource: { type: "manual", value: "Stay scoped." }
        }
        ],
        codingAgents: [],
        reviewAgents: [
          {
            mode: "small",
            provider: "openai",
            model: "gpt-4.1-mini",
            ...codexSettingDefaults,
            parallelLimit: 1,
            apiKeySource: { type: "manual", value: "review-secret" },
            systemPromptSource: { type: "manual", value: "Review one block." }
          }
        ],
        scanningAgents: [
        {
          mode: "local",
          provider: "openai",
          model: "gpt-4.1-mini",
          ...codexSettingDefaults,
          parallelLimit: 6,
          apiKeySource: { type: "manual", value: "scan-secret" },
          systemPromptSource: { type: "manual", value: "Scan one file." }
        }
      ]
    });
    const raw = repo.getAgentConfig(project.id, "coding");
    const run = repo.createAgentRun({
      projectId: project.id,
      agentKind: "coding",
      targetNodeId: "module-web",
      prompt: "Patch",
      status: "succeeded",
      diff: "diff --git"
    });
    const history = repo.setGraphStatuses(project.id, [
      { entityType: "node", entityId: "module-web", status: "coded", agentRunId: run.id, note: "coded" }
    ]);
    repo.storeCodeProposal({ projectId: project.id, agentRunId: run.id, targetNodeId: "module-web", diff: "diff --git" });

    expect(settings.general.theme).toBe("dark");
    expect(settings.github.clientId).toBe("github-client");
    expect(settings.github.auth.tokenConfigured).toBe(false);
    expect(settings.automation.autoReviewAfterCoding).toBe(false);
    expect(settings.extensions.availablePackages.map((extensionPackage) => extensionPackage.id)).toEqual([
      "@graphcode/extension-embedded-systems",
      "@graphcode/extension-ml-pipeline"
    ]);
    expect(settings.extensions.enabledPackageIds).toEqual([]);
      expect(settings.agents.some((agent) => agent.agentKind === "coding")).toBe(false);
      expect(settings.agents.some((agent) => agent.agentKind === "review")).toBe(false);
      expect(settings.codingAgents).toHaveLength(3);
      expect(settings.reviewAgents).toHaveLength(3);
      expect(settings.scanningAgents).toHaveLength(3);
    expect(settings.codingAgents.find((agent) => agent.mode === "medium")?.apiKeySource.value).toBe("");
    expect(settings.codingAgents.find((agent) => agent.mode === "medium")?.apiKeyConfigured).toBe(true);
      expect(settings.scanningAgents.find((agent) => agent.mode === "local")?.apiKeySource.value).toBe("");
      expect(settings.scanningAgents.find((agent) => agent.mode === "local")?.apiKeyConfigured).toBe(true);
      expect(settings.reviewAgents.find((agent) => agent.mode === "small")?.apiKeySource.value).toBe("");
      expect(settings.reviewAgents.find((agent) => agent.mode === "small")?.apiKeyConfigured).toBe(true);
      expect(raw.apiKeySource.value).toBe("secret-value");
      expect(repo.getCodingAgentConfig(project.id, "large").apiKeySource.value).toBe("secret-value");
      expect(repo.getReviewAgentConfig(project.id, "small").apiKeySource.value).toBe("review-secret");
      expect(repo.getScanningAgentConfig(project.id, "local").apiKeySource.value).toBe("scan-secret");
      expect(run.codingMode).toBe("medium");
      expect(run.reviewMode).toBeNull();
    expect(history[0].status).toBe("coded");
    expect(repo.getNode("module-web").agentStatus).toBe("coded");
    });

    it("gates native extension blocks by workspace settings and stores extension details", async () => {
      const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "graphcode-extension-"));
      const project = repo.createProject({ id: "extension-project", name: "Extension Project", rootPath });
      repo.createNode({ id: "framework-root", projectId: project.id, kind: "framework", name: "Root" });

      expect(() =>
        repo.createNode({
          id: "robot-system",
          projectId: project.id,
          kind: "embedded_system",
          name: "Robot System",
          parentId: "framework-root"
        })
      ).toThrow(/Enable Embedded Systems/);

      const disabledScan: ScanPipelineResult = {
        initial: true,
        inventory: [],
        changedFiles: [],
        deletedFiles: [],
        localOutputs: [],
        mediumOutputs: [],
        globalOutput: {
          summary: "",
          nodes: [
            {
              stableKey: "root",
              kind: "framework",
              name: "Scanned Workspace",
              summary: "",
              codeContext: "",
              source: { path: null, startLine: null, endLine: null },
              language: "unknown"
            },
            {
              stableKey: "robot",
              kind: "embedded_system",
              name: "Robot",
              summary: "",
              codeContext: "",
              source: { path: null, startLine: null, endLine: null },
              language: "unknown",
              parentStableKey: "root"
            }
          ],
          edges: []
        }
      };
      expect(() => repo.applyScanPipelineResult(project.id, disabledScan)).toThrow(/extension package is disabled/);

      repo.saveWorkspaceSettings(project.id, {
        general: { theme: "system" },
        github: { enabled: false, repository: "", clientId: "" },
        automation: { autoReviewAfterCoding: true },
        extensions: { enabledPackageIds: ["@graphcode/extension-embedded-systems"], configs: {} },
        agents: [],
        codingAgents: [],
        reviewAgents: [],
        scanningAgents: []
      });
      const system = repo.createNodeFromMutation(project.id, {
        kind: "embedded_system",
        name: "Robot System",
        parentId: "framework-root",
        extensionDetails: {
          packageId: "@graphcode/extension-embedded-systems",
          schemaId: "embedded_system",
          payload: { runtime: "ros2", target: "rover" }
        }
      });
      const device = repo.createNodeFromMutation(project.id, {
        kind: "embedded_device",
        name: "Controller",
        parentId: system.id,
        extensionDetails: {
          packageId: "@graphcode/extension-embedded-systems",
          schemaId: "embedded_device",
          payload: { deviceType: "mcu", voltage: "3.3V" }
        }
      });
      const uart = repo.createNodeFromMutation(project.id, {
        kind: "uart_bus",
        name: "Telemetry UART",
        attachedToId: device.id,
        extensionDetails: {
          packageId: "@graphcode/extension-embedded-systems",
          schemaId: "uart_bus",
          payload: { port: "USART1", baud: "115200", parity: "none" }
        }
      });

      const detail = repo.getNodeDetail(device.id);
      const canvas = await repo.getCanvasGraph({ projectId: project.id, rootNodeId: system.id });
      expect(detail.extensionDetails.find((row) => row.node.id === uart.id)?.details.payload.baud).toBe(115200);
      expect(canvas.extensionDetails.map((row) => row.nodeId)).toContain(uart.id);
      expect(repo.getWorkspaceSettings(project.id).extensions.enabledPackageIds).toEqual(["@graphcode/extension-embedded-systems"]);
    });

    it("plans layered coding workflows, resolves execution metadata, and stores test artifacts", () => {
      const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "graphcode-workflow-"));
      const project = repo.createProject({ id: "workflow-project", name: "Workflow Project", rootPath });
      repo.createNode({ id: "framework-root", projectId: project.id, kind: "framework", name: "Root", agentStatus: "implemented" });
      repo.createNode({
        id: "module-root",
        projectId: project.id,
        kind: "module",
        name: "Module",
        parentId: "framework-root",
        sourcePath: "src/module.ts",
        agentStatus: "planning",
        execution: { testCommand: "pnpm test", testScriptDirectory: "tests/generated" }
      });
      repo.createNode({
        id: "function-leaf",
        projectId: project.id,
        kind: "function",
        name: "leaf",
        parentId: "module-root",
        sourcePath: "src/module.ts",
        agentStatus: "planning",
        execution: { virtualEnvironment: ".venv" }
      });
      repo.createNode({
        id: "process-leaf",
        projectId: project.id,
        kind: "process",
        name: "Validate",
        attachedToId: "function-leaf",
        sourcePath: "src/module.ts",
        agentStatus: "planning"
      });
      repo.createNode({
        id: "function-parent",
        projectId: project.id,
        kind: "function",
        name: "parent",
        parentId: "module-root",
        sourcePath: "src/module.ts",
        agentStatus: "planning"
      });
      repo.createNode({
        id: "function-child",
        projectId: project.id,
        kind: "function",
        name: "child",
        parentId: "function-parent",
        sourcePath: "src/module.ts",
        agentStatus: "planning"
      });

      const preview = repo.previewCodingWorkflow(project.id, "module-root");
      const processItem = preview.items.find((item) => item.nodeId === "process-leaf");
      const leafItem = preview.items.find((item) => item.nodeId === "function-leaf");
      const parentItem = preview.items.find((item) => item.nodeId === "function-parent");
      const childItem = preview.items.find((item) => item.nodeId === "function-child");
      const moduleItem = preview.items.find((item) => item.nodeId === "module-root");
      const resolved = repo.resolveExecutionMetadata("process-leaf");
      const run = repo.createAgentRun({ projectId: project.id, agentKind: "coding", targetNodeId: "process-leaf", status: "succeeded" });
      const proposalId = repo.storeCodeProposal({
        projectId: project.id,
        agentRunId: run.id,
        targetNodeId: "process-leaf",
        diff: "diff --git a/src/module.ts b/src/module.ts",
        artifactManifest: {
          testScriptDirectory: "ignored-by-storage",
          scripts: [{ relativePath: "leaf.test.ts", content: "test('leaf', () => {})" }]
        }
      });
      const proposal = repo.getLatestCodeProposalForRun(run.id);
      const workflow = repo.createCodingWorkflow(project.id, "module-root", [], "running");
      const layerZeroItems = workflow.items.filter((item) => item.layerIndex === 0);
      for (const item of layerZeroItems) {
        repo.updateCodingWorkflowItem({
          itemId: item.id,
          status: item.nodeId === "process-leaf" ? "proposed" : "skipped",
          proposalId: item.nodeId === "process-leaf" ? proposalId : null
        });
      }
      repo.applyCodingWorkflowLayer(project.id, workflow.id, 0);

      expect(processItem?.layerIndex).toBe(0);
      expect(processItem?.recommendedMode).toBe("small");
      expect(leafItem?.layerIndex).toBeGreaterThan(processItem?.layerIndex ?? -1);
      expect(childItem?.recommendedMode).toBe("small");
      expect(parentItem?.recommendedMode).toBe("medium");
      expect(moduleItem?.layerIndex).toBeGreaterThan(parentItem?.layerIndex ?? -1);
      expect(resolved.virtualEnvironment).toBe(".venv");
      expect(resolved.testCommand).toBe("pnpm test");
      expect(proposal?.id).toBe(proposalId);
      expect(proposal?.artifactManifest?.testScriptDirectory).toBe(path.join(".graphcode", "artifacts", "code-proposals", proposalId));
      expect(fs.existsSync(path.join(rootPath, ".graphcode", "artifacts", "code-proposals", proposalId, "leaf.test.ts"))).toBe(true);
      expect(fs.existsSync(path.join(rootPath, "tests", "generated", "__graphcode_generated__", proposalId, "leaf.test.ts"))).toBe(true);
      expect(fs.existsSync(path.join(rootPath, "tests", "generated", "leaf.test.ts"))).toBe(false);
    });

    it("rejects unsafe code proposal artifact paths and generated test overwrites", () => {
      const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "graphcode-artifacts-"));
      const project = repo.createProject({ id: "artifact-project", name: "Artifact Project", rootPath });
      repo.createNode({ id: "artifact-framework", projectId: project.id, kind: "framework", name: "Root", agentStatus: "implemented" });
      repo.createNode({
        id: "artifact-module",
        projectId: project.id,
        kind: "module",
        name: "Module",
        parentId: "artifact-framework",
        agentStatus: "implemented",
        execution: { testScriptDirectory: "tests/generated" }
      });
      repo.createNode({
        id: "artifact-process",
        projectId: project.id,
        kind: "process",
        name: "Process",
        attachedToId: "artifact-module",
        agentStatus: "planning"
      });
      const run = repo.createAgentRun({ projectId: project.id, agentKind: "coding", targetNodeId: "artifact-process", status: "succeeded" });

      expect(() =>
        repo.storeCodeProposal({
          projectId: project.id,
          agentRunId: run.id,
          targetNodeId: "artifact-process",
          diff: "diff --git",
          artifactManifest: {
            testScriptDirectory: "ignored-by-storage",
            scripts: [{ relativePath: "../escape.test.ts", content: "test('escape', () => {})" }]
          }
        })
      ).toThrow(/parent directory traversal/);

      const proposalId = repo.storeCodeProposal({
        projectId: project.id,
        agentRunId: run.id,
        targetNodeId: "artifact-process",
        diff: "diff --git",
        artifactManifest: {
          testScriptDirectory: "ignored-by-storage",
          scripts: [{ relativePath: "process.test.ts", content: "test('process', () => {})" }]
        }
      });
      const workflow = repo.createCodingWorkflow(project.id, "artifact-module", [], "running");
      const item = workflow.items.find((candidate) => candidate.nodeId === "artifact-process")!;
      repo.updateCodingWorkflowItem({ itemId: item.id, status: "proposed", proposalId });
      const generatedPath = path.join(rootPath, "tests", "generated", "__graphcode_generated__", proposalId, "process.test.ts");
      fs.mkdirSync(path.dirname(generatedPath), { recursive: true });
      fs.writeFileSync(generatedPath, "existing", "utf8");

      expect(() => repo.applyCodingWorkflowLayer(project.id, workflow.id, 0)).toThrow(/overwrite generated test artifact/);
      expect(fs.existsSync(path.join(rootPath, "escape.test.ts"))).toBe(false);
    });

    it("rejects cross-project repository mutations and planning patch updates", () => {
      const firstRoot = fs.mkdtempSync(path.join(os.tmpdir(), "graphcode-project-a-"));
      const secondRoot = fs.mkdtempSync(path.join(os.tmpdir(), "graphcode-project-b-"));
      const first = repo.createProject({ id: "project-a", name: "Project A", rootPath: firstRoot });
      const second = repo.createProject({ id: "project-b", name: "Project B", rootPath: secondRoot });
      repo.createNode({ id: "a-root", projectId: first.id, kind: "framework", name: "A Root", agentStatus: "implemented" });
      repo.createNode({ id: "a-module", projectId: first.id, kind: "module", name: "A Module", parentId: "a-root", agentStatus: "planning" });
      repo.createNode({ id: "b-root", projectId: second.id, kind: "framework", name: "B Root", agentStatus: "implemented" });
      repo.createNode({ id: "b-module", projectId: second.id, kind: "module", name: "B Module", parentId: "b-root", agentStatus: "planning" });
      const secondEdge = repo.createEdge({
        id: "b-edge",
        projectId: second.id,
        kind: "uses",
        sourceNodeId: "b-root",
        targetNodeId: "b-module"
      });
      const secondBoundary = repo.createBoundary(second.id, {
        scopeNodeId: "b-root",
        name: "B Boundary",
        position: { x: 0, y: 0 },
        size: { width: 300, height: 180 }
      });
      const secondRun = repo.createAgentRun({ projectId: second.id, agentKind: "coding", targetNodeId: "b-module", status: "succeeded" });
      const secondProposal = repo.storeCodeProposal({ projectId: second.id, agentRunId: secondRun.id, targetNodeId: "b-module", diff: "diff --git" });

      expect(() => repo.createAgentRun({ projectId: first.id, agentKind: "coding", targetNodeId: "b-module" })).toThrow(/does not belong/);
      expect(() => repo.setGraphStatuses(first.id, [{ entityType: "node", entityId: "b-module", status: "coded" }])).toThrow(/does not belong/);
      expect(() => repo.setGraphStatuses(first.id, [{ entityType: "edge", entityId: secondEdge.id, status: "coded" }])).toThrow(/does not belong/);
      expect(() => repo.setGraphStatuses(first.id, [{ entityType: "boundary", entityId: secondBoundary.id, status: "coded" }])).toThrow(/does not belong/);
      expect(() => repo.storeCodeProposal({ projectId: first.id, agentRunId: secondRun.id, targetNodeId: "a-module", diff: "diff --git" })).toThrow(/does not belong/);
      expect(() => repo.storeCodeProposal({ projectId: first.id, targetNodeId: "b-module", diff: "diff --git" })).toThrow(/does not belong/);
      expect(() => repo.createCodingWorkflow(first.id, "b-module")).toThrow(/does not belong/);

      const firstWorkflow = repo.createCodingWorkflow(first.id, "a-module", [], "running");
      expect(() => repo.updateCodingWorkflowItem({ itemId: firstWorkflow.items[0].id, proposalId: secondProposal })).toThrow(/does not belong/);

      const crossProjectPatch = repo.createAgentRun({
        projectId: first.id,
        agentKind: "planning",
        status: "succeeded",
        graphPatch: {
          summary: "Try to edit project B",
          operations: [{ entityType: "node", entityId: "b-module", action: "update", fields: { summary: "Wrong project edit" } }]
        }
      });
      const applied = repo.applyAgentGraphPatch(first.id, crossProjectPatch.id);

      expect(applied.status).toBe("conflicted");
      expect(applied.conflictReason).toContain("no longer exists");
      expect(repo.getNode("b-module").summary).toBe("");
    });

    it("applies planning graph patches transactionally and conflicts overlapping stale edits", () => {
    const project = repo.seedSelfGraph(selfRootPath);
    const first = repo.createAgentRun({
      projectId: project.id,
      agentKind: "planning",
      prompt: "Retitle web module",
      status: "succeeded",
      graphPatch: {
        summary: "Update web module",
        operations: [{ entityType: "node", entityId: "module-web", action: "update", fields: { summary: "First planning edit." } }]
      }
    });
    const second = repo.createAgentRun({
      projectId: project.id,
      agentKind: "planning",
      prompt: "Retitle same web module",
      status: "succeeded",
      graphPatch: {
        summary: "Update web module again",
        operations: [{ entityType: "node", entityId: "module-web", action: "update", fields: { summary: "Second planning edit." } }]
      }
    });

    expect(first.baseGraphRevision).toBe(second.baseGraphRevision);
    const applied = repo.applyAgentGraphPatch(project.id, first.id);
    const conflicted = repo.applyAgentGraphPatch(project.id, second.id);

    expect(applied.status).toBe("succeeded");
    expect(applied.appliedGraphRevision).toBeGreaterThan(first.baseGraphRevision);
    expect(repo.getNode("module-web").summary).toBe("First planning edit.");
    expect(conflicted.status).toBe("conflicted");
    expect(conflicted.conflictReason).toContain("changed after this ticket started");
    expect(repo.getNode("module-web").summary).toBe("First planning edit.");
  });

  it("lets earlier planning agents take priority over later overlapping edits", () => {
    const project = repo.seedSelfGraph(selfRootPath);
    const early = repo.createAgentRun({
      projectId: project.id,
      agentKind: "planning",
      prompt: "Early retitle web module",
      status: "succeeded",
      graphPatch: {
        summary: "Early update",
        operations: [{ entityType: "node", entityId: "module-web", action: "update", fields: { summary: "Early planning edit." } }]
      }
    });
    const late = repo.createAgentRun({
      projectId: project.id,
      agentKind: "planning",
      prompt: "Late retitle same web module",
      status: "succeeded",
      graphPatch: {
        summary: "Late update",
        operations: [{ entityType: "node", entityId: "module-web", action: "update", fields: { summary: "Late planning edit." } }]
      }
    });

    expect(early.baseGraphRevision).toBe(late.baseGraphRevision);

    const appliedLate = repo.applyAgentGraphPatch(project.id, late.id);
    expect(appliedLate.status).toBe("succeeded");
    expect(repo.getNode("module-web").summary).toBe("Late planning edit.");

    const appliedEarly = repo.applyAgentGraphPatch(project.id, early.id);
    expect(appliedEarly.status).toBe("succeeded");
    expect(appliedEarly.appliedGraphRevision).toBeGreaterThan(appliedLate.appliedGraphRevision ?? 0);
    expect(repo.getNode("module-web").summary).toBe("Early planning edit.");
  });

  it("allows stale planning graph patches when touched entities do not overlap", () => {
    const project = repo.seedSelfGraph(selfRootPath);
    const webRun = repo.createAgentRun({
      projectId: project.id,
      agentKind: "planning",
      prompt: "Update web",
      status: "succeeded",
      graphPatch: {
        summary: "Update web",
        operations: [{ entityType: "node", entityId: "module-web", action: "update", fields: { summary: "Web ticket edit." } }]
      }
    });
    const serverRun = repo.createAgentRun({
      projectId: project.id,
      agentKind: "planning",
      prompt: "Update server",
      status: "succeeded",
      graphPatch: {
        summary: "Update server",
        operations: [{ entityType: "node", entityId: "module-local-server", action: "update", fields: { summary: "Server ticket edit." } }]
      }
    });

    const appliedWeb = repo.applyAgentGraphPatch(project.id, webRun.id);
    const appliedServer = repo.applyAgentGraphPatch(project.id, serverRun.id);

    expect(appliedWeb.appliedGraphRevision).not.toBeNull();
    expect(appliedServer.status).toBe("succeeded");
    expect(appliedServer.appliedGraphRevision).toBeGreaterThan(appliedWeb.appliedGraphRevision ?? 0);
    expect(repo.getNode("module-web").summary).toBe("Web ticket edit.");
    expect(repo.getNode("module-local-server").summary).toBe("Server ticket edit.");
  });

  it("migrates legacy coding settings into all coding profiles and backfills run modes", () => {
    const dbPath = path.join(os.tmpdir(), `graphcode-legacy-${crypto.randomUUID()}.sqlite`);
    const legacyDb = openDatabase(dbPath);
    legacyDb.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO projects (id, name, root_path) VALUES ('legacy', 'Legacy', '/tmp/legacy');
      CREATE TABLE agent_settings (
        project_id TEXT NOT NULL,
        agent_kind TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT 'fake',
        model TEXT NOT NULL DEFAULT '',
        parallel_limit INTEGER NOT NULL DEFAULT 4,
        api_key_source_type TEXT NOT NULL DEFAULT 'env',
        api_key_source_value TEXT NOT NULL DEFAULT '',
        system_prompt_source_type TEXT NOT NULL DEFAULT 'manual',
        system_prompt_source_value TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (project_id, agent_kind)
      );
      INSERT INTO agent_settings (
        project_id, agent_kind, provider, model, parallel_limit,
        api_key_source_type, api_key_source_value,
        system_prompt_source_type, system_prompt_source_value
      )
        VALUES
          ('legacy', 'coding', 'openai', 'legacy-coder', 6, 'manual', 'legacy-key', 'manual', 'legacy prompt'),
          ('legacy', 'review', 'openai', 'legacy-reviewer', 3, 'manual', 'legacy-review-key', 'manual', 'legacy review prompt');
      CREATE TABLE agent_runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        agent_kind TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        target_node_id TEXT,
        prompt TEXT NOT NULL DEFAULT '',
        response TEXT NOT NULL DEFAULT '',
        diff TEXT NOT NULL DEFAULT '',
        graph_patch_json TEXT,
        error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO agent_runs (id, project_id, agent_kind, status, prompt)
      VALUES ('run-legacy', 'legacy', 'coding', 'succeeded', 'Patch');
    `);
    migrate(legacyDb);
    const legacyRepo = new GraphRepository(legacyDb);

      const settings = legacyRepo.getWorkspaceSettings("legacy");
      expect(settings.codingAgents.map((agent) => agent.mode).sort()).toEqual(["large", "medium", "small"]);
      expect(settings.reviewAgents.map((agent) => agent.mode).sort()).toEqual(["large", "medium", "small"]);
      expect(settings.scanningAgents.map((agent) => agent.mode).sort()).toEqual(["global", "local", "medium"]);
      expect(legacyRepo.getCodingAgentConfig("legacy", "small").model).toBe("legacy-coder");
      expect(legacyRepo.getCodingAgentConfig("legacy", "large").apiKeySource.value).toBe("legacy-key");
      expect(legacyRepo.getReviewAgentConfig("legacy", "small").model).toBe("legacy-reviewer");
      expect(legacyRepo.getReviewAgentConfig("legacy", "large").apiKeySource.value).toBe("legacy-review-key");
      expect(legacyRepo.getScanningAgentConfig("legacy", "global").parallelLimit).toBe(1);
      expect(legacyRepo.getAgentRun("run-legacy").codingMode).toBe("medium");
      expect(legacyRepo.createAgentRun({ projectId: "legacy", agentKind: "review" }).reviewMode).toBe("medium");

    legacyDb.close();
  });

  it("migrates provider checks while preserving settings and allowing Codex CLI", () => {
    const dbPath = path.join(os.tmpdir(), `graphcode-provider-check-${crypto.randomUUID()}.sqlite`);
    const oldDb = openDatabase(dbPath);
    const providerCheck = "CHECK (provider IN ('fake', 'claudecode', 'openai', 'gemini', 'openrouter'))";
    oldDb.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO projects (id, name, root_path) VALUES ('provider-project', 'Provider Project', '/tmp/provider-project');
      CREATE TABLE agent_settings (
        project_id TEXT NOT NULL,
        agent_kind TEXT NOT NULL CHECK (agent_kind IN ('planning', 'coding', 'review', 'scanning')),
        provider TEXT NOT NULL DEFAULT 'fake' ${providerCheck},
        model TEXT NOT NULL DEFAULT '',
        parallel_limit INTEGER NOT NULL DEFAULT 4,
        api_key_source_type TEXT NOT NULL DEFAULT 'env',
        api_key_source_value TEXT NOT NULL DEFAULT '',
        system_prompt_source_type TEXT NOT NULL DEFAULT 'manual',
        system_prompt_source_value TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (project_id, agent_kind)
      );
      CREATE TABLE coding_agent_settings (
        project_id TEXT NOT NULL,
        coding_mode TEXT NOT NULL CHECK (coding_mode IN ('small', 'medium', 'large')),
        provider TEXT NOT NULL DEFAULT 'fake' ${providerCheck},
        model TEXT NOT NULL DEFAULT '',
        parallel_limit INTEGER NOT NULL DEFAULT 4,
        api_key_source_type TEXT NOT NULL DEFAULT 'env',
        api_key_source_value TEXT NOT NULL DEFAULT '',
        system_prompt_source_type TEXT NOT NULL DEFAULT 'manual',
        system_prompt_source_value TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (project_id, coding_mode)
      );
      CREATE TABLE review_agent_settings (
        project_id TEXT NOT NULL,
        review_mode TEXT NOT NULL CHECK (review_mode IN ('small', 'medium', 'large')),
        provider TEXT NOT NULL DEFAULT 'fake' ${providerCheck},
        model TEXT NOT NULL DEFAULT '',
        parallel_limit INTEGER NOT NULL DEFAULT 4,
        api_key_source_type TEXT NOT NULL DEFAULT 'env',
        api_key_source_value TEXT NOT NULL DEFAULT '',
        system_prompt_source_type TEXT NOT NULL DEFAULT 'manual',
        system_prompt_source_value TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (project_id, review_mode)
      );
      CREATE TABLE scanning_agent_settings (
        project_id TEXT NOT NULL,
        scanning_mode TEXT NOT NULL CHECK (scanning_mode IN ('local', 'medium', 'global')),
        provider TEXT NOT NULL DEFAULT 'fake' ${providerCheck},
        model TEXT NOT NULL DEFAULT '',
        parallel_limit INTEGER NOT NULL DEFAULT 4,
        api_key_source_type TEXT NOT NULL DEFAULT 'env',
        api_key_source_value TEXT NOT NULL DEFAULT '',
        system_prompt_source_type TEXT NOT NULL DEFAULT 'manual',
        system_prompt_source_value TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (project_id, scanning_mode)
      );
      INSERT INTO agent_settings (project_id, agent_kind, provider, model, parallel_limit, system_prompt_source_value)
      VALUES ('provider-project', 'planning', 'openai', 'planner', 2, 'Plan');
      INSERT INTO coding_agent_settings (project_id, coding_mode, provider, model, parallel_limit, system_prompt_source_value)
      VALUES ('provider-project', 'small', 'openai', 'coder', 2, 'Code');
      INSERT INTO review_agent_settings (project_id, review_mode, provider, model, parallel_limit, system_prompt_source_value)
      VALUES ('provider-project', 'small', 'openai', 'reviewer', 1, 'Review');
      INSERT INTO scanning_agent_settings (project_id, scanning_mode, provider, model, parallel_limit, system_prompt_source_value)
      VALUES ('provider-project', 'local', 'openai', 'scanner', 4, 'Scan');
    `);

    migrate(oldDb);
    const oldRepo = new GraphRepository(oldDb);
    expect(oldRepo.getAgentConfig("provider-project", "planning").model).toBe("planner");
    expect(
      (oldDb.prepare("SELECT sql FROM sqlite_master WHERE name = 'coding_agent_settings'").get() as { sql: string }).sql
    ).toContain("'codex'");

    expect(() =>
      oldRepo.saveWorkspaceSettings("provider-project", {
        general: { theme: "system" },
        github: { enabled: false, repository: "", clientId: "" },
        automation: { autoReviewAfterCoding: true },
        extensions: { enabledPackageIds: [], configs: {} },
        agents: [
          {
            agentKind: "planning",
            provider: "codex",
            model: "codex",
            ...codexSettingDefaults,
            cliCommand: "codex",
            parallelLimit: 1,
            apiKeySource: { type: "env", value: "" },
            systemPromptSource: { type: "manual", value: "Plan with Codex." }
          }
        ],
        codingAgents: [
          {
            mode: "small",
            provider: "codex",
            model: "codex",
            ...codexSettingDefaults,
            cliCommand: "codex",
            parallelLimit: 1,
            apiKeySource: { type: "env", value: "" },
            systemPromptSource: { type: "manual", value: "Code with Codex." }
          }
        ],
        reviewAgents: [
          {
            mode: "small",
            provider: "codex",
            model: "codex",
            ...codexSettingDefaults,
            cliCommand: "codex",
            parallelLimit: 1,
            apiKeySource: { type: "env", value: "" },
            systemPromptSource: { type: "manual", value: "Review with Codex." }
          }
        ],
        scanningAgents: [
          {
            mode: "local",
            provider: "codex",
            model: "codex",
            ...codexSettingDefaults,
            cliCommand: "codex",
            parallelLimit: 1,
            apiKeySource: { type: "env", value: "" },
            systemPromptSource: { type: "manual", value: "Scan with Codex." }
          }
        ]
      })
    ).not.toThrow();
    expect(oldRepo.getCodingAgentConfig("provider-project", "small").provider).toBe("codex");
    expect(oldRepo.getReviewAgentConfig("provider-project", "small").provider).toBe("codex");
    expect(oldRepo.getScanningAgentConfig("provider-project", "local").provider).toBe("codex");

    oldDb.close();
  });

  it("persists scan file state and source evidence while cleaning generated rows incrementally", () => {
    const project = repo.createProject({ id: "scan-project", name: "Scan Project", rootPath: "/tmp/scan-project" });
    const initialScan: ScanPipelineResult = {
      initial: true,
      inventory: [
        { path: "src/a.ts", contentHash: "hash-a", size: 42, language: "typescript" },
        { path: "src/b.ts", contentHash: "hash-b", size: 21, language: "typescript" }
      ],
      changedFiles: [
        { path: "src/a.ts", contentHash: "hash-a", size: 42, language: "typescript" },
        { path: "src/b.ts", contentHash: "hash-b", size: 21, language: "typescript" }
      ],
      deletedFiles: [],
      globalOutput: {
        summary: "Initial global graph",
        nodes: [
          {
            stableKey: "scan-framework-test",
            kind: "framework",
            name: "Scan Root",
            summary: "Scanned repository",
            codeContext: "Scanned repository",
            source: { path: null, startLine: null, endLine: null },
            language: "unknown"
          }
        ],
        edges: []
      },
      mediumOutputs: [
        {
          scopePath: "src",
          summary: "Source directory",
          nodes: [
            {
              stableKey: "scan-dir-src",
              kind: "module",
              name: "src",
              summary: "Source directory",
              codeContext: "Source directory",
              source: { path: "src", startLine: null, endLine: null },
              language: "unknown",
              parentStableKey: "scan-framework-test"
            }
          ],
          edges: []
        }
      ],
      localOutputs: [
        localScanOutput("src/a.ts", "hash-a", "scan-file-a", "scan-fn-a", "scan-edge-a-to-b"),
        localScanOutput("src/b.ts", "hash-b", "scan-file-b", "scan-fn-b")
      ]
    };

    const initialCounts = repo.applyScanPipelineResult(project.id, initialScan);

    expect(initialCounts.fileCount).toBe(2);
    expect(repo.listScanFileStates(project.id).map((state) => state.filePath).sort()).toEqual(["src/a.ts", "src/b.ts"]);
    expect(repo.getEdge("scan-edge-a-to-b").source).toEqual({ path: "src/a.ts", startLine: 2, endLine: 3 });

    const incrementalScan: ScanPipelineResult = {
      ...initialScan,
      initial: false,
      inventory: [{ path: "src/a.ts", contentHash: "hash-a2", size: 45, language: "typescript" }],
      changedFiles: [{ path: "src/a.ts", contentHash: "hash-a2", size: 45, language: "typescript" }],
      deletedFiles: [{ filePath: "src/b.ts", contentHash: "hash-b" }],
      localOutputs: [localScanOutput("src/a.ts", "hash-a2", "scan-file-a", "scan-fn-a")]
    };

    const incrementalCounts = repo.applyScanPipelineResult(project.id, incrementalScan);

    expect(incrementalCounts.fileCount).toBe(1);
    expect(repo.listScanFileStates(project.id).map((state) => state.filePath)).toEqual(["src/a.ts"]);
    expect(db.prepare("SELECT id FROM graph_nodes WHERE id = ?").get("scan-file-b")).toBeUndefined();
    expect(db.prepare("SELECT id FROM graph_edges WHERE id = ?").get("scan-edge-a-to-b")).toBeUndefined();
    expect(repo.getNode("scan-file-a").source.path).toBe("src/a.ts");
  });

  it("demotes semantic edits while preserving status for layout, style, and tag edits", () => {
    const project = repo.seedSelfGraph(selfRootPath);

    repo.updateNodeLayout("module-web", {
      scopeNodeId: "framework-graphcode-self",
      position: { x: 100, y: 120 },
      size: { width: 260, height: 140 }
    });
    repo.setNodeTags("module-web", { tags: [{ name: "frontend" }] });
    repo.updateNodeTypeStyle(project.id, "module", { color: "#2563eb" });
    expect(repo.getNode("module-web").agentStatus).toBe("implemented");

    repo.updateNode("module-web", { summary: "Updated semantic module summary." });
    expect(repo.getNode("module-web").agentStatus).toBe("planning");

    repo.updateEdge("flow-web-input-process", { color: "#2563eb" });
    expect(repo.getEdge("flow-web-input-process").agentStatus).toBe("implemented");

    repo.updateEdge("flow-web-input-process", { label: "semantic relabel" });
    expect(repo.getEdge("flow-web-input-process").agentStatus).toBe("planning");
  });

  it("seeds a valid self-repo hierarchy and keeps attachments out of the hierarchy tree", () => {
    const project = repo.seedSelfGraph(selfRootPath);
    const hierarchy = repo.getHierarchy(project.id);
    const flattened = flattenHierarchy(hierarchy);

    expect(project.id).toBe("graphcode-self");
    expect(project.rootPath).toBe(selfRootPath);
    expect(hierarchy).toHaveLength(1);
    expect(hierarchy[0].kind).toBe("framework");
    expect(flattened.map((node) => node.name)).toContain("Web Workspace");
    expect(flattened.map((node) => node.name)).toContain("Local Server");
    expect(flattened.map((node) => node.name)).toContain("Graph Model");
    expect(flattened.map((node) => node.name)).toContain("Parser Package");
    expect(flattened.map((node) => node.kind)).toEqual(expect.arrayContaining(["website", "ui_component"]));
    expect(flattened.every((node) => node.agentStatus === "implemented")).toBe(true);
    expect(flattened.every((node) => ["framework", "module", "website", "ui_component", "function", "object"].includes(node.kind))).toBe(true);
    expect(flattened.some((node) => node.boundaryLabels.length > 0)).toBe(true);
    expect(flattened.flatMap((node) => node.boundaryGroups).map((boundary) => boundary.name)).toContain("Frontend");
  });

  it("rejects invalid typed containment", () => {
    const project = repo.createProject({ id: "project", name: "Project", rootPath: "/tmp/project" });
    repo.createNode({
      id: "framework",
      projectId: project.id,
      kind: "framework",
      name: "Framework"
    });
    repo.createNode({
      id: "module",
      projectId: project.id,
      kind: "module",
      name: "Module",
      parentId: "framework"
    });
    repo.createNode({
      id: "parent-function",
      projectId: project.id,
      kind: "function",
      name: "Parent Function",
      parentId: "module"
    });
    repo.createNode({
      id: "child-function",
      projectId: project.id,
      kind: "function",
      name: "Child Function",
      parentId: "parent-function"
    });
    repo.createNode({
      id: "child-object",
      projectId: project.id,
      kind: "object",
      name: "Child Object",
      parentId: "parent-function"
    });

    expect(() =>
      repo.createNode({
        id: "bad-function",
        projectId: project.id,
        kind: "function",
        name: "Bad Function",
        parentId: "framework"
      })
    ).toThrow(/module or function/);
  });

  it("rejects indirect containment and attachment cycles", () => {
    const project = repo.createProject({ id: "project", name: "Project", rootPath: "/tmp/project" });
    repo.createNode({
      id: "framework",
      projectId: project.id,
      kind: "framework",
      name: "Framework"
    });
    repo.createNode({
      id: "module-a",
      projectId: project.id,
      kind: "module",
      name: "Module A",
      parentId: "framework"
    });
    repo.createNode({
      id: "module-b",
      projectId: project.id,
      kind: "module",
      name: "Module B",
      parentId: "module-a"
    });
    repo.createNode({
      id: "api-a",
      projectId: project.id,
      kind: "api",
      name: "API A",
      attachedToId: "module-a"
    });
    repo.createNode({
      id: "event-b",
      projectId: project.id,
      kind: "event",
      name: "Event B",
      attachedToId: "api-a"
    });

    expect(() => repo.updateNode("module-a", { parentId: "module-b" })).toThrow(/containment cannot create a cycle/);
    expect(() => repo.updateNode("api-a", { attachedToId: "event-b" })).toThrow(/attachments cannot create a cycle/);
  });

  it("returns framework canvas data with only the next layer", async () => {
    const project = repo.seedSelfGraph(selfRootPath);
    const canvas = await repo.getCanvasGraph({
      projectId: project.id,
      rootNodeId: "framework-graphcode-self",
      includeAttachments: true
    });

    expect(canvas.scopeNodeId).toBe("framework-graphcode-self");
    expect(canvas.nodes.map((node) => node.id)).not.toContain("framework-graphcode-self");
    expect(canvas.nodes.map((node) => node.name).sort()).toEqual([
      "Agent Runtime",
      "Developer Tooling",
      "Docs and Research",
      "Graph Model",
      "Local Server",
      "Parser Package",
      "Web Workspace"
    ]);
    expect(canvas.boundaries.map((boundary) => boundary.name)).toEqual(expect.arrayContaining(["Frontend", "Backend", "Shared Model", "Tooling"]));
  });

  it("replaces shallow scanner nodes with a bottom-up Code Graph and function workflow", async () => {
    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "graphcode-codegraph-"));
    fs.mkdirSync(path.join(rootPath, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(rootPath, "src", "math.ts"),
      [
        "export function add(left: number, right: number): number {",
        "  return left + right;",
        "}",
        "export function double(value: number): number {",
        "  return add(value, value);",
        "}",
        "export function outer(flag: boolean): number {",
        "  function inner(value: number): number {",
        "    return value > 0 ? value : -value;",
        "  }",
        "  if (flag) {",
        "    return inner(1);",
        "  } else {",
        "    throw new Error('flag');",
        "  }",
        "}",
        "export function choose(value: number): number {",
        "  switch (value) {",
        "    case 1:",
        "      return outer(true);",
        "    default:",
        "      return double(value);",
        "  }",
        "}"
      ].join("\n")
    );

    const project = repo.seedSelfGraph(rootPath);
    repo.upsertScannedFileNode({
      projectId: project.id,
      id: "scan-file-workspace",
      name: "workspace.ts",
      summary: "typescript file workspace.ts",
      sourcePath: "apps/local-server/src/workspace.ts",
      language: "typescript"
    });
    const result = repo.replaceScannedCodeGraph(project.id, scanRepositoryCodeGraph(rootPath));
    const hierarchy = flattenHierarchy(repo.getHierarchy(project.id));
    const codeRoot = hierarchy.find((node) => node.name === "graph-code Code Graph");
    const mathFile = hierarchy.find((node) => node.name === "math.ts");
    const add = hierarchy.find((node) => node.name === "add");
    const outer = hierarchy.find((node) => node.name === "outer");
    const inner = hierarchy.find((node) => node.name === "inner");
    const staleScans = db.prepare("SELECT COUNT(*) AS count FROM graph_nodes WHERE id LIKE 'scan-%'").get() as { count: number };

    expect(result.fileCount).toBe(1);
    expect(result.symbolCount).toBe(5);
    expect(result.workflowNodeCount).toBeGreaterThan(0);
    expect(staleScans.count).toBe(0);
    expect(codeRoot?.parentId).toBe("framework-graphcode-self");
    expect(hierarchy.map((node) => node.name)).toEqual(
      expect.arrayContaining(["graph-code Code Graph", "src", "math.ts", "add", "double", "outer", "inner"])
    );
    expect(inner?.parentId).toBe(outer?.id);
    expect(hierarchy.every((node) => ["framework", "module", "website", "ui_component", "function", "object"].includes(node.kind))).toBe(true);

    const codeCanvas = await repo.getCanvasGraph({
      projectId: project.id,
      rootNodeId: codeRoot!.id,
      includeAttachments: true
    });
    expect(codeCanvas.nodes.map((node) => node.name)).toContain("src");

    const fileCanvas = await repo.getCanvasGraph({
      projectId: project.id,
      rootNodeId: mathFile!.id,
      includeAttachments: true
    });
    expect(fileCanvas.nodes.map((node) => node.name)).toEqual(expect.arrayContaining(["add", "double", "outer", "choose"]));
    expect(fileCanvas.nodes.map((node) => node.name)).not.toContain("inner");
    expect(fileCanvas.nodes).toHaveLength(4);
    expect(fileCanvas.nodes.every((node) => node.kind === "function" || node.kind === "object")).toBe(true);
    expect(fileCanvas.edges.some((edge) => edge.kind === "calls" && edge.label === "add")).toBe(true);

    const functionCanvas = await repo.getCanvasGraph({
      projectId: project.id,
      rootNodeId: outer!.id,
      includeAttachments: true
    });
    expect(functionCanvas.nodes.map((node) => node.kind)).toEqual(expect.arrayContaining(["function", "input", "process", "output", "format"]));
    expect(functionCanvas.nodes.map((node) => node.name)).toEqual(expect.arrayContaining(["inner", "flag", "Returns number", "Throws error"]));
    expect(functionCanvas.processes.map((process) => process.processKind)).toContain("condition");
    expect(functionCanvas.edges.map((edge) => edge.label)).toEqual(expect.arrayContaining(["if flag", "else", "throw", "return"]));
    expect(functionCanvas.edges.map((edge) => edge.kind)).toEqual(expect.arrayContaining(["flows", "describes_format"]));

    const innerCanvas = await repo.getCanvasGraph({
      projectId: project.id,
      rootNodeId: inner!.id,
      includeAttachments: true
    });
    expect(innerCanvas.nodes.map((node) => node.name)).toEqual(expect.arrayContaining(["inner", "value", "Returns number"]));
    expect(innerCanvas.edges.map((edge) => edge.label)).toEqual(expect.arrayContaining(["if value > 0", "else"]));
  });

  it("preserves stable generated layouts across code graph refreshes and drops disappeared layout rows", async () => {
    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "graphcode-layout-refresh-"));
    fs.mkdirSync(path.join(rootPath, "src"), { recursive: true });
    const sourcePath = path.join(rootPath, "src", "layout.ts");
    fs.writeFileSync(
      sourcePath,
      [
        "export function keep(value: number): number {",
        "  return value + 1;",
        "}",
        "",
        "export function drop(value: number): number {",
        "  return value - 1;",
        "}"
      ].join("\n")
    );

    const project = repo.seedSelfGraph(rootPath);
    repo.replaceScannedCodeGraph(project.id, scanRepositoryCodeGraph(rootPath));
    const hierarchy = flattenHierarchy(repo.getHierarchy(project.id));
    const layoutFile = hierarchy.find((node) => node.name === "layout.ts");
    const keepNode = hierarchy.find((node) => node.name === "keep");
    const dropNode = hierarchy.find((node) => node.name === "drop");
    expect(layoutFile).toBeDefined();
    expect(keepNode).toBeDefined();
    expect(dropNode).toBeDefined();

    repo.updateNodeLayout(keepNode!.id, {
      scopeNodeId: layoutFile!.id,
      position: { x: 456, y: 321 },
      size: { width: 280, height: 150 }
    });
    repo.updateNodeLayout(dropNode!.id, {
      scopeNodeId: layoutFile!.id,
      position: { x: 840, y: 321 },
      size: { width: 280, height: 150 }
    });
    fs.writeFileSync(
      sourcePath,
      ["export function keep(value: number): number {", "  return value + 1;", "}"].join("\n")
    );

    repo.replaceScannedCodeGraph(project.id, scanRepositoryCodeGraph(rootPath));
    const refreshedCanvas = await repo.getCanvasGraph({
      projectId: project.id,
      rootNodeId: layoutFile!.id,
      includeAttachments: true
    });
    const refreshedKeep = refreshedCanvas.nodes.find((node) => node.id === keepNode!.id);
    const staleDropLayouts = db.prepare("SELECT COUNT(*) AS count FROM graph_node_layouts WHERE node_id = ?").get(dropNode!.id) as { count: number };

    expect(refreshedKeep?.position).toEqual({ x: 456, y: 321 });
    expect(refreshedKeep?.size).toEqual({ width: 280, height: 150 });
    expect(refreshedCanvas.nodes.map((node) => node.id)).not.toContain(dropNode!.id);
    expect(staleDropLayouts.count).toBe(0);
  });

  it("keeps large file canvases bounded while function canvases show workflow", async () => {
    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "graphcode-large-file-"));
    fs.mkdirSync(path.join(rootPath, "src"), { recursive: true });
    const sourceLines = Array.from({ length: 32 }, (_, index) => [
      `export function step${index}(value: number): number {`,
      `  if (value > ${index}) {`,
      `    return value - ${index};`,
      "  }",
      `  return value + ${index};`,
      "}"
    ])
      .flat()
      .join("\n");
    fs.writeFileSync(path.join(rootPath, "src", "large.ts"), sourceLines);

    const project = repo.seedSelfGraph(rootPath);
    repo.replaceScannedCodeGraph(project.id, scanRepositoryCodeGraph(rootPath));
    const hierarchy = flattenHierarchy(repo.getHierarchy(project.id));
    const largeFile = hierarchy.find((node) => node.name === "large.ts");
    const step7 = hierarchy.find((node) => node.name === "step7");

    const fileCanvas = await repo.getCanvasGraph({
      projectId: project.id,
      rootNodeId: largeFile!.id,
      includeAttachments: true
    });
    expect(fileCanvas.nodes).toHaveLength(32);
    expect(fileCanvas.nodes.every((node) => node.kind === "function")).toBe(true);
    expect(fileCanvas.nodes.map((node) => node.kind)).not.toEqual(expect.arrayContaining(["input", "process", "output", "format"]));

    const functionCanvas = await repo.getCanvasGraph({
      projectId: project.id,
      rootNodeId: step7!.id,
      includeAttachments: true
    });
    expect(functionCanvas.nodes.map((node) => node.kind)).toEqual(expect.arrayContaining(["function", "input", "process", "output", "format"]));
    expect(functionCanvas.nodes.map((node) => node.name)).toEqual(expect.arrayContaining(["step7", "value", "Returns number"]));
    expect(functionCanvas.edges.map((edge) => edge.label)).toEqual(expect.arrayContaining(["if value > 7", "else"]));
  });

  it("returns local-server canvas data with owner-scoped attachments and basic blocks", async () => {
    const project = repo.seedSelfGraph(selfRootPath);
    const canvas = await repo.getCanvasGraph({
      projectId: project.id,
      rootNodeId: "module-local-server",
      includeAttachments: true
    });

    expect(canvas.nodes.map((node) => node.kind)).toContain("process");
    expect(canvas.nodes.map((node) => node.kind)).toContain("input");
    expect(canvas.nodes.map((node) => node.kind)).toContain("output");
    expect(canvas.nodes.map((node) => node.kind)).toContain("format");
    expect(canvas.nodes.map((node) => node.kind)).toContain("dependency");
    expect(canvas.nodes.map((node) => node.kind)).toContain("database");
    expect(canvas.nodes.map((node) => node.kind)).toContain("config");
    expect(canvas.nodes.map((node) => node.kind)).toContain("secret");
    expect(canvas.nodes.map((node) => node.kind)).not.toContain("command");
    expect(canvas.nodes.map((node) => node.kind)).not.toContain("api");
    expect(canvas.nodes.map((node) => node.name)).toContain("Graph Repository");
    expect(canvas.nodes.map((node) => node.name)).toContain("GraphTag");
    expect(canvas.nodes.map((node) => node.name)).toContain("Serve Graph Scope");
    expect(canvas.nodes.map((node) => node.name)).not.toContain("Persist Graph State");
    expect(canvas.reuses.map((reuse) => reuse.nodeId)).toContain("object-graph-tag");
    expect(canvas.dependencies.map((dependency) => dependency.spec)).toContain("better-sqlite3");
    expect(canvas.formats.map((format) => format.spec)).toContain("SQLite rows");
    expect(canvas.basicDetails.map((detail) => detail.basicKind)).toEqual(expect.arrayContaining(["database", "config", "secret"]));
    expect(canvas.boundaries.map((boundary) => boundary.name)).toContain("Backend Internals");
  });

  it("stores tags on nodes, edges, and boundaries", async () => {
    const project = repo.seedSelfGraph(selfRootPath);
    const node = repo.setNodeTags("module-web", {
      tags: [
        { name: "frontend", color: "#2563eb" },
        { name: "interactive" }
      ]
    });
    const edge = repo.setEdgeTags("edge-web-uses-server", {
      tags: [{ name: "api", color: "#0891b2" }]
    });
    const boundary = repo.setBoundaryTags("boundary-frontend", {
      tags: [{ name: "frontend", color: "#2563eb" }]
    });
    const canvas = await repo.getCanvasGraph({
      projectId: project.id,
      rootNodeId: "framework-graphcode-self",
      includeAttachments: true
    });

    expect(node.tags.map((tag) => tag.name)).toEqual(["frontend", "interactive"]);
    expect(edge.tags.map((tag) => tag.name)).toEqual(["api"]);
    expect(boundary.tags.map((tag) => tag.name)).toEqual(["frontend"]);
    expect(canvas.nodes.find((item) => item.id === "module-web")?.tags.map((tag) => tag.name)).toContain("interactive");
    expect(canvas.edges.find((item) => item.id === "edge-web-uses-server")?.tags.map((tag) => tag.name)).toContain("api");
    expect(canvas.boundaries.find((item) => item.id === "boundary-frontend")?.tags.map((tag) => tag.name)).toContain("frontend");
  });

  it("places reusable utility nodes in multiple canvas scopes without duplicating ownership", async () => {
    const project = repo.seedSelfGraph(selfRootPath);
    const webCanvas = await repo.getCanvasGraph({
      projectId: project.id,
      rootNodeId: "module-web",
      includeAttachments: true
    });
    const serverCanvas = await repo.getCanvasGraph({
      projectId: project.id,
      rootNodeId: "module-local-server",
      includeAttachments: true
    });
    const detail = repo.getNodeDetail("object-graph-tag");
    const canonicalRow = db.prepare("SELECT parent_id FROM graph_nodes WHERE id = 'object-graph-tag'").get() as { parent_id: string };
    const canonicalCount = db.prepare("SELECT COUNT(*) AS count FROM graph_nodes WHERE id = 'object-graph-tag'").get() as { count: number };

    expect(canonicalRow.parent_id).toBe("module-graph-contract");
    expect(canonicalCount.count).toBe(1);
    expect(webCanvas.nodes.map((node) => node.id)).toContain("object-graph-tag");
    expect(serverCanvas.nodes.map((node) => node.id)).toContain("object-graph-tag");
    expect(detail.reusedIn.map((reuse) => reuse.scopeNodeId).sort()).toEqual(["module-local-server", "module-web"]);
    expect(webCanvas.reuses.find((reuse) => reuse.nodeId === "object-graph-tag")?.label).toBe("Reused tag DTO");
  });

  it("creates and updates edges with detailed code context", async () => {
    const project = repo.seedSelfGraph(selfRootPath);
    const edge = repo.createEdgeFromMutation(project.id, {
      kind: "uses",
      sourceNodeId: "module-web",
      targetNodeId: "module-local-server",
      label: "local API",
      codeContext: "The browser app depends on this server API contract.",
      color: "#0891b2",
      animated: true,
      pointingEnabled: true,
      pointingDirection: "bidirectional"
    });
    const updated = repo.updateEdge(edge.id, {
      label: "workspace API",
      codeContext: "Changing this edge means updating fetch wrappers, routes, and route tests.",
      color: "#dc2626",
      animated: false,
      pointingEnabled: false,
      pointingDirection: "target_to_source"
    });
    const canvas = await repo.getCanvasGraph({
      projectId: project.id,
      rootNodeId: "framework-graphcode-self",
      includeAttachments: true
    });

    expect(updated.label).toBe("workspace API");
    expect(updated.codeContext).toContain("route tests");
    expect(updated.color).toBe("#dc2626");
    expect(updated.animated).toBe(false);
    expect(updated.pointingEnabled).toBe(false);
    expect(updated.pointingDirection).toBe("target_to_source");
    expect(canvas.edges.find((item) => item.id === edge.id)?.codeContext).toContain("fetch wrappers");
  });

  it("persists boundary groups and only recomputes membership when the boundary changes", () => {
    const project = repo.seedSelfGraph(selfRootPath);
    const boundary = repo.createBoundary(project.id, {
      scopeNodeId: "framework-graphcode-self",
      name: "One Module Box",
      summary: "Contains web module",
      codeContext: "Membership should follow the visible saved layout in this scope.",
      color: "#2563eb",
      position: { x: 30, y: 40 },
      size: { width: 300, height: 180 }
    });

    expect(boundary.memberNodeIds).toContain("module-web");
    expect(boundary.color).toBe("#2563eb");

    repo.updateNodeLayout("module-web", {
      scopeNodeId: "framework-graphcode-self",
      position: { x: 960, y: 860 },
      size: { width: 260, height: 136 }
    });
    expect(repo.getBoundary(boundary.id).memberNodeIds).toContain("module-web");

    const movedBoundary = repo.updateBoundary(boundary.id, {
      position: { x: 940, y: 840 },
      size: { width: 340, height: 220 },
      codeContext: "Updated after moving the web module."
    });

    expect(movedBoundary.memberNodeIds).toContain("module-web");
    expect(movedBoundary.codeContext).toContain("moving the web module");
  });

  it("persists typed style overrides", () => {
    const project = repo.seedSelfGraph(selfRootPath);
    const nodeStyle = repo.updateNodeTypeStyle(project.id, "ui_component", { color: "#db2777" });
    const customType = repo.createCustomBlockType(project.id, { name: "Styled Custom", color: "#334155" });
    const updatedCustomType = repo.updateCustomBlockType(customType.id, { color: "#0f766e" });

    expect(nodeStyle.color).toBe("#db2777");
    expect(repo.listNodeTypeStyles(project.id).map((style) => style.nodeKind)).toContain("ui_component");
    expect(updatedCustomType.color).toBe("#0f766e");
  });

  it("returns a selected node detail with attached dependencies, inputs, and outputs", () => {
    const project = repo.seedSelfGraph(selfRootPath);
    const detail = repo.getNodeDetail("module-local-server");

    expect(project.id).toBe("graphcode-self");
    expect(detail.node.name).toBe("Local Server");
    expect(detail.processes.map((process) => process.node.name)).toContain("Serve Graph Scope");
    expect(detail.inputs.map((input) => input.node.name)).toContain("Browser API Request");
    expect(detail.outputs.map((output) => output.node.name)).toContain("graphcode.sqlite");
    expect(detail.basicDetails.map((basic) => basic.node.name)).toEqual(expect.arrayContaining([".graphcode SQLite", "GRAPHCODE_DB_PATH", "No Secrets Stored"]));
    expect(detail.hasChildren).toBe(true);
  });

  it("persists layout overrides per scope", async () => {
    const project = repo.seedSelfGraph(selfRootPath);
    repo.updateNodeLayout("module-web", {
      scopeNodeId: "framework-graphcode-self",
      position: { x: 777, y: 222 },
      size: { width: 310, height: 160 }
    });

    const canvas = await repo.getCanvasGraph({
      projectId: project.id,
      rootNodeId: "framework-graphcode-self",
      includeAttachments: true
    });
    const webNode = canvas.nodes.find((node) => node.id === "module-web");

    expect(webNode?.position).toEqual({ x: 777, y: 222 });
    expect(webNode?.size).toEqual({ width: 310, height: 160 });
  });

  it("persists layout overrides after reopening the SQLite database", async () => {
    const dbPath = path.join(os.tmpdir(), `graphcode-reopen-${crypto.randomUUID()}.sqlite`);
    let firstDb: GraphDatabase | null = null;
    let reopenedDb: GraphDatabase | null = null;
    try {
      firstDb = openDatabase(dbPath);
      migrate(firstDb);
      const firstRepo = new GraphRepository(firstDb);
      const project = firstRepo.seedSelfGraph(selfRootPath);
      firstRepo.updateNodeLayout("module-web", {
        scopeNodeId: "framework-graphcode-self",
        position: { x: 901, y: 404 },
        size: { width: 300, height: 155 }
      });
      firstDb.close();
      firstDb = null;

      reopenedDb = openDatabase(dbPath);
      migrate(reopenedDb);
      const reopenedRepo = new GraphRepository(reopenedDb);
      const canvas = await reopenedRepo.getCanvasGraph({
        projectId: project.id,
        rootNodeId: "framework-graphcode-self",
        includeAttachments: true
      });
      const webNode = canvas.nodes.find((node) => node.id === "module-web");

      expect(webNode?.position).toEqual({ x: 901, y: 404 });
      expect(webNode?.size).toEqual({ width: 300, height: 155 });
    } finally {
      firstDb?.close();
      reopenedDb?.close();
      fs.rmSync(dbPath, { force: true });
    }
  });

  it("backfills missing per-scope layout rows without moving saved nodes", async () => {
    const project = repo.seedSelfGraph(selfRootPath);
    const beforeRows = db
      .prepare("SELECT COUNT(*) AS count FROM graph_node_layouts WHERE project_id = ? AND scope_node_id = ?")
      .get(project.id, "framework-graphcode-self") as { count: number };

    const canvas = await repo.getCanvasGraph({
      projectId: project.id,
      rootNodeId: "framework-graphcode-self",
      includeAttachments: true
    });
    const afterRows = db
      .prepare("SELECT COUNT(*) AS count FROM graph_node_layouts WHERE project_id = ? AND scope_node_id = ?")
      .get(project.id, "framework-graphcode-self") as { count: number };
    const devToolingLayout = db
      .prepare("SELECT ui_x, ui_y FROM graph_node_layouts WHERE project_id = ? AND scope_node_id = ? AND node_id = ?")
      .get(project.id, "framework-graphcode-self", "module-dev-tooling") as { ui_x: number; ui_y: number } | undefined;
    const webNode = canvas.nodes.find((node) => node.id === "module-web");
    const localServerNode = canvas.nodes.find((node) => node.id === "module-local-server");
    const modelNode = canvas.nodes.find((node) => node.id === "module-model");

    expect(beforeRows.count).toBeGreaterThan(0);
    expect(afterRows.count).toBe(canvas.nodes.length);
    expect(afterRows.count).toBeGreaterThan(beforeRows.count);
    expect(webNode?.position).toEqual({ x: 40, y: 60 });
    expect(localServerNode?.position).toEqual({ x: 360, y: 60 });
    expect(modelNode?.position).toEqual({ x: 680, y: 60 });
    expect(devToolingLayout?.ui_x).toBeGreaterThan(940);
    expect(new Set(canvas.nodes.map((node) => `${node.position.x}:${node.position.y}`)).size).toBe(canvas.nodes.length);
  });

  it("auto-layout persists per-scope layout rows", async () => {
    const project = repo.seedSelfGraph(selfRootPath);
    const beforeMembers = repo.getBoundary("boundary-backend-internals").memberNodeIds;
    const canvas = await repo.autoLayoutScope({
      projectId: project.id,
      scopeNodeId: "module-local-server",
      includeAttachments: true
    });
    const count = db
      .prepare("SELECT COUNT(*) AS count FROM graph_node_layouts WHERE scope_node_id = 'module-local-server'")
      .get() as { count: number };

    expect(canvas.scopeNodeId).toBe("module-local-server");
    expect(count.count).toBeGreaterThan(0);
    const boundary = canvas.boundaries.find((item) => item.id === "boundary-backend-internals");
    expect(boundary?.memberNodeIds).toEqual(beforeMembers);
    const memberNodes = canvas.nodes.filter((node) => boundary?.memberNodeIds.includes(node.id));
    expect(memberNodes.length).toBeGreaterThan(0);
    expect(memberNodes.every((node) => nodeCenterInside(node, boundary!))).toBe(true);
  });

  it("passes measured edge labels into auto-layout edges", async () => {
    const project = repo.seedSelfGraph(selfRootPath);
    const canvas = await repo.getCanvasGraph({
      projectId: project.id,
      rootNodeId: "module-web",
      includeAttachments: true
    });
    const includedIds = new Set(canvas.nodes.map((node) => node.id));
    const elkEdges = buildElkEdgesForLayout(canvas.nodes, canvas.edges, includedIds);
    const flowEdge = elkEdges.find((edge) => edge.id === "flow-web-input-process");

    expect(flowEdge?.labels?.[0]).toMatchObject({
      text: "selection"
    });
    expect(flowEdge?.labels?.[0]?.width).toBeGreaterThan(58);
    expect(flowEdge?.labels?.[0]?.height).toBeGreaterThan(0);
  });

  it("auto-layout reserves boundary header space before member blocks", async () => {
    const project = repo.seedSelfGraph(selfRootPath);
    repo.updateBoundary("boundary-backend-internals", {
      summary: "Local API and persistence modules with a longer boundary description that should keep member blocks below the label area."
    });

    const canvas = await repo.autoLayoutScope({
      projectId: project.id,
      scopeNodeId: "module-local-server",
      includeAttachments: true
    });
    const boundary = canvas.boundaries.find((item) => item.id === "boundary-backend-internals");
    const memberNodes = canvas.nodes.filter((node) => boundary?.memberNodeIds.includes(node.id));
    const firstMemberTop = Math.min(...memberNodes.map((node) => node.position.y));

    expect(boundary).toBeDefined();
    expect(memberNodes.length).toBeGreaterThan(0);
    expect(firstMemberTop - boundary!.position.y).toBeGreaterThanOrEqual(80);
  });

  it("auto-layout expands undersized blocks to fit longer descriptions", async () => {
    const project = repo.seedSelfGraph(selfRootPath);
    repo.updateNode("module-app-shell", {
      summary: "Coordinates the top navigation, search, resizable structure panel, add menu, canvas commands, inspector wiring, and reset controls in one browser workspace shell.",
      size: { width: 150, height: 92 }
    });

    const canvas = await repo.autoLayoutScope({
      projectId: project.id,
      scopeNodeId: "module-web",
      includeAttachments: true
    });
    const node = canvas.nodes.find((item) => item.id === "module-app-shell");

    expect(node?.size.width).toBeGreaterThan(150);
    expect(node?.size.height).toBeGreaterThan(92);
  });

  it("seeds deterministic coverage across edge kinds, details, custom types, layouts, and revisions", () => {
    repo.seedSelfGraph(selfRootPath);
    const edgeKinds = db
      .prepare("SELECT kind FROM graph_edges GROUP BY kind ORDER BY kind")
      .all()
      .map((row) => (row as { kind: string }).kind);
    const counts = Object.fromEntries(
      db
      .prepare(
          `
          SELECT 'projects' AS table_name, COUNT(*) AS count FROM projects
          UNION ALL SELECT 'graph_nodes', COUNT(*) FROM graph_nodes
          UNION ALL SELECT 'graph_edges', COUNT(*) FROM graph_edges
          UNION ALL SELECT 'graph_boundaries', COUNT(*) FROM graph_boundaries
          UNION ALL SELECT 'graph_tags', COUNT(*) FROM graph_tags
          UNION ALL SELECT 'graph_node_tags', COUNT(*) FROM graph_node_tags
          UNION ALL SELECT 'graph_edge_tags', COUNT(*) FROM graph_edge_tags
          UNION ALL SELECT 'graph_boundary_tags', COUNT(*) FROM graph_boundary_tags
          UNION ALL SELECT 'graph_node_reuses', COUNT(*) FROM graph_node_reuses
          UNION ALL SELECT 'basic_block_details', COUNT(*) FROM basic_block_details
          UNION ALL SELECT 'custom_block_types', COUNT(*) FROM custom_block_types
          UNION ALL SELECT 'graph_node_type_styles', COUNT(*) FROM graph_node_type_styles
          UNION ALL SELECT 'graph_node_layouts', COUNT(*) FROM graph_node_layouts
          UNION ALL SELECT 'graph_revisions', COUNT(*) FROM graph_revisions
        `
        )
        .all()
        .map((row) => [(row as { table_name: string }).table_name, (row as { count: number }).count])
    );

    expect(edgeKinds).toEqual(["calls", "describes_format", "flows", "impacts", "imports", "owns", "uses"]);
    expect(counts.projects).toBe(1);
    expect(counts.graph_nodes).toBeGreaterThan(60);
    expect(counts.graph_edges).toBeGreaterThan(25);
    expect(counts.graph_boundaries).toBeGreaterThanOrEqual(4);
    expect(counts.graph_tags).toBeGreaterThanOrEqual(8);
    expect(counts.graph_node_tags).toBeGreaterThanOrEqual(10);
    expect(counts.graph_edge_tags).toBeGreaterThanOrEqual(5);
    expect(counts.graph_boundary_tags).toBeGreaterThanOrEqual(4);
    expect(counts.graph_node_reuses).toBeGreaterThanOrEqual(4);
    expect(counts.basic_block_details).toBeGreaterThanOrEqual(10);
    expect(counts.custom_block_types).toBe(1);
    expect(counts.graph_node_type_styles).toBeGreaterThanOrEqual(2);
    expect(counts.graph_node_layouts).toBeGreaterThan(0);
    expect(counts.graph_revisions).toBe(3);
  });

  it("seeds short summaries distinct from detailed code contexts", () => {
    repo.seedSelfGraph(selfRootPath);
    const nodes = db
      .prepare("SELECT id, summary, code_context FROM graph_nodes WHERE id IN ('module-web', 'module-local-server', 'object-graph-repository') ORDER BY id")
      .all() as Array<{ id: string; summary: string; code_context: string }>;
    const edge = db.prepare("SELECT label, code_context FROM graph_edges WHERE id = 'edge-web-uses-server'").get() as { label: string; code_context: string };

    expect(nodes.every((node) => node.summary.length <= 64)).toBe(true);
    expect(nodes.every((node) => node.code_context.length > node.summary.length)).toBe(true);
    expect(nodes.every((node) => node.code_context !== node.summary)).toBe(true);
    expect(edge.label).toBe("local REST API");
    expect(edge.code_context).toContain("module-web");
  });
});

function flattenHierarchy(nodes: ReturnType<GraphRepository["getHierarchy"]>): ReturnType<GraphRepository["getHierarchy"]> {
  return nodes.flatMap((node) => [node, ...flattenHierarchy(node.children)]);
}

function localScanOutput(
  filePath: string,
  contentHash: string,
  fileStableKey: string,
  functionStableKey: string,
  edgeStableKey?: string
): ScanPipelineResult["localOutputs"][number] {
  return {
    filePath,
    contentHash,
    summary: `Local scan for ${filePath}`,
    nodes: [
      {
        stableKey: fileStableKey,
        kind: "module",
        name: path.basename(filePath),
        summary: `File ${filePath}`,
        codeContext: `File ${filePath}`,
        source: { path: filePath, startLine: 1, endLine: 4 },
        language: "typescript",
        parentStableKey: "scan-dir-src"
      },
      {
        stableKey: functionStableKey,
        kind: "function",
        name: `${path.basename(filePath, ".ts")}Function`,
        summary: `Function in ${filePath}`,
        codeContext: `Function in ${filePath}`,
        source: { path: filePath, startLine: 2, endLine: 3 },
        language: "typescript",
        parentStableKey: fileStableKey
      }
    ],
    edges: edgeStableKey
      ? [
          {
            stableKey: edgeStableKey,
            kind: "calls",
            sourceStableKey: functionStableKey,
            targetStableKey: "scan-file-b",
            label: "calls generated peer",
            codeContext: "Function calls another generated file.",
            source: { path: filePath, startLine: 2, endLine: 3 }
          }
        ]
      : []
  };
}

function nodeCenterInside(
  node: { position: { x: number; y: number }; size: { width: number; height: number } },
  boundary: { position: { x: number; y: number }; size: { width: number; height: number } }
): boolean {
  const centerX = node.position.x + node.size.width / 2;
  const centerY = node.position.y + node.size.height / 2;
  return (
    centerX >= boundary.position.x &&
    centerX <= boundary.position.x + boundary.size.width &&
    centerY >= boundary.position.y &&
    centerY <= boundary.position.y + boundary.size.height
  );
}
