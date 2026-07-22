import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CodingWorkflowOrchestration } from "@graphcode/graph-model";
import { openDatabase, type GraphDatabase } from "./connection";
import { GraphRepository } from "./repository";
import { migrate } from "./schema";

let db: GraphDatabase;
let repo: GraphRepository;
let dbPath: string;
let projectRoot: string;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `graphcode-ma1-${crypto.randomUUID()}.sqlite`);
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "graphcode-ma1-project-"));
  db = openDatabase(dbPath);
  migrate(db);
  repo = new GraphRepository(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(dbPath, { force: true });
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

function seedWorkflowGraph(): string {
  const project = repo.createProject({ id: "ma1-project", name: "MA-1", rootPath: projectRoot });
  repo.createNode({ id: "root", projectId: project.id, kind: "framework", name: "Root", agentStatus: "implemented" });
  repo.createNode({
    id: "module",
    projectId: project.id,
    kind: "module",
    name: "Module",
    parentId: "root",
    sourcePath: "src/module.ts",
    sourceStartLine: 1,
    sourceEndLine: 80,
    agentStatus: "planning"
  });
  repo.createNode({
    id: "producer",
    projectId: project.id,
    kind: "function",
    name: "producer",
    parentId: "module",
    sourcePath: "src/producer.ts",
    sourceStartLine: 1,
    sourceEndLine: 12,
    agentStatus: "planning"
  });
  repo.createNode({
    id: "consumer",
    projectId: project.id,
    kind: "function",
    name: "consumer",
    parentId: "module",
    sourcePath: "src/consumer.ts",
    sourceStartLine: 1,
    sourceEndLine: 14,
    agentStatus: "planning"
  });
  repo.createEdge({
    id: "consumer-calls-producer",
    projectId: project.id,
    kind: "calls",
    sourceNodeId: "consumer",
    targetNodeId: "producer",
    label: "shared interface"
  });
  return project.id;
}

function createMa1Preview() {
  const projectId = seedWorkflowGraph();
  return repo.previewCodingWorkflow(projectId, "module", [], {
    indexRevision: "index-1",
    workspaceRevision: "workspace-1",
    graphRevision: repo.currentGraphRevision(projectId),
    indexState: "complete",
    sourceHashes: { "src/producer.ts": "hash-producer", "src/consumer.ts": "hash-consumer" },
    capturedAt: "2026-07-18T12:00:00.000Z"
  });
}

describe("parallel multi-scale work-unit repository persistence", () => {
  it("persists and rehydrates the MA-2 topology preview and diagnostics", () => {
    const projectId = seedWorkflowGraph();
    const preview = repo.previewGraphPartitionedCodingWorkflow(projectId, "module", {
      indexRevision: "index-ma2",
      workspaceRevision: "workspace-ma2",
      graphRevision: repo.currentGraphRevision(projectId),
      indexState: "complete",
      sourceHashes: { "src/producer.ts": "hash-producer", "src/consumer.ts": "hash-consumer" },
      capturedAt: "2026-07-18T13:00:00.000Z"
    });

    expect(preview.orchestration).toEqual(
      expect.objectContaining({
        featureVersion: "ma2-partition-v1",
        partitioning: expect.objectContaining({ policyVersion: "deterministic-v1", relatedEdgeLocalityRatio: 1 })
      })
    );
    expect(preview.orchestration?.partitioning?.targetNodeIds.every((nodeId) => preview.orchestration!.workUnits.filter((unit) => unit.ownedNodeIds.includes(nodeId)).length === 1)).toBe(true);
    expect(preview.items).toHaveLength(preview.orchestration!.workUnits.length);
    expect(JSON.parse((db.prepare("SELECT orchestration_diagnostics_json AS diagnostics FROM coding_workflows WHERE id = ?").get(preview.id) as { diagnostics: string }).diagnostics)).toHaveProperty(
      "partitioning.inputHash"
    );
    const contextDiagnostics = {
      compilerVersion: "ma3-context-v1",
      omissions: [{ entityType: "source", entityId: "consumer", reason: "budget" }],
      tokenUsage: { estimatedInputTokens: 512 },
      provenance: { inputFingerprint: "context-fixture" }
    };
    const contextWorkUnitId = preview.orchestration!.workUnits[0].id;
    repo.saveCodingWorkUnitContextDiagnostics({
      projectId,
      workflowId: preview.id,
      workUnitId: contextWorkUnitId,
      compilerVersion: "ma3-context-v1",
      diagnostics: contextDiagnostics
    });
    expect(repo.getCodingWorkUnitContextDiagnostics(projectId, preview.id, contextWorkUnitId)).toEqual(contextDiagnostics);

    db.close();
    db = openDatabase(dbPath);
    migrate(db);
    repo = new GraphRepository(db);
    expect(repo.getCodingWorkflow(preview.id).orchestration).toEqual(preview.orchestration);
    expect(repo.getCodingWorkUnitContextDiagnostics(projectId, preview.id, contextWorkUnitId)).toEqual(contextDiagnostics);
  });

  it("validates and persists MA-6 partition overrides and execution limits", () => {
    const projectId = seedWorkflowGraph();
    const revision = {
      indexRevision: "index-ma6",
      workspaceRevision: "workspace-ma6",
      graphRevision: repo.currentGraphRevision(projectId),
      indexState: "complete" as const,
      sourceHashes: { "src/producer.ts": "hash-producer", "src/consumer.ts": "hash-consumer" },
      capturedAt: "2026-07-18T15:00:00.000Z"
    };
    const preview = repo.previewGraphPartitionedCodingWorkflow(projectId, "module", revision, [], {
      partitionConstraints: {
        keepTogetherNodeGroups: [["consumer", "producer"]],
        separateNodePairs: [],
        approvedIgnoredEdges: []
      },
      executionPolicy: { maximumConcurrency: 2, maxEstimatedCost: 0.75, currency: "USD" }
    });

    expect(preview.orchestration?.workUnits.some((unit) => unit.ownedNodeIds.includes("consumer") && unit.ownedNodeIds.includes("producer"))).toBe(true);
    expect(preview.orchestration).toMatchObject({
      partitionConstraints: { keepTogetherNodeGroups: [["consumer", "producer"]] },
      executionPolicy: { maximumConcurrency: 2, maxEstimatedCost: 0.75, currency: "USD" }
    });

    db.close();
    db = openDatabase(dbPath);
    migrate(db);
    repo = new GraphRepository(db);
    expect(repo.getCodingWorkflow(preview.id).orchestration).toMatchObject({
      partitionConstraints: { keepTogetherNodeGroups: [["consumer", "producer"]] },
      executionPolicy: { maximumConcurrency: 2, maxEstimatedCost: 0.75, currency: "USD" }
    });
  });

  it("persists explicit workflow and item cancellation across reopen", () => {
    const preview = createMa1Preview();
    repo.updateCodingWorkflowItem({ itemId: preview.items[0].id, status: "cancelled" });
    repo.updateCodingWorkflowStatus(preview.id, "cancelled");

    db.close();
    db = openDatabase(dbPath);
    migrate(db);
    repo = new GraphRepository(db);

    const cancelled = repo.getCodingWorkflow(preview.id);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.items[0].status).toBe("cancelled");
    expect(db.pragma("foreign_key_check")).toEqual([]);
  });

  it("round-trips ownership, dependencies, revisions, budgets, routing decisions, and contracts across reopen", () => {
    const preview = createMa1Preview();
    const orchestration = structuredClone(preview.orchestration!);
    const producer = orchestration.workUnits.find((unit) => unit.ownedNodeIds.includes("producer"))!;
    const consumer = orchestration.workUnits.find((unit) => unit.ownedNodeIds.includes("consumer"))!;
    orchestration.routingDecisions[0].assignment = {
      providerId: "fake",
      modelId: "ma4-small",
      maxConcurrency: 3,
      inputPricePerMillion: 0.25,
      outputPricePerMillion: 1,
      currency: "USD"
    };
    orchestration.routingDecisions[0].metrics = {
      actualInputTokens: 800,
      actualOutputTokens: 120,
      actualCost: 0.00032,
      latencyMs: 42,
      retryCount: 1,
      escalationCount: 0,
      integrationFailureCount: 0,
      acceptanceOutcome: "accepted",
      testOutcome: "passed"
    };
    orchestration.interfaceContracts.push({
      id: "contract-consumer-producer",
      workflowId: preview.id,
      edgeId: "consumer-calls-producer",
      edgeKind: "calls",
      producerWorkUnitId: producer.id,
      consumerWorkUnitId: consumer.id,
      direction: "producer_to_consumer",
      subjectNodeIds: ["producer", "consumer"],
      contractKind: "signature",
      baseline: {
        formatVersion: 1,
        summary: "Consumer calls producer.",
        normalizedValue: "producer():unknown",
        fingerprint: "contract-hash-1",
        metadata: { source: "fixture" }
      },
      proposed: null,
      status: "stable",
      evidence: [
        {
          path: "src/producer.ts",
          startLine: 1,
          endLine: 12,
          symbolId: "producer",
          origin: "source",
          fingerprint: "hash-producer"
        }
      ]
    });

    const stored = repo.replaceCodingWorkflowOrchestration(preview.id, orchestration);
    expect(stored.orchestration).toEqual(orchestration);
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM coding_work_unit_nodes").get()
    ).toEqual({ count: orchestration.workUnits.length });
    expect(db.prepare("SELECT COUNT(*) AS count FROM model_routing_decisions").get()).toEqual({ count: orchestration.workUnits.length });
    expect(
      db.prepare("SELECT provider_id, model_id FROM model_routing_decisions WHERE id = ?").get(orchestration.routingDecisions[0].id)
    ).toEqual({ provider_id: "fake", model_id: "ma4-small" });
    expect(db.prepare("SELECT COUNT(*) AS count FROM interface_contracts").get()).toEqual({ count: 1 });
    expect(db.pragma("foreign_key_check")).toEqual([]);

    db.close();
    db = openDatabase(dbPath);
    migrate(db);
    repo = new GraphRepository(db);
    const reopened = repo.getCodingWorkflow(preview.id);

    expect(reopened.items).toEqual(stored.items);
    expect(reopened.orchestration).toEqual(orchestration);
    expect(reopened.orchestration?.revision).toMatchObject({
      indexRevision: "index-1",
      workspaceRevision: "workspace-1",
      sourceHashes: { "src/producer.ts": "hash-producer", "src/consumer.ts": "hash-consumer" }
    });
  });

  it("persists MA-5 actual write sets and integration checks across reopen", () => {
    const preview = createMa1Preview();
    const item = preview.items[0];
    const actualWriteScopes = [{ path: "src/producer.ts", startLine: 2, endLine: 4, symbolId: "producer", permission: "edit" as const }];
    repo.updateCodingWorkflowItemIntegrationMetadata({ itemId: item.id, actualWriteScopes, proposalRevision: 1 });
    const checks = repo.replaceIntegrationChecks({
      workflowId: preview.id,
      layerIndex: item.layerIndex,
      checks: [
        { itemId: item.id, checkKind: "actual_write_set", status: "passed", diagnostics: { scopes: actualWriteScopes } },
        { itemId: null, checkKind: "combined_patch", status: "failed", diagnostics: { error: "fixture failure" } }
      ]
    });

    expect(checks.map((check) => [check.checkKind, check.status])).toEqual([
      ["actual_write_set", "passed"],
      ["combined_patch", "failed"]
    ]);
    expect(repo.getCodingWorkflow(preview.id).items[0]).toMatchObject({ actualWriteScopes, proposalRevision: 1 });

    db.close();
    db = openDatabase(dbPath);
    migrate(db);
    repo = new GraphRepository(db);
    const reopened = repo.getCodingWorkflow(preview.id);
    expect(reopened.integrationChecks).toHaveLength(2);
    expect(reopened.items[0]).toMatchObject({ actualWriteScopes, proposalRevision: 1 });
    expect(reopened.integrationChecks?.[1]).toMatchObject({ checkKind: "combined_patch", status: "failed", diagnostics: { error: "fixture failure" } });
  });

  it("rejects invalid ownership, dependencies, and boundary edges before replacing stored records", () => {
    const preview = createMa1Preview();
    const original = preview.orchestration!;

    const duplicateOwnership = structuredClone(original);
    duplicateOwnership.workUnits[1].ownedNodeIds = [...duplicateOwnership.workUnits[0].ownedNodeIds];
    expect(() => repo.replaceCodingWorkflowOrchestration(preview.id, duplicateOwnership)).toThrow(/Duplicate ownership/);

    const danglingDependency = structuredClone(original);
    danglingDependency.workUnits[0].dependencyWorkUnitIds = ["missing-unit"];
    expect(() => repo.replaceCodingWorkflowOrchestration(preview.id, danglingDependency)).toThrow(/Dangling dependency/);

    const invalidBoundary = structuredClone(original);
    invalidBoundary.boundaryEdges[0].sourceNodeId = "outside-a";
    invalidBoundary.boundaryEdges[0].targetNodeId = "outside-b";
    expect(() => repo.replaceCodingWorkflowOrchestration(preview.id, invalidBoundary)).toThrow(/must cross owned\/non-owned nodes/);

    expect(repo.getCodingWorkflow(preview.id).orchestration).toEqual(original);
  });

  it("migrates legacy workflow rows without data loss and leaves legacy responses unchanged", () => {
    const projectId = seedWorkflowGraph();
    const run = repo.createAgentRun({ projectId, agentKind: "coding", codingMode: "medium", targetNodeId: "producer", status: "succeeded" });
    const proposalId = repo.storeCodeProposal({
      projectId,
      agentRunId: run.id,
      targetNodeId: "producer",
      diff: "diff --git a/src/producer.ts b/src/producer.ts"
    });
    db.pragma("foreign_keys = OFF");
    db.exec(`
      DROP TABLE integration_checks;
      DROP TABLE interface_contracts;
      DROP TABLE model_routing_decisions;
      DROP TABLE coding_work_unit_dependencies;
      DROP TABLE coding_work_unit_edges;
      DROP TABLE coding_work_unit_nodes;
      DROP TABLE coding_workflow_items;
      DROP TABLE coding_workflows;
      CREATE TABLE coding_workflows (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        scope_node_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'preview' CHECK (status IN ('preview', 'running', 'blocked', 'succeeded', 'failed')),
        current_layer INTEGER NOT NULL DEFAULT 0,
        summary TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE coding_workflow_items (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL REFERENCES coding_workflows(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        node_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
        layer_index INTEGER NOT NULL DEFAULT 0,
        recommended_mode TEXT NOT NULL CHECK (recommended_mode IN ('small', 'medium', 'large')),
        selected_mode TEXT NOT NULL CHECK (selected_mode IN ('small', 'medium', 'large')),
        mode_reason TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'proposed', 'applied', 'skipped', 'failed', 'blocked')),
        conflict_group TEXT NOT NULL DEFAULT '',
        agent_run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
        proposal_id TEXT REFERENCES code_proposals(id) ON DELETE SET NULL,
        applied_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(workflow_id, node_id)
      );
    `);
    db.prepare(
      "INSERT INTO coding_workflows (id, project_id, scope_node_id, status, current_layer, summary) VALUES ('legacy-workflow', ?, 'module', 'running', 0, 'legacy summary')"
    ).run(projectId);
    db.prepare(`
      INSERT INTO coding_workflow_items (
        id, workflow_id, project_id, node_id, layer_index, recommended_mode,
        selected_mode, mode_reason, status, conflict_group, agent_run_id, proposal_id
      ) VALUES ('legacy-item', 'legacy-workflow', ?, 'producer', 0, 'small', 'medium', 'legacy reason', 'proposed', 'legacy-conflict', ?, ?)
    `).run(projectId, run.id, proposalId);
    db.pragma("foreign_keys = ON");

    migrate(db);
    repo = new GraphRepository(db);
    const workflow = repo.getCodingWorkflow("legacy-workflow");
    const migratedRow = db.prepare("SELECT objective, base_graph_revision, context_budget_json FROM coding_workflow_items WHERE id = 'legacy-item'").get();
    const routingColumns = new Set(
      (db.pragma("table_info(model_routing_decisions)") as Array<{ name: string }>).map((column) => column.name)
    );
    const tables = new Set(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => (row as { name: string }).name)
    );
    const migratedWorkflowSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'coding_workflows'").get() as { sql: string }).sql;
    const migratedItemSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'coding_workflow_items'").get() as { sql: string }).sql;

    expect(workflow).toMatchObject({ id: "legacy-workflow", summary: "legacy summary" });
    expect(workflow).not.toHaveProperty("orchestration");
    expect(workflow.items[0]).toMatchObject({
      id: "legacy-item",
      nodeId: "producer",
      selectedMode: "medium",
      modeReason: "legacy reason",
      status: "proposed",
      agentRunId: run.id,
      proposalId
    });
    expect(repo.getCodeProposal(proposalId).diff).toContain("src/producer.ts");
    expect(migratedRow).toEqual({ objective: "", base_graph_revision: 0, context_budget_json: "{}" });
    expect([...routingColumns]).toEqual(expect.arrayContaining(["provider_id", "model_id", "assignment_json", "metrics_json"]));
    expect(migratedWorkflowSql).toContain("'cancelled'");
    expect(migratedItemSql).toContain("'cancelled'");
    expect([...tables]).toEqual(
      expect.arrayContaining([
        "coding_work_unit_nodes",
        "coding_work_unit_edges",
        "coding_work_unit_dependencies",
        "interface_contracts",
        "model_routing_decisions",
        "integration_checks"
      ])
    );
    expect(db.pragma("foreign_key_check")).toEqual([]);
    expect(repo.updateCodingWorkflowItem({ itemId: "legacy-item", status: "cancelled" }).status).toBe("cancelled");
    expect(repo.updateCodingWorkflowStatus("legacy-workflow", "cancelled").status).toBe("cancelled");
  });
});
