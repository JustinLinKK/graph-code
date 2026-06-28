import type { GraphNode, GraphNodeReuse } from "@graphcode/graph-model";
import { describe, expect, it } from "vitest";
import { measureNodeCardSize } from "./WorkspaceCanvas";

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

function node(input: Partial<GraphNode> & Pick<GraphNode, "id" | "kind" | "name">): GraphNode {
  return {
    projectId: "project",
    summary: "",
    code: { context: "", directory: null, startLine: null, endLine: null, language: "typescript" },
    parentId: null,
    attachedToId: null,
    customTypeId: null,
    source: { path: null, startLine: null, endLine: null },
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
