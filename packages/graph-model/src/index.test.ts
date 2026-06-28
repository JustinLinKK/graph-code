import { describe, expect, it } from "vitest";
import {
  boundaryMutationSchema,
  edgeMutationSchema,
  graphNodeReuseSchema,
  graphTagSchema,
  graphBoundarySchema,
  graphEdgeSchema,
  graphNodeKindSchema,
  hierarchyBoundaryGroupSchema,
  hierarchyBoundaryLabelSchema,
  isAttachmentNodeKind,
  isDomainNodeKind,
  nodeReuseMutationSchema,
  tagAssignmentSchema,
  nodeTypeStyleSchema
} from "./index";

describe("graph model enums", () => {
  it("accepts the planned node kinds", () => {
    expect(graphNodeKindSchema.parse("framework")).toBe("framework");
    expect(graphNodeKindSchema.parse("website")).toBe("website");
    expect(graphNodeKindSchema.parse("ui_component")).toBe("ui_component");
    expect(graphNodeKindSchema.parse("dependency")).toBe("dependency");
  });

  it("separates domain nodes from attachment nodes", () => {
    expect(isDomainNodeKind("module")).toBe(true);
    expect(isDomainNodeKind("website")).toBe(true);
    expect(isDomainNodeKind("ui_component")).toBe(true);
    expect(isDomainNodeKind("input")).toBe(false);
    expect(isAttachmentNodeKind("output")).toBe(true);
    expect(isAttachmentNodeKind("object")).toBe(false);
  });

  it("accepts edge mutations with coding-agent context", () => {
    const parsed = edgeMutationSchema.parse({
      kind: "uses",
      sourceNodeId: "module-web",
      targetNodeId: "module-local-server",
      label: "local API",
      codeContext: "The web client depends on the local server API contract.",
      color: "#0891b2",
      animated: true
    });

    expect(parsed.codeContext).toContain("local server");
    expect(parsed.animated).toBe(true);
    expect(
      graphEdgeSchema.parse({
        ...parsed,
        id: "edge-web-server",
        projectId: "graphcode-self",
        createdAt: "now"
      }).color
    ).toBe("#0891b2");
  });

  it("accepts persisted boundary payloads and mutations", () => {
    const mutation = boundaryMutationSchema.parse({
      scopeNodeId: "framework",
      name: "Frontend",
      summary: "React modules",
      codeContext: "Everything inside this box belongs to the browser workspace.",
      color: "#2563eb",
      position: { x: 10, y: 20 },
      size: { width: 300, height: 180 }
    });

    const persisted = graphBoundarySchema.parse({
      ...mutation,
      id: "boundary-frontend",
      projectId: "graphcode-self",
      memberNodeIds: ["module-web"],
      memberCount: 1,
      createdAt: "now",
      updatedAt: "now"
    });

    expect(persisted.memberNodeIds).toEqual(["module-web"]);
  });

  it("accepts tags and reusable node placements", () => {
    expect(
      graphTagSchema.parse({
        id: "tag-frontend",
        projectId: "graphcode-self",
        name: "frontend",
        color: "#2563eb",
        createdAt: "now",
        updatedAt: "now"
      }).name
    ).toBe("frontend");

    expect(
      tagAssignmentSchema.parse({
        tags: [
          { name: "shared", color: "#7c3aed" },
          { name: "critical" }
        ]
      }).tags
    ).toHaveLength(2);

    const mutation = nodeReuseMutationSchema.parse({
      scopeNodeId: "module-web",
      nodeId: "object-graph-tag",
      label: "Reused tag DTO",
      context: "Frontend consumes the canonical tag contract from graph-model."
    });

    expect(
      graphNodeReuseSchema.parse({
        ...mutation,
        id: "reuse-web-tag",
        projectId: "graphcode-self",
        label: mutation.label ?? "",
        context: mutation.context ?? "",
        createdAt: "now",
        updatedAt: "now"
      }).nodeId
    ).toBe("object-graph-tag");
  });

  it("accepts hierarchy boundary decorations and node type styles", () => {
    expect(
      hierarchyBoundaryLabelSchema.parse({
        id: "boundary-frontend",
        name: "Frontend",
        color: "#2563eb"
      }).name
    ).toBe("Frontend");

    expect(
      hierarchyBoundaryGroupSchema.parse({
        id: "boundary-frontend",
        scopeNodeId: "framework",
        name: "Frontend",
        summary: "React modules",
        color: "#2563eb",
        memberNodeIds: ["module-web"],
        memberNames: ["Web Workspace"]
      }).memberNames
    ).toEqual(["Web Workspace"]);

    expect(
      nodeTypeStyleSchema.parse({
        projectId: "graphcode-self",
        nodeKind: "ui_component",
        color: "#db2777",
        createdAt: "now",
        updatedAt: "now"
      }).nodeKind
    ).toBe("ui_component");
  });
});
