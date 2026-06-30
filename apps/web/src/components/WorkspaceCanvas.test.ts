import type { CanvasGraph, GraphEdge, GraphNode, GraphNodeReuse, Project } from "@graphcode/graph-model";
import { describe, expect, it } from "vitest";
import { buildEdgeRenderSummaries, measureNodeCardSize } from "./WorkspaceCanvas";

describe("WorkspaceCanvas node card sizing", () => {
  it("expands reused tagged cards enough for wrapped chips", () => {
    const objectNode = node({
      id: "object-node-reuse",
      kind: "object",
      name: "GraphNodeReuse",
      summary: "Canonical node placement reused inside multiple canvas scopes.",
      size: { width: 260, height: 136 },
      tags: [
        { id: "tag-reusable", projectId: "project", name: "reusable", color: "#0f766e", createdAt: "now", updatedAt: "now" },
        { id: "tag-canvas", projectId: "project", name: "canvas", color: "#0891b2", createdAt: "now", updatedAt: "now" }
      ]
    });
    const reuse: GraphNodeReuse = {
      id: "reuse-object",
      projectId: "project",
      scopeNodeId: "module-web",
      nodeId: objectNode.id,
      label: "Reusable workflow placement DTO",
      context: "",
      createdAt: "now",
      updatedAt: "now"
    };

    const withoutReuse = measureNodeCardSize(objectNode);
    const withReuse = measureNodeCardSize(objectNode, reuse);

    expect(withReuse.height).toBeGreaterThan(withoutReuse.height);
    expect(withReuse.height).toBeGreaterThanOrEqual(190);
    expect(withReuse.width).toBeGreaterThanOrEqual(260);
  });

  it("does not cap taller cards below their measured content", () => {
    const busyNode = node({
      id: "function-normalize",
      kind: "function",
      name: "normalizeTagName",
      summary: "Tag normalization helper with enough summary text to occupy several visible text rows in the graph card.",
      size: { width: 180, height: 92 },
      tags: [
        { id: "tag-shared", projectId: "project", name: "shared tag utility", color: "#0f766e", createdAt: "now", updatedAt: "now" },
        { id: "tag-parser", projectId: "project", name: "parser workflow", color: "#2563eb", createdAt: "now", updatedAt: "now" }
      ]
    });

    const measured = measureNodeCardSize(busyNode, {
      id: "reuse-function",
      projectId: "project",
      scopeNodeId: "module-web",
      nodeId: busyNode.id,
      label: "Shared tag utility",
      context: "",
      createdAt: "now",
      updatedAt: "now"
    });

    expect(measured.height).toBeGreaterThan(180);
  });

  it("reserves a second chip row for reused tag DTO cards", () => {
    const tagNode = node({
      id: "object-graph-tag",
      kind: "object",
      name: "GraphTag",
      summary: "Reusable label DTO",
      size: { width: 260, height: 136 },
      tags: [
        { id: "tag-taggable", projectId: "project", name: "taggable", color: "#be185d", createdAt: "now", updatedAt: "now" },
        { id: "tag-shared", projectId: "project", name: "shared", color: "#7c3aed", createdAt: "now", updatedAt: "now" }
      ]
    });

    const measured = measureNodeCardSize(tagNode, {
      id: "reuse-graph-tag",
      projectId: "project",
      scopeNodeId: "module-web",
      nodeId: tagNode.id,
      label: "Reused tag DTO",
      context: "",
      createdAt: "now",
      updatedAt: "now"
    });

    expect(measured.height).toBeGreaterThanOrEqual(180);
  });
});

describe("WorkspaceCanvas edge rendering metadata", () => {
  it("keeps long edge labels available for wrapped rendering and titles", () => {
    const label = "selection payload with repository context and a longer branch condition";
    const summary = buildEdgeRenderSummaries(canvas([edge({ id: "edge-long", label })]), null, "light")[0];

    expect(summary.label).toBe(label);
    expect(summary.title).toBe(label);
  });

  it("separates parallel edges with deterministic lane offsets", () => {
    const summaries = buildEdgeRenderSummaries(
      canvas([
        edge({ id: "edge-a", label: "a" }),
        edge({ id: "edge-b", label: "b" }),
        edge({ id: "edge-c", label: "c" })
      ]),
      null,
      "light"
    );

    expect(summaries.map((summary) => summary.offset)).toEqual([-34, 0, 34]);
  });

  it("keeps single edges on the center lane", () => {
    const summary = buildEdgeRenderSummaries(canvas([edge({ id: "edge-single", label: "single" })]), null, "light")[0];

    expect(summary.offset).toBe(0);
  });
});

const project: Project = {
  id: "project",
  name: "Project",
  rootPath: "/tmp/project",
  description: "",
  scanningInstructions: "",
  createdAt: "now",
  updatedAt: "now"
};

function node(input: Partial<GraphNode> & Pick<GraphNode, "id" | "kind" | "name">): GraphNode {
  return {
    projectId: "project",
    summary: "",
    code: { context: "", directory: null, startLine: null, endLine: null, language: "typescript" },
    parentId: null,
    attachedToId: null,
	    customTypeId: null,
	    source: { path: null, startLine: null, endLine: null },
	    execution: {
	      testScriptDirectory: null,
	      virtualEnvironment: null,
	      workingDirectory: null,
	      setupCommand: null,
	      testCommand: null
	    },
	    position: { x: 0, y: 0 },
    size: { width: 224, height: 120 },
    childCount: 0,
    hasChildren: false,
    agentStatus: "implemented",
    gitStatus: null,
    tags: [],
    createdAt: "now",
    updatedAt: "now",
	    ...input
	  };
}

function edge(input: Partial<GraphEdge> & Pick<GraphEdge, "id" | "label">): GraphEdge {
  return {
    projectId: project.id,
    kind: "flows",
    sourceNodeId: "source",
    targetNodeId: "target",
    codeContext: "",
    color: "#2563eb",
    animated: false,
    pointingEnabled: true,
    pointingDirection: "source_to_target",
    agentStatus: "none",
    gitStatus: null,
    tags: [],
    createdAt: "now",
    ...input
  };
}

function canvas(edges: GraphEdge[]): CanvasGraph {
  return {
    project,
    rootNodeId: "source",
    scopeNodeId: "source",
    scopeLabel: "Source",
    nodes: [
      node({ id: "source", kind: "process", name: "Source" }),
      node({ id: "target", kind: "process", name: "Target" })
    ],
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
