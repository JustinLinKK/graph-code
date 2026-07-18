import crypto from "node:crypto";
import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { CodingWorkflowOrchestration, ContractSnapshot, SourceWriteScope } from "@graphcode/graph-model";
import {
  parseUnifiedDiff,
  readCurrentSourceHashes,
  runIntegrationGate,
  validateCombinedPatchInTemporaryWorkspace,
  type IntegrationProposal
} from "./integration-runner";

function sha1(value: string): string {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function editScope(filePath: string, startLine = 1, endLine = 20): SourceWriteScope {
  return { path: filePath, startLine, endLine, symbolId: null, permission: "edit" };
}

function editDiff(filePath: string, line: number, before: string, after: string): string {
  return [
    `diff --git a/${filePath} b/${filePath}`,
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -${line},1 +${line},1 @@`,
    `-${before}`,
    `+${after}`
  ].join("\n");
}

function orchestration(input: {
  scopes?: Record<string, SourceWriteScope[]>;
  contracts?: CodingWorkflowOrchestration["interfaceContracts"];
  boundaryEdges?: CodingWorkflowOrchestration["boundaryEdges"];
} = {}): CodingWorkflowOrchestration {
  const sourceHashes = { "src/a.ts": sha1("export const a = 1;\n"), "src/b.ts": sha1("export const b = 1;\n"), "src/shared.ts": sha1("one\ntwo\nthree\n") };
  const revision = {
    indexRevision: "index-1",
    workspaceRevision: "workspace-1",
    graphRevision: 1,
    sourceHashes,
    contextCompilerVersion: "compiler-1",
    routingFeatureVersion: "router-1",
    capturedAt: "2026-07-18T00:00:00.000Z"
  };
  const units = [
    { id: "a", path: "src/a.ts", node: "node-a" },
    { id: "b", path: "src/b.ts", node: "node-b" }
  ].map(({ id, path: filePath, node }) => ({
    id,
    workflowId: "workflow",
    projectId: "project",
    parentWorkUnitId: null,
    layerIndex: 0,
    title: id.toUpperCase(),
    objective: `Update ${id}`,
    ownedNodeIds: [node],
    readHaloNodeIds: [],
    boundaryEdgeIds: input.boundaryEdges?.map((edge) => edge.id) ?? [],
    dependencyWorkUnitIds: [],
    coordinationWorkUnitIds: [],
    plannedWriteScopes: input.scopes?.[id] ?? [editScope(filePath)],
    expectedOutputs: [],
    recommendedScale: "small" as const,
    selectedScale: "small" as const,
    routingDecisionId: `route-${id}`,
    contextBudget: { maxInputTokens: 1000, maxSourceTokens: 500, maxGraphTokens: 200, maxContractTokens: 100, maxFiles: 3, maxNodes: 4, maxEdges: 4 },
    baseRevision: revision,
    status: "proposed" as const
  }));
  const features = {
    ownedSymbolCount: 1,
    estimatedSourceTokens: 100,
    controlFlowComplexity: 1,
    cutEdgeCount: 0,
    cutEdgeWeight: 0,
    crossFileRelationshipCount: 0,
    crossPackageRelationshipCount: 0,
    upstreamWorkUnitCount: 0,
    downstreamWorkUnitCount: 0,
    interfaceChangeRequested: false,
    publicApiInvolvement: false,
    sharedStateInvolvement: false,
    testAvailability: "available" as const,
    blastRadius: "local" as const,
    languageConfidence: 1,
    indexState: "complete" as const,
    taskAmbiguity: "low" as const,
    planningConfidence: 1,
    risks: []
  };
  return {
    schemaVersion: 1,
    featureVersion: "test",
    workflowId: "workflow",
    projectId: "project",
    revision,
    workUnits: units,
    boundaryEdges: input.boundaryEdges ?? [],
    interfaceContracts: input.contracts ?? [],
    routingDecisions: units.map((unit) => ({
      id: unit.routingDecisionId,
      workUnitId: unit.id,
      recommendedScale: "small",
      selectedScale: "small",
      featureVersion: "router-1",
      features,
      reasons: ["test"],
      estimatedInputTokens: 100,
      estimatedOutputTokens: 20,
      estimatedCost: null,
      override: null
    })),
    warnings: []
  };
}

function proposals(): IntegrationProposal[] {
  return [
    { proposalId: "proposal-a", workUnitId: "a", diff: editDiff("src/a.ts", 1, "export const a = 1;", "export const a = 2;") },
    { proposalId: "proposal-b", workUnitId: "b", diff: editDiff("src/b.ts", 1, "export const b = 1;", "export const b = 2;") }
  ];
}

describe("MA-5 integration runner", () => {
  it("extracts edit/create/delete/rename write sets and rejects escaping paths", () => {
    const parsed = parseUnifiedDiff([
      editDiff("src/a.ts", 3, "old", "new"),
      "diff --git a/src/new.ts b/src/new.ts",
      "--- /dev/null",
      "+++ b/src/new.ts",
      "@@ -0,0 +1,1 @@",
      "+new",
      "diff --git a/src/old.ts b/src/old.ts",
      "--- a/src/old.ts",
      "+++ /dev/null",
      "@@ -1,1 +0,0 @@",
      "-old",
      "diff --git a/src/from.ts b/src/to.ts",
      "similarity index 100%",
      "rename from src/from.ts",
      "rename to src/to.ts"
    ].join("\n"));

    expect(parsed.files.map((file) => file.operation)).toEqual(["edit", "create", "delete", "rename"]);
    expect(parsed.actualWriteScopes).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "src/a.ts", startLine: 3, endLine: 3, permission: "edit" }),
      expect.objectContaining({ path: "src/new.ts", permission: "create" }),
      expect.objectContaining({ path: "src/old.ts", permission: "delete" }),
      expect.objectContaining({ path: "src/from.ts", permission: "rename" }),
      expect.objectContaining({ path: "src/to.ts", permission: "rename" })
    ]));
    expect(() => parseUnifiedDiff("--- a/src/a.ts\n+++ b/../escape.ts\n@@ -1 +1 @@\n-a\n+b")).toThrow(/normalized workspace-relative/i);
  });

  it("combines compatible independent proposals and passes without an integration-model call", async () => {
    const graph = orchestration();
    const validateCombinedPatch = vi.fn(async () => ({ passed: true, diagnostics: ["clean"], commandResults: [{ command: "test", passed: true, output: "ok" }] }));
    const invokeIntegrationAgent = vi.fn(async () => "unused");

    const result = await runIntegrationGate({
      orchestration: graph,
      layerIndex: 0,
      proposals: proposals(),
      currentSourceHashes: graph.revision.sourceHashes,
      validationCommands: ["test"],
      validateCombinedPatch,
      invokeIntegrationAgent
    });

    expect(result).toMatchObject({ passed: true, applicable: true, integrationAgentInvoked: false });
    expect(result.combinedDiff).toContain("src/a.ts");
    expect(result.combinedDiff).toContain("src/b.ts");
    expect(validateCombinedPatch).toHaveBeenCalledOnce();
    expect(invokeIntegrationAgent).not.toHaveBeenCalled();
  });

  it("combines disjoint function edits in one file without treating them as an overlap", async () => {
    const graph = orchestration({
      scopes: {
        a: [editScope("src/shared.ts", 1, 1)],
        b: [editScope("src/shared.ts", 3, 3)]
      }
    });
    const validateCombinedPatch = vi.fn(async () => ({ passed: true, diagnostics: ["disjoint same-file edits"] }));

    const result = await runIntegrationGate({
      orchestration: graph,
      layerIndex: 0,
      proposals: [
        { proposalId: "proposal-a", workUnitId: "a", diff: editDiff("src/shared.ts", 1, "one", "one-a") },
        { proposalId: "proposal-b", workUnitId: "b", diff: editDiff("src/shared.ts", 3, "three", "three-b") }
      ],
      currentSourceHashes: graph.revision.sourceHashes,
      validateCombinedPatch
    });

    expect(result).toMatchObject({ passed: true, applicable: true, integrationAgentInvoked: false });
    expect(result.checks).toContainEqual(expect.objectContaining({ kind: "overlap_conflict", status: "passed" }));
    expect(validateCombinedPatch).toHaveBeenCalledOnce();
  });

  it("reconciles a matching cross-package import and re-export contract update", async () => {
    const baseline: ContractSnapshot = {
      formatVersion: 1,
      summary: "public re-export",
      normalizedValue: "export { thing }",
      fingerprint: "export-v1",
      metadata: { package: "core" }
    };
    const boundaryEdges = [{ id: "package-import", sourceNodeId: "node-a", targetNodeId: "node-b", kind: "imports" as const }];
    const contracts = [{
      id: "package-contract",
      workflowId: "workflow",
      edgeId: "package-import",
      edgeKind: "imports" as const,
      producerWorkUnitId: "a",
      consumerWorkUnitId: "b",
      direction: "producer_to_consumer" as const,
      subjectNodeIds: ["node-a", "node-b"],
      contractKind: "signature" as const,
      baseline,
      proposed: null,
      status: "stable" as const,
      evidence: []
    }];
    const producerPath = "packages/core/src/index.ts";
    const consumerPath = "packages/app/src/consumer.ts";
    const graph = orchestration({
      scopes: { a: [editScope(producerPath, 1, 1)], b: [editScope(consumerPath, 1, 1)] },
      boundaryEdges,
      contracts
    });
    graph.revision.sourceHashes[producerPath] = sha1("export { thing } from './thing';\n");
    graph.revision.sourceHashes[consumerPath] = sha1("import { thing } from '@repo/core';\n");
    const changed = { ...baseline, normalizedValue: "export { renamedThing }", fingerprint: "export-v2" };

    const result = await runIntegrationGate({
      orchestration: graph,
      layerIndex: 0,
      proposals: [
        {
          proposalId: "proposal-a",
          workUnitId: "a",
          diff: editDiff(producerPath, 1, "export { thing } from './thing';", "export { renamedThing } from './thing';"),
          contractUpdates: [{ contractId: "package-contract", proposed: changed, rationale: "Rename the public re-export." }]
        },
        {
          proposalId: "proposal-b",
          workUnitId: "b",
          diff: editDiff(consumerPath, 1, "import { thing } from '@repo/core';", "import { renamedThing } from '@repo/core';"),
          contractUpdates: [{ contractId: "package-contract", proposed: changed, rationale: "Consume the renamed re-export." }]
        }
      ],
      currentSourceHashes: graph.revision.sourceHashes,
      validateCombinedPatch: vi.fn(async () => ({ passed: true, diagnostics: ["cross-package import resolved"] }))
    });

    expect(result).toMatchObject({ passed: true, applicable: true, integrationAgentInvoked: false });
    expect(result.contractReconciliation.contracts[0]).toMatchObject({ status: "accepted", proposed: changed });
  });

  it("makes unauthorized, overlapping, and stale proposals inapplicable", async () => {
    const graph = orchestration({ scopes: { a: [editScope("src/shared.ts", 1, 2)], b: [editScope("src/shared.ts", 2, 3)] } });
    graph.workUnits[0].baseRevision.sourceHashes["src/shared.ts"] = sha1("one\ntwo\nthree\n");
    const invalidProposals = [
      { proposalId: "proposal-a", workUnitId: "a", diff: editDiff("src/shared.ts", 2, "two", "two-a") },
      { proposalId: "proposal-b", workUnitId: "b", diff: editDiff("src/shared.ts", 2, "two", "two-b") },
      { proposalId: "proposal-extra", workUnitId: "a", diff: editDiff("src/forbidden.ts", 1, "x", "y") }
    ];

    const result = await runIntegrationGate({
      orchestration: graph,
      layerIndex: 0,
      proposals: invalidProposals,
      currentSourceHashes: { ...graph.revision.sourceHashes, "src/shared.ts": "stale-now", "src/forbidden.ts": "existing" },
      validateCombinedPatch: vi.fn(async () => ({ passed: true, diagnostics: [] }))
    });

    expect(result.applicable).toBe(false);
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "write_authorization", status: "failed" }),
      expect.objectContaining({ kind: "stale_revision", status: "failed" }),
      expect.objectContaining({ kind: "overlap_conflict", status: "failed" }),
      expect.objectContaining({ kind: "combined_patch", status: "blocked" })
    ]));
  });

  it("blocks unacknowledged contract changes and gives fallback only bounded child and contract context", async () => {
    const baseline: ContractSnapshot = { formatVersion: 1, summary: "signature", normalizedValue: "run(string)", fingerprint: "v1", metadata: {} };
    const boundaryEdges = [{ id: "edge", sourceNodeId: "node-a", targetNodeId: "node-b", kind: "calls" as const }];
    const contracts = [{
      id: "contract",
      workflowId: "workflow",
      edgeId: "edge",
      edgeKind: "calls" as const,
      producerWorkUnitId: "a",
      consumerWorkUnitId: "b",
      direction: "producer_to_consumer" as const,
      subjectNodeIds: ["node-a", "node-b"],
      contractKind: "signature" as const,
      baseline,
      proposed: null,
      status: "stable" as const,
      evidence: []
    }];
    const graph = orchestration({ boundaryEdges, contracts });
    const changed = { ...baseline, normalizedValue: "run(number)", fingerprint: "v2" };
    const integrationAgent = vi.fn(async ({ context }: Parameters<NonNullable<Parameters<typeof runIntegrationGate>[0]["invokeIntegrationAgent"]>>[0]) => {
      expect(context).not.toHaveProperty("graph");
      expect(context).not.toHaveProperty("repository");
      expect(context.children).toHaveLength(2);
      expect(context.contracts).toHaveLength(1);
      expect(context.authority).toBe("propose_reconciliation_only");
      return "bounded reconciliation proposal";
    });
    const changedProposals = proposals();
    changedProposals[0].contractUpdates = [{ contractId: "contract", proposed: changed, rationale: "Change input." }];

    const result = await runIntegrationGate({
      orchestration: graph,
      layerIndex: 0,
      proposals: changedProposals,
      currentSourceHashes: graph.revision.sourceHashes,
      validateCombinedPatch: vi.fn(async () => ({ passed: true, diagnostics: [] })),
      invokeIntegrationAgent: integrationAgent
    });

    expect(result.applicable).toBe(false);
    expect(result.contractReconciliation.blockedWorkUnitIds).toContain("b");
    expect(result.integrationAgentInvoked).toBe(true);
    expect(integrationAgent).toHaveBeenCalledOnce();
  });

  it("accepts a clean producer layer while keeping a contract-breaking consumer blocked", async () => {
    const baseline: ContractSnapshot = { formatVersion: 1, summary: "signature", normalizedValue: "run(string)", fingerprint: "v1", metadata: {} };
    const boundaryEdges = [{ id: "edge", sourceNodeId: "node-a", targetNodeId: "node-b", kind: "calls" as const }];
    const contracts = [{
      id: "contract",
      workflowId: "workflow",
      edgeId: "edge",
      edgeKind: "calls" as const,
      producerWorkUnitId: "a",
      consumerWorkUnitId: "b",
      direction: "producer_to_consumer" as const,
      subjectNodeIds: ["node-a", "node-b"],
      contractKind: "signature" as const,
      baseline,
      proposed: null,
      status: "stable" as const,
      evidence: []
    }];
    const graph = orchestration({ boundaryEdges, contracts });
    graph.workUnits[1].layerIndex = 1;
    graph.workUnits[1].dependencyWorkUnitIds = ["a"];
    const producerProposal = proposals()[0];
    producerProposal.contractUpdates = [{
      contractId: "contract",
      proposed: { ...baseline, normalizedValue: "run(number)", fingerprint: "v2" },
      rationale: "Producer changes the input."
    }];
    const invokeIntegrationAgent = vi.fn(async () => "unused");

    const result = await runIntegrationGate({
      orchestration: graph,
      layerIndex: 0,
      proposals: [producerProposal],
      currentSourceHashes: graph.revision.sourceHashes,
      validateCombinedPatch: vi.fn(async () => ({ passed: true, diagnostics: ["clean"] })),
      invokeIntegrationAgent
    });

    expect(result.passed).toBe(true);
    expect(result.contractReconciliation.passed).toBe(false);
    expect(result.contractReconciliation.blockedWorkUnitIds).toEqual(["b"]);
    expect(result.checks.find((check) => check.kind === "interface_contract")?.status).toBe("passed");
    expect(invokeIntegrationAgent).not.toHaveBeenCalled();
  });

  it("applies and checks a combined patch only inside a temporary workspace", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "graphcode-ma5-test-"));
    try {
      await fsp.mkdir(path.join(root, "src"), { recursive: true });
      await fsp.writeFile(path.join(root, "src/a.ts"), "export const a = 1;\n", "utf8");
      const diff = `${editDiff("src/a.ts", 1, "export const a = 1;", "export const a = 2;")}\n`;
      const hashes = await readCurrentSourceHashes(root, ["src/a.ts"]);
      expect(hashes["src/a.ts"]).toBe(sha1("export const a = 1;\n"));

      const result = await validateCombinedPatchInTemporaryWorkspace({
        workspaceRoot: root,
        combinedDiff: diff,
        commands: ["node -e \"const fs=require('fs');if(!fs.readFileSync('src/a.ts','utf8').includes('= 2'))process.exit(1)\""],
        timeoutMs: 10000
      });

      expect(result.passed).toBe(true);
      expect(await fsp.readFile(path.join(root, "src/a.ts"), "utf8")).toBe("export const a = 1;\n");
    } finally {
      await fsp.rm(root, { recursive: true, force: true });
    }
  }, 15000);
});
