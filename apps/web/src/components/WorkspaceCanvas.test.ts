import type { CanvasGraph, GraphEdge, GraphNode, GraphNodeReuse, Project } from "@graphcode/graph-model";
import { describe, expect, it } from "vitest";
import { moduleAgentBoundaryClass } from "./GraphNodeCard";
import { buildEdgeRenderSummaries, chooseEdgeLabelAnchor, measureEdgeLabelSize, measureNodeCardSize } from "./WorkspaceCanvas";

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

describe("GraphNodeCard agent module boundaries", () => {
  it("maps active module agent statuses to visible boundary classes", () => {
    expect(moduleAgentBoundaryClass(node({ id: "module-plan", kind: "module", name: "Plan", agentStatus: "planning" }))).toBe("agent-boundary-planning");
    expect(moduleAgentBoundaryClass(node({ id: "module-coded", kind: "module", name: "Code", agentStatus: "coded" }))).toBe("agent-boundary-coded");
    expect(moduleAgentBoundaryClass(node({ id: "module-reviewed", kind: "module", name: "Review", agentStatus: "reviewed" }))).toBe("agent-boundary-review");
    expect(moduleAgentBoundaryClass(node({ id: "module-bugged", kind: "module", name: "Bug", agentStatus: "bugged" }))).toBe("agent-boundary-review");
  });

  it("hides the status boundary for implemented modules and non-module nodes", () => {
    expect(moduleAgentBoundaryClass(node({ id: "module-implemented", kind: "module", name: "Done", agentStatus: "implemented" }))).toBe("");
    expect(moduleAgentBoundaryClass(node({ id: "function-plan", kind: "function", name: "Plan", agentStatus: "planning" }))).toBe("");
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

  it("places labels in the clear gap between separated cards", () => {
    const sourceRect = { x: 0, y: 0, width: 220, height: 120 };
    const targetRect = { x: 430, y: 0, width: 220, height: 120 };
    const labelSize = measureEdgeLabelSize("clear label");
    const anchor = chooseEdgeLabelAnchor({
      sourceRect,
      targetRect,
      blockingRects: [sourceRect, targetRect],
      labelSize,
      laneOffset: 0
    });

    expect(anchor).not.toBeNull();
    expect(overlapsAny(labelRect(anchor!, labelSize), [sourceRect, targetRect])).toBe(false);
    expect(anchor!.x).toBeGreaterThan(sourceRect.x + sourceRect.width);
    expect(anchor!.x).toBeLessThan(targetRect.x);
  });

  it("moves labels outside cramped card gaps instead of overlapping blocks", () => {
    const sourceRect = { x: 0, y: 0, width: 220, height: 120 };
    const targetRect = { x: 250, y: 0, width: 220, height: 120 };
    const labelSize = measureEdgeLabelSize("branch condition label");
    const anchor = chooseEdgeLabelAnchor({
      sourceRect,
      targetRect,
      blockingRects: [sourceRect, targetRect],
      labelSize,
      laneOffset: 0
    });

    expect(anchor).not.toBeNull();
    expect(overlapsAny(labelRect(anchor!, labelSize), [sourceRect, targetRect])).toBe(false);
    expect(anchor!.y).not.toBe(60);
  });

  it("avoids unrelated cards in the edge label corridor", () => {
    const sourceRect = { x: 0, y: 0, width: 220, height: 120 };
    const targetRect = { x: 430, y: 0, width: 220, height: 120 };
    const blockerRect = { x: 290, y: 0, width: 80, height: 120 };
    const labelSize = measureEdgeLabelSize("clear label");
    const anchor = chooseEdgeLabelAnchor({
      sourceRect,
      targetRect,
      blockingRects: [sourceRect, targetRect, blockerRect],
      labelSize,
      laneOffset: 0
    });

    expect(anchor).not.toBeNull();
    expect(overlapsAny(labelRect(anchor!, labelSize), [sourceRect, targetRect, blockerRect])).toBe(false);
    expect(anchor!.y).not.toBe(60);
  });
});

const project: Project = {
  id: "project",
  name: "Project",
  rootPath: "/tmp/project",
  description: "",
  scanningInstructions: "",
  topModulePaths: [],
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
    source: { path: null, startLine: null, endLine: null },
    createdAt: "now",
    ...input
  };
}

function canvas(edges: GraphEdge[]): CanvasGraph {
  return {
    project,
    rootNodeId: "source",
    scopeNodeId: "source",
    topModuleIds: ["source"],
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
      extensionDetails: [],
      customTypes: [],
    nodeTypeStyles: [],
    reuses: []
  };
}

function labelRect(center: { x: number; y: number }, size: { width: number; height: number }) {
  return {
    x: center.x - size.width / 2,
    y: center.y - size.height / 2,
    width: size.width,
    height: size.height
  };
}

function overlapsAny(rect: { x: number; y: number; width: number; height: number }, others: Array<{ x: number; y: number; width: number; height: number }>): boolean {
  return others.some((other) => rect.x < other.x + other.width && rect.x + rect.width > other.x && rect.y < other.y + other.height && rect.y + rect.height > other.y);
}
