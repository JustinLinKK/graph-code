import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type GraphDatabase } from "./connection";
import { GraphRepository } from "./repository";
import { migrate } from "./schema";

let db: GraphDatabase;
let repo: GraphRepository;
const selfRootPath = path.join(os.tmpdir(), "graph-code-self-test");

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
        "graph_node_layouts",
        "graph_node_type_styles",
        "graph_revisions"
      ])
    );
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

    expect(() =>
      repo.createNode({
        id: "bad-function",
        projectId: project.id,
        kind: "function",
        name: "Bad Function",
        parentId: "framework"
      })
    ).toThrow(/module/);
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

  it("returns local-server canvas data with rich attachments and basic blocks", async () => {
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
    expect(canvas.nodes.map((node) => node.kind)).toContain("command");
    expect(canvas.nodes.map((node) => node.kind)).toContain("secret");
    expect(canvas.nodes.map((node) => node.kind)).toContain("api");
    expect(canvas.nodes.map((node) => node.name)).toContain("Graph Repository");
    expect(canvas.nodes.map((node) => node.name)).toContain("GraphTag");
    expect(canvas.reuses.map((reuse) => reuse.nodeId)).toContain("object-graph-tag");
    expect(canvas.dependencies.map((dependency) => dependency.spec)).toContain("better-sqlite3");
    expect(canvas.formats.map((format) => format.spec)).toContain("SQLite rows");
    expect(canvas.basicDetails.map((detail) => detail.basicKind)).toEqual(expect.arrayContaining(["database", "config", "command", "secret", "api"]));
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
      animated: true
    });
    const updated = repo.updateEdge(edge.id, {
      label: "workspace API",
      codeContext: "Changing this edge means updating fetch wrappers, routes, and route tests.",
      color: "#dc2626",
      animated: false
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
