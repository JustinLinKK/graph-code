import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { legacyWorkflowFixtureSchema, type LegacyWorkflowFixture } from "@graphcode/agent-runtime";
import { openDatabase, type GraphDatabase } from "./connection";
import { GraphRepository } from "./repository";
import { migrate } from "./schema";

const fixtureDirectory = fileURLToPath(new URL("../../../../tests/fixtures/parallel-multiscale-agent/", import.meta.url));
let db: GraphDatabase;
let repo: GraphRepository;
let dbPath: string;
let projectRoots: string[];

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `graphcode-workflow-baseline-${crypto.randomUUID()}.sqlite`);
  projectRoots = [];
  db = openDatabase(dbPath);
  migrate(db);
  repo = new GraphRepository(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(dbPath, { force: true });
  for (const projectRoot of projectRoots) {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

function loadFixture(behavior: LegacyWorkflowFixture["behavior"]): LegacyWorkflowFixture {
  const fileName = fs
    .readdirSync(fixtureDirectory)
    .find((name) => name.endsWith(".json") && JSON.parse(fs.readFileSync(path.join(fixtureDirectory, name), "utf8")).behavior === behavior);
  if (!fileName) {
    throw new Error(`Missing workflow fixture: ${behavior}`);
  }
  return legacyWorkflowFixtureSchema.parse(JSON.parse(fs.readFileSync(path.join(fixtureDirectory, fileName), "utf8")));
}

function insertFixture(fixture: LegacyWorkflowFixture): string {
  const projectId = `baseline-${fixture.id}`;
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${fixture.id}-`));
  projectRoots.push(projectRoot);
  repo.createProject({ id: projectId, name: fixture.id, rootPath: projectRoot });
  for (const node of fixture.nodes) {
    repo.createNode({
      id: node.id,
      projectId,
      kind: node.kind,
      name: node.name,
      summary: node.summary,
      parentId: node.parentId,
      attachedToId: node.attachedToId,
      sourcePath: node.source.path,
      sourceStartLine: node.source.startLine,
      sourceEndLine: node.source.endLine,
      agentStatus: node.agentStatus
    });
  }
  for (const edge of fixture.edges) {
    repo.createEdge({
      id: edge.id,
      projectId,
      kind: edge.kind,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      label: edge.label
    });
  }
  return projectId;
}

describe("legacy coding workflow behavioral baseline", () => {
  it("shows that hierarchy-only layers ignore a relationship dependency", () => {
    const fixture = loadFixture("shared_interface");
    const projectId = insertFixture(fixture);

    const preview = repo.previewCodingWorkflow(projectId, fixture.scopeNodeId);
    const producer = preview.items.find((item) => item.nodeId === "producer")!;
    const consumer = preview.items.find((item) => item.nodeId === "consumer")!;

    expect(producer.layerIndex).toBe(0);
    expect(consumer.layerIndex).toBe(0);
    expect(fixture.edges).toContainEqual(expect.objectContaining({ sourceNodeId: "consumer", targetNodeId: "producer", kind: "calls" }));
    expect(producer.recommendedMode).toBe("large");
    expect(consumer.recommendedMode).toBe("large");
    expect(producer.modeReason).toMatch(/crosses scope, file, or top-level boundaries/);
  });

  it("shows that same-file functions can enter the same legacy parallel layer under different conflict groups", () => {
    const fixture = loadFixture("same_file_functions");
    const projectId = insertFixture(fixture);

    const preview = repo.previewCodingWorkflow(projectId, fixture.scopeNodeId);
    const first = preview.items.find((item) => item.nodeId === "shared-first")!;
    const second = preview.items.find((item) => item.nodeId === "shared-second")!;

    expect(first.layerIndex).toBe(0);
    expect(second.layerIndex).toBe(0);
    expect(first.conflictGroup).not.toBe(second.conflictGroup);
    expect(first.conflictGroup).toMatch(/^src\/shared\.ts:/);
    expect(second.conflictGroup).toMatch(/^src\/shared\.ts:/);
    expect(first.recommendedMode).toBe("small");
    expect(second.recommendedMode).toBe("small");
  });

  it("captures the existing leaf-first parent integration and tier distribution", () => {
    const fixture = loadFixture("parent_integration");
    const projectId = insertFixture(fixture);

    const preview = repo.previewCodingWorkflow(projectId, fixture.scopeNodeId);
    const parent = preview.items.find((item) => item.nodeId === "pipeline-module")!;
    const children = preview.items.filter((item) => item.nodeId === "parse-leaf" || item.nodeId === "format-leaf");

    expect(children).toHaveLength(2);
    expect(children.every((item) => item.layerIndex === 0)).toBe(true);
    expect(parent.layerIndex).toBe(1);
    expect(parent.recommendedMode).toBe("medium");
    expect(children.every((item) => item.recommendedMode === "large")).toBe(true);
  });
});
