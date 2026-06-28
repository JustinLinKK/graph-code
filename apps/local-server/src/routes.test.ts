import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "./db/connection";
import { GraphRepository } from "./db/repository";
import { migrate } from "./db/schema";
import { buildServer } from "./server";

let app: Awaited<ReturnType<typeof buildServer>>;
const selfRootPath = path.join(os.tmpdir(), "graphcode-self-routes");

beforeEach(async () => {
  app = await buildServer({
    dbPath: path.join(os.tmpdir(), `graphcode-routes-${crypto.randomUUID()}.sqlite`),
    seedSelf: true,
    selfRootPath
  });
});

afterEach(async () => {
  await app.close();
});

describe("graph API routes", () => {
  it("lists projects and returns a domain-only hierarchy", async () => {
    const projectsResponse = await app.inject({ method: "GET", url: "/api/projects" });
    expect(projectsResponse.statusCode).toBe(200);
    expect(projectsResponse.json()).toHaveLength(1);

    const hierarchyResponse = await app.inject({ method: "GET", url: "/api/projects/graphcode-self/hierarchy" });
    expect(hierarchyResponse.statusCode).toBe(200);
    const hierarchy = hierarchyResponse.json();
    const flat = JSON.stringify(hierarchy);
    expect(flat).toContain("GraphCode Self Workspace");
    expect(flat).toContain("boundaryGroups");
    expect(flat).toContain("boundaryLabels");
    expect(flat).toContain("Frontend");
    expect(flat).not.toContain("\"kind\":\"dependency\"");
    expect(flat).not.toContain("\"kind\":\"input\"");
    expect(flat).not.toContain("\"kind\":\"output\"");
    expect(flat).not.toContain("\"kind\":\"process\"");
  });

  it("returns canvas scope data plus attachments", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/projects/graphcode-self/canvas?rootNodeId=module-local-server&depth=1&includeAttachments=true"
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.nodes.some((node: { kind: string }) => node.kind === "dependency")).toBe(true);
    expect(body.nodes.some((node: { kind: string }) => node.kind === "database")).toBe(true);
    expect(body.nodes.some((node: { kind: string }) => node.kind === "command")).toBe(true);
    expect(body.nodes.some((node: { name: string }) => node.name === "Browser API Request")).toBe(true);
    expect(body.boundaries.some((boundary: { name: string }) => boundary.name === "Backend Internals")).toBe(true);
    expect(body.edges.every((edge: { codeContext: string }) => typeof edge.codeContext === "string")).toBe(true);
    expect(body.edges.every((edge: { color: string; animated: boolean }) => typeof edge.color === "string" && typeof edge.animated === "boolean")).toBe(true);
    expect(body.nodeTypeStyles.some((style: { nodeKind: string }) => style.nodeKind === "ui_component")).toBe(true);
    expect(body.reuses.some((reuse: { nodeId: string }) => reuse.nodeId === "object-graph-tag")).toBe(true);
    expect(body.nodes.some((node: { tags: Array<{ name: string }> }) => node.tags.some((tag) => tag.name === "taggable"))).toBe(true);
  });

  it("updates tags and reusable placements through the API", async () => {
    const nodeTagsResponse = await app.inject({
      method: "PATCH",
      url: "/api/nodes/module-web/tags",
      payload: {
        tags: [
          { name: "frontend", color: "#2563eb" },
          { name: "searchable" }
        ]
      }
    });
    expect(nodeTagsResponse.statusCode).toBe(200);
    expect(nodeTagsResponse.json().tags.map((tag: { name: string }) => tag.name)).toEqual(["frontend", "searchable"]);

    const edgeTagsResponse = await app.inject({
      method: "PATCH",
      url: "/api/edges/edge-web-uses-server/tags",
      payload: { tags: [{ name: "api", color: "#0891b2" }] }
    });
    expect(edgeTagsResponse.statusCode).toBe(200);
    expect(edgeTagsResponse.json().tags[0].name).toBe("api");

    const boundaryTagsResponse = await app.inject({
      method: "PATCH",
      url: "/api/boundaries/boundary-frontend/tags",
      payload: { tags: [{ name: "frontend", color: "#2563eb" }] }
    });
    expect(boundaryTagsResponse.statusCode).toBe(200);
    expect(boundaryTagsResponse.json().tags[0].name).toBe("frontend");

    const reuseResponse = await app.inject({
      method: "POST",
      url: "/api/projects/graphcode-self/node-reuses",
      payload: {
        scopeNodeId: "module-docs-research",
        nodeId: "object-graph-tag",
        label: "Doc tag contract",
        context: "Docs can refer to the same canonical tag contract block."
      }
    });
    expect(reuseResponse.statusCode).toBe(200);
    expect(reuseResponse.json().scopeNodeId).toBe("module-docs-research");

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/node-reuses/${reuseResponse.json().id}`
    });
    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json().ok).toBe(true);
  });

  it("creates and edits edges through the API", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/projects/graphcode-self/edges",
      payload: {
        kind: "uses",
        sourceNodeId: "module-web",
        targetNodeId: "module-local-server",
        label: "workspace API",
        codeContext: "The frontend calls the local backend for workspace data.",
        color: "#0891b2",
        animated: true
      }
    });

    expect(createResponse.statusCode).toBe(200);
    const created = createResponse.json();
    expect(created.codeContext).toContain("workspace data");

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/api/edges/${created.id}`,
      payload: {
        label: "local API",
        codeContext: "Updated edge context for route and fetch wrapper tests.",
        color: "#dc2626",
        animated: false
      }
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().label).toBe("local API");
    expect(updateResponse.json().codeContext).toContain("fetch wrapper");
    expect(updateResponse.json().color).toBe("#dc2626");
    expect(updateResponse.json().animated).toBe(false);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/edges/${created.id}`
    });
    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json().ok).toBe(true);
  });

  it("creates and edits boundaries through the API", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/projects/graphcode-self/boundaries",
      payload: {
        scopeNodeId: "framework-graphcode-self",
        name: "Frontend Test",
        summary: "Web module box",
        codeContext: "Contains the visible web workspace module.",
        color: "#2563eb",
        position: { x: 30, y: 40 },
        size: { width: 300, height: 180 }
      }
    });

    expect(createResponse.statusCode).toBe(200);
    const created = createResponse.json();
    expect(created.memberNodeIds).toContain("module-web");
    expect(created.color).toBe("#2563eb");

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/api/boundaries/${created.id}`,
      payload: {
        summary: "Moved web module box",
        codeContext: "Updated test boundary context.",
        color: "#7c3aed",
        position: { x: 20, y: 20 },
        size: { width: 340, height: 220 }
      }
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().summary).toBe("Moved web module box");
    expect(updateResponse.json().codeContext).toContain("Updated test");
    expect(updateResponse.json().color).toBe("#7c3aed");

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/boundaries/${created.id}`
    });
    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json().ok).toBe(true);
  });

  it("updates typed style routes", async () => {
    const nodeStyleResponse = await app.inject({
      method: "PATCH",
      url: "/api/projects/graphcode-self/node-type-styles/ui_component",
      payload: { color: "#be185d" }
    });
    expect(nodeStyleResponse.statusCode).toBe(200);
    expect(nodeStyleResponse.json().color).toBe("#be185d");

    const createCustomResponse = await app.inject({
      method: "POST",
      url: "/api/projects/graphcode-self/custom-node-types",
      payload: { name: "Route Styled", color: "#334155" }
    });
    const customType = createCustomResponse.json();
    const customStyleResponse = await app.inject({
      method: "PATCH",
      url: `/api/custom-node-types/${customType.id}`,
      payload: { color: "#0f766e" }
    });
    expect(customStyleResponse.statusCode).toBe(200);
    expect(customStyleResponse.json().color).toBe("#0f766e");
  });

  it("resets the self graph from the development endpoint", async () => {
    const response = await app.inject({ method: "POST", url: "/api/dev/seed-self" });
    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe("graphcode-self");
  });

  it("opens a workspace only after .graphcode exists or blank creation is accepted", async () => {
    const rootPath = path.join(os.tmpdir(), `graphcode-workspace-${crypto.randomUUID()}`);
    await fs.promises.mkdir(rootPath, { recursive: true });

    const missingResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/open",
      payload: { rootPath }
    });
    expect(missingResponse.statusCode).toBe(409);
    expect(missingResponse.json().status).toBe("missing_graphcode");

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/open",
      payload: { rootPath, createIfMissing: true }
    });
    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json().status).toBe("created");
    expect(await fileExists(path.join(rootPath, ".graphcode", "graphcode.sqlite"))).toBe(true);
  });

  it("preserves existing database contents on normal startup", async () => {
    await app.close();

    const dbPath = path.join(os.tmpdir(), `graphcode-preserve-${crypto.randomUUID()}.sqlite`);
    const db = openDatabase(dbPath);
    migrate(db);
    new GraphRepository(db).createProject({ id: "persisted-project", name: "Persisted Project", rootPath: "/tmp/persisted" });
    db.close();

    app = await buildServer({ dbPath, selfRootPath });

    const response = await app.inject({ method: "GET", url: "/api/projects" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "persisted-project",
          name: "Persisted Project"
        })
      ])
    );
  });
});

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}
