import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "./db/connection";
import { GraphRepository } from "./db/repository";
import { migrate } from "./db/schema";
import { buildServer } from "./server";

let app: Awaited<ReturnType<typeof buildServer>>;
const selfRootPath = path.join(os.tmpdir(), "graphcode-self-routes");

beforeEach(async () => {
  await fs.promises.rm(selfRootPath, { recursive: true, force: true });
  await fs.promises.mkdir(path.join(selfRootPath, "src"), { recursive: true });
  await fs.promises.writeFile(
    path.join(selfRootPath, "src", "scanned.ts"),
    ["export function scanned(value: number): number {", "  return value + 1;", "}"].join("\n")
  );
  app = await buildServer({
    dbPath: path.join(os.tmpdir(), `graphcode-routes-${crypto.randomUUID()}.sqlite`),
    seedSelf: true,
    selfRootPath
  });
});

afterEach(async () => {
  await app.close();
  vi.unstubAllGlobals();
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
    expect(body.nodes.some((node: { kind: string }) => node.kind === "config")).toBe(true);
    expect(body.nodes.some((node: { name: string }) => node.name === "Browser API Request")).toBe(true);
    expect(body.nodes.some((node: { name: string }) => node.name === "Persist Graph State")).toBe(false);
    expect(body.boundaries.some((boundary: { name: string }) => boundary.name === "Backend Internals")).toBe(true);
    expect(body.edges.every((edge: { codeContext: string }) => typeof edge.codeContext === "string")).toBe(true);
    expect(
      body.edges.every(
        (edge: { color: string; animated: boolean; pointingEnabled: boolean; pointingDirection: string }) =>
          typeof edge.color === "string" &&
          typeof edge.animated === "boolean" &&
          typeof edge.pointingEnabled === "boolean" &&
          ["source_to_target", "target_to_source", "bidirectional"].includes(edge.pointingDirection)
      )
    ).toBe(true);
    expect(body.nodeTypeStyles.some((style: { nodeKind: string }) => style.nodeKind === "ui_component")).toBe(true);
    expect(body.reuses.some((reuse: { nodeId: string }) => reuse.nodeId === "object-graph-tag")).toBe(true);
    expect(body.nodes.some((node: { tags: Array<{ name: string }> }) => node.tags.some((tag) => tag.name === "taggable"))).toBe(true);
  });

  it("saves settings, validates Claude Code command, and lists agent runs", async () => {
    const settingsResponse = await app.inject({
      method: "GET",
      url: "/api/projects/graphcode-self/settings"
    });
    expect(settingsResponse.statusCode).toBe(200);
      expect(settingsResponse.json().agents.some((agent: { agentKind: string }) => agent.agentKind === "coding")).toBe(false);
      expect(settingsResponse.json().agents.some((agent: { agentKind: string }) => agent.agentKind === "review")).toBe(false);
      expect(settingsResponse.json().codingAgents.map((agent: { mode: string }) => agent.mode).sort()).toEqual(["large", "medium", "small"]);
      expect(settingsResponse.json().reviewAgents.map((agent: { mode: string }) => agent.mode).sort()).toEqual(["large", "medium", "small"]);
      expect(settingsResponse.json().scanningAgents.map((agent: { mode: string }) => agent.mode).sort()).toEqual(["global", "local", "medium"]);

    const saveResponse = await app.inject({
      method: "PUT",
      url: "/api/projects/graphcode-self/settings",
      payload: {
        general: { theme: "dark" },
        github: { enabled: true, repository: "owner/repo", clientId: "github-client" },
        automation: { autoReviewAfterCoding: true },
        agents: [
          {
            agentKind: "coding",
            provider: "fake",
            model: "fake",
            parallelLimit: 2,
            apiKeySource: { type: "manual", value: "secret" },
            systemPromptSource: { type: "manual", value: "Stay scoped." }
          },
          {
            agentKind: "planning",
            provider: "claudecode",
            model: "definitely-missing-claude-command",
            parallelLimit: 1,
            apiKeySource: { type: "env", value: "" },
            systemPromptSource: { type: "manual", value: "Plan." }
          },
          {
            agentKind: "review",
            provider: "fake",
            model: "fake",
            parallelLimit: 1,
            apiKeySource: { type: "env", value: "" },
            systemPromptSource: { type: "manual", value: "Review." }
          },
          {
            agentKind: "scanning",
            provider: "fake",
            model: "fake",
            parallelLimit: 2,
            apiKeySource: { type: "env", value: "" },
            systemPromptSource: { type: "manual", value: "Scan." }
          }
        ],
          reviewAgents: [
            {
              mode: "small",
              provider: "fake",
              model: "fake-review-small",
              parallelLimit: 1,
              apiKeySource: { type: "env", value: "" },
              systemPromptSource: { type: "manual", value: "Review small." }
            },
            {
              mode: "medium",
              provider: "fake",
              model: "fake-review-medium",
              parallelLimit: 2,
              apiKeySource: { type: "env", value: "" },
              systemPromptSource: { type: "manual", value: "Review medium." }
            },
            {
              mode: "large",
              provider: "fake",
              model: "fake-review-large",
              parallelLimit: 4,
              apiKeySource: { type: "env", value: "" },
              systemPromptSource: { type: "manual", value: "Review large." }
            }
          ],
          scanningAgents: [
          {
            mode: "local",
            provider: "fake",
            model: "fake-local",
            parallelLimit: 8,
            apiKeySource: { type: "env", value: "" },
            systemPromptSource: { type: "manual", value: "Scan local." }
          },
          {
            mode: "medium",
            provider: "fake",
            model: "fake-medium",
            parallelLimit: 4,
            apiKeySource: { type: "env", value: "" },
            systemPromptSource: { type: "manual", value: "Scan medium." }
          },
          {
            mode: "global",
            provider: "fake",
            model: "fake-global",
            parallelLimit: 1,
            apiKeySource: { type: "env", value: "" },
            systemPromptSource: { type: "manual", value: "Scan global." }
          }
        ]
      }
    });
    expect(saveResponse.statusCode).toBe(200);
    expect(saveResponse.json().validation.ok).toBe(false);
    expect(JSON.stringify(saveResponse.json().validation.fieldErrors)).toContain("Claude Code command");

    const runsResponse = await app.inject({ method: "GET", url: "/api/projects/graphcode-self/agent-runs" });
    expect(runsResponse.statusCode).toBe(200);
    expect(runsResponse.json()).toEqual([]);
  });

  it("validates Codex CLI account commands for settings", async () => {
    const command = path.join(os.tmpdir(), `graphcode-codex-cli-${crypto.randomUUID()}.sh`);
    fs.writeFileSync(
      command,
      [
        "#!/bin/sh",
        "if [ \"$1\" = \"--version\" ]; then echo codex-test; exit 0; fi",
        "if [ \"$1\" = \"login\" ] && [ \"$2\" = \"status\" ]; then echo logged-in; exit 0; fi",
        "exit 0"
      ].join("\n"),
      { mode: 0o755 }
    );

    const saveResponse = await app.inject({
      method: "PUT",
      url: "/api/projects/graphcode-self/settings",
      payload: {
        general: { theme: "dark" },
        github: { enabled: false, repository: "", clientId: "" },
        automation: { autoReviewAfterCoding: true },
        extensions: { enabledPackageIds: [], configs: {} },
        agents: [
          {
            agentKind: "planning",
            provider: "codex",
            model: command,
            parallelLimit: 1,
            apiKeySource: { type: "env", value: "" },
            systemPromptSource: { type: "manual", value: "Plan with Codex." }
          }
        ]
      }
    });

    expect(saveResponse.statusCode).toBe(200);
    expect(saveResponse.json().validation.ok).toBe(true);
    expect(saveResponse.json().settings.agents.find((agent: { agentKind: string }) => agent.agentKind === "planning").provider).toBe("codex");
  });

  it("reports Codex CLI auth failures after command validation", async () => {
    const command = path.join(os.tmpdir(), `graphcode-codex-cli-auth-${crypto.randomUUID()}.sh`);
    fs.writeFileSync(
      command,
      ["#!/bin/sh", "if [ \"$1\" = \"--version\" ]; then echo codex-test; exit 0; fi", "exit 1"].join("\n"),
      { mode: 0o755 }
    );

    const saveResponse = await app.inject({
      method: "PUT",
      url: "/api/projects/graphcode-self/settings",
      payload: {
        general: { theme: "dark" },
        github: { enabled: false, repository: "", clientId: "" },
        automation: { autoReviewAfterCoding: true },
        extensions: { enabledPackageIds: [], configs: {} },
        agents: [
          {
            agentKind: "planning",
            provider: "codex",
            model: command,
            parallelLimit: 1,
            apiKeySource: { type: "env", value: "" },
            systemPromptSource: { type: "manual", value: "Plan with Codex." }
          }
        ]
      }
    });

    expect(saveResponse.statusCode).toBe(200);
    expect(saveResponse.json().validation.ok).toBe(false);
    expect(JSON.stringify(saveResponse.json().validation.fieldErrors)).toContain("Codex CLI account login");
  });

  it("connects and disconnects GitHub with OAuth device flow routes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url === "https://github.com/login/device/code") {
          return jsonResponse({
            device_code: "device-code",
            user_code: "ABCD-EFGH",
            verification_uri: "https://github.com/login/device",
            expires_in: 900,
            interval: 5,
            message: "Enter the code"
          });
        }
        if (url === "https://github.com/login/oauth/access_token") {
          return jsonResponse({
            access_token: "gho_token",
            token_type: "bearer",
            scope: "repo,read:user"
          });
        }
        if (url === "https://api.github.com/user") {
          return jsonResponse({ login: "octocat" });
        }
        if (url === "https://api.github.com/repos/owner/repo") {
          return jsonResponse({ full_name: "owner/repo" });
        }
        return jsonResponse({ message: "not found" }, 404);
      })
    );

    const startResponse = await app.inject({
      method: "POST",
      url: "/api/projects/graphcode-self/github/device/start",
      payload: { clientId: "github-client" }
    });
    expect(startResponse.statusCode).toBe(200);
    expect(startResponse.json().userCode).toBe("ABCD-EFGH");

    const pollResponse = await app.inject({
      method: "POST",
      url: "/api/projects/graphcode-self/github/device/poll",
      payload: { deviceCode: "device-code", clientId: "github-client", repository: "owner/repo" }
    });
    expect(pollResponse.statusCode).toBe(200);
    expect(pollResponse.json().status).toBe("connected");
    expect(pollResponse.json().settings.github.auth.username).toBe("octocat");
    expect(pollResponse.json().settings.github.auth.tokenConfigured).toBe(true);

    const disconnectResponse = await app.inject({
      method: "POST",
      url: "/api/projects/graphcode-self/github/disconnect"
    });
    expect(disconnectResponse.statusCode).toBe(200);
    expect(disconnectResponse.json().github.auth.connected).toBe(false);
  });

  it("runs fake planning, coding, review, scanning, and git-status routes", async () => {
    const backgroundPlanningResponse = await app.inject({
      method: "POST",
      url: "/api/agents/planning",
      payload: {
        projectId: "graphcode-self",
        prompt: "Plan a background ticket",
        scopeNodeId: "module-web",
        background: true
      }
    });
    expect(backgroundPlanningResponse.statusCode).toBe(200);
    expect(backgroundPlanningResponse.json().status).toBe("running");
    expect(typeof backgroundPlanningResponse.json().baseGraphRevision).toBe("number");

    const completedPlanningTicket = await waitForAgentRun(backgroundPlanningResponse.json().id, "succeeded");
    expect(completedPlanningTicket.graphPatch.operations.length).toBeGreaterThan(0);
    const applyPlanningResponse = await app.inject({
      method: "POST",
      url: `/api/projects/graphcode-self/agent-runs/${completedPlanningTicket.id}/apply-graph-patch`
    });
    expect(applyPlanningResponse.statusCode).toBe(200);
    expect(applyPlanningResponse.json().appliedGraphRevision).not.toBeNull();

    const planningResponse = await app.inject({
      method: "POST",
      url: "/api/agents/planning",
      payload: {
        projectId: "graphcode-self",
        prompt: "Plan a panel",
        scopeNodeId: "module-web"
      }
    });
    expect(planningResponse.statusCode).toBe(200);
    expect(planningResponse.json().status).toBe("succeeded");
    expect(planningResponse.json().graphPatch.operations.length).toBeGreaterThan(0);

    const codingResponse = await app.inject({
      method: "POST",
      url: "/api/agents/coding",
      payload: {
        projectId: "graphcode-self",
        nodeId: "module-web",
        mode: "large",
        prompt: "Add a placeholder"
      }
    });
    expect(codingResponse.statusCode).toBe(200);
    expect(codingResponse.json().status).toBe("succeeded");
    expect(codingResponse.json().codingMode).toBe("large");
    expect(codingResponse.json().diff).toContain("diff --git");

    const runsAfterCodingResponse = await app.inject({ method: "GET", url: "/api/projects/graphcode-self/agent-runs" });
    expect(runsAfterCodingResponse.statusCode).toBe(200);
    expect(runsAfterCodingResponse.json().some((run: { agentKind: string; prompt: string }) => run.agentKind === "review" && run.prompt.includes(codingResponse.json().id))).toBe(true);

    const reviewResponse = await app.inject({
      method: "POST",
      url: "/api/agents/review",
      payload: {
        projectId: "graphcode-self",
        runId: codingResponse.json().id
      }
    });
      expect(reviewResponse.statusCode).toBe(200);
      expect(reviewResponse.json().status).toBe("succeeded");
      expect(reviewResponse.json().reviewMode).toBe("large");

    const scanResponse = await app.inject({
      method: "POST",
      url: "/api/agents/scanning",
      payload: { projectId: "graphcode-self" }
    });
    expect(scanResponse.statusCode).toBe(200);
    expect(scanResponse.json().response).toContain("Scanned");
    expect(scanResponse.json().response).toContain("Code Graph nodes");

    const hierarchyAfterScan = await app.inject({ method: "GET", url: "/api/projects/graphcode-self/hierarchy" });
    expect(JSON.stringify(hierarchyAfterScan.json())).toContain("Code Graph");
    expect(JSON.stringify(hierarchyAfterScan.json())).toContain("scanned.ts");

      const gitResponse = await app.inject({ method: "GET", url: "/api/projects/graphcode-self/git-status" });
      expect(gitResponse.statusCode).toBe(200);
      expect(typeof gitResponse.json().status).toBe("string");
    });

    it("previews, starts, and applies layered coding workflows", async () => {
      const demoteResponse = await app.inject({
        method: "PATCH",
        url: "/api/nodes/function-app",
        payload: {
          summary: "Planning update for layered workflow route coverage."
        }
      });
      expect(demoteResponse.statusCode).toBe(200);
      expect(demoteResponse.json().agentStatus).toBe("planning");

      const previewResponse = await app.inject({
        method: "POST",
        url: "/api/coding-workflows/preview",
        payload: {
          projectId: "graphcode-self",
          scopeNodeId: "module-web"
        }
      });
      expect(previewResponse.statusCode).toBe(200);
      expect(previewResponse.json().status).toBe("preview");
      expect(previewResponse.json().items.some((item: { nodeId: string }) => item.nodeId === "function-app")).toBe(true);

      const startResponse = await app.inject({
        method: "POST",
        url: "/api/coding-workflows/start",
        payload: {
          projectId: "graphcode-self",
          scopeNodeId: "module-web",
          modeOverrides: [{ nodeId: "function-app", mode: "small" }]
        }
      });
      expect(startResponse.statusCode).toBe(200);
      const started = startResponse.json();
      expect(started.items.some((item: { nodeId: string; status: string; selectedMode: string }) => item.nodeId === "function-app" && item.status === "proposed" && item.selectedMode === "small")).toBe(true);

      const statusResponse = await app.inject({
        method: "GET",
        url: `/api/projects/graphcode-self/coding-workflows/${started.id}`
      });
      expect(statusResponse.statusCode).toBe(200);
      expect(statusResponse.json().id).toBe(started.id);

      const applyResponse = await app.inject({
        method: "POST",
        url: "/api/coding-workflows/apply-layer",
        payload: {
          projectId: "graphcode-self",
          workflowId: started.id,
          layerIndex: started.currentLayer
        }
      });
      expect(applyResponse.statusCode).toBe(200);
      expect(applyResponse.json().items.some((item: { nodeId: string; status: string }) => item.nodeId === "function-app" && item.status === "applied")).toBe(true);
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
        animated: true,
        pointingEnabled: true,
        pointingDirection: "bidirectional"
      }
    });

    expect(createResponse.statusCode).toBe(200);
    const created = createResponse.json();
    expect(created.codeContext).toContain("workspace data");
    expect(created.pointingDirection).toBe("bidirectional");

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/api/edges/${created.id}`,
      payload: {
        label: "local API",
        codeContext: "Updated edge context for route and fetch wrapper tests.",
        color: "#dc2626",
        animated: false,
        pointingEnabled: false,
        pointingDirection: "target_to_source"
      }
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().label).toBe("local API");
    expect(updateResponse.json().pointingEnabled).toBe(false);
    expect(updateResponse.json().pointingDirection).toBe("target_to_source");
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

  it("opens a workspace only after .graphcode exists or first-run scanning context is accepted", async () => {
    const rootPath = path.join(os.tmpdir(), `graphcode-workspace-${crypto.randomUUID()}`);
    await fs.promises.mkdir(path.join(rootPath, "src"), { recursive: true });
    await fs.promises.writeFile(path.join(rootPath, "src", "scanned.ts"), "export function scannedRoute(): string { return 'ok'; }\n");

    const missingResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/open",
      payload: { rootPath }
    });
    expect(missingResponse.statusCode).toBe(409);
    expect(missingResponse.json().status).toBe("missing_graphcode");

    const rejectedCreateResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/open",
      payload: { rootPath, createIfMissing: true }
    });
    expect(rejectedCreateResponse.statusCode).toBe(400);
    expect(rejectedCreateResponse.json().message).toContain("Project name");

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/open",
      payload: {
        rootPath,
        createIfMissing: true,
        creationMode: "scan",
        initialization: {
          projectName: "Route Workspace",
          projectDescription: "A route-level project used to verify first-run initialization.",
          scanningInstructions: "Group by API route and source file."
        }
      }
    });
    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json().status).toBe("created");
    expect(createResponse.json().project).toEqual(
      expect.objectContaining({
        name: "Route Workspace",
        description: "A route-level project used to verify first-run initialization.",
        scanningInstructions: "Group by API route and source file."
      })
    );
    expect(await fileExists(path.join(rootPath, ".graphcode", "graphcode.sqlite"))).toBe(true);
    const manifest = JSON.parse(await fs.promises.readFile(path.join(rootPath, ".graphcode", "workspace.json"), "utf8"));
    expect(manifest).toEqual(
      expect.objectContaining({
        projectName: "Route Workspace",
        projectDescription: "A route-level project used to verify first-run initialization.",
        scanningInstructions: "Group by API route and source file."
      })
    );

    const projectId = createResponse.json().project.id;
    const completedBackgroundScan = await waitForAgentKind(projectId, "scanning", "succeeded");
    expect(completedBackgroundScan.response).toContain("Scanned");

    const hierarchyResponse = await app.inject({ method: "GET", url: `/api/projects/${projectId}/hierarchy` });
    expect(hierarchyResponse.statusCode).toBe(200);
    const hierarchyText = JSON.stringify(hierarchyResponse.json());
    expect(hierarchyText).toContain("Scanned Workspace");
    expect(hierarchyText).toContain("scanned.ts");

    const scanResponse = await app.inject({
      method: "POST",
      url: "/api/agents/scanning",
      payload: { projectId }
    });
    expect(scanResponse.statusCode).toBe(200);
    const runsResponse = await app.inject({ method: "GET", url: `/api/projects/${projectId}/agent-runs` });
    expect(JSON.stringify(runsResponse.json())).toContain("route-level project");
    expect(JSON.stringify(runsResponse.json())).toContain("Group by API route");

    const existingRootPath = path.join(os.tmpdir(), `graphcode-existing-${crypto.randomUUID()}`);
    await fs.promises.mkdir(path.join(existingRootPath, ".graphcode"), { recursive: true });
    const existingResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/open",
      payload: { rootPath: existingRootPath }
    });
    expect(existingResponse.statusCode).toBe(409);
    expect(existingResponse.json().status).toBe("empty_graphcode");

    const blankResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/open",
      payload: {
        rootPath: existingRootPath,
        createIfMissing: true,
        creationMode: "blank",
        initialization: {
          projectName: "Blank Route Workspace",
          projectDescription: "Blank workspace for manual graphing."
        }
      }
    });
    expect(blankResponse.statusCode).toBe(200);
    expect(blankResponse.json().status).toBe("created");
    expect(blankResponse.json().project).toEqual(
      expect.objectContaining({
        name: "Blank Route Workspace",
        description: "Blank workspace for manual graphing.",
        scanningInstructions: ""
      })
    );
    const blankHierarchyResponse = await app.inject({ method: "GET", url: `/api/projects/${blankResponse.json().project.id}/hierarchy` });
    expect(blankHierarchyResponse.statusCode).toBe(200);
    expect(blankHierarchyResponse.json()).toEqual([]);
  });

  it("opens an existing .graphcode database without rebuilding the default graph", async () => {
    const rootPath = path.join(os.tmpdir(), `graphcode-existing-${crypto.randomUUID()}`);
    const graphcodePath = path.join(rootPath, ".graphcode");
    await fs.promises.mkdir(graphcodePath, { recursive: true });
    const workspaceDbPath = path.join(graphcodePath, "graphcode.sqlite");
    const db = openDatabase(workspaceDbPath);
    migrate(db);
    const repo = new GraphRepository(db);
    const project = repo.createProject({ id: "persisted-open-project", name: "Persisted Open Project", rootPath });
    repo.createNode({ id: "persisted-open-root", projectId: project.id, kind: "framework", name: "Persisted Root" });
    repo.createNode({ id: "persisted-open-module", projectId: project.id, kind: "module", name: "Persisted Module", parentId: "persisted-open-root" });
    repo.updateNodeLayout("persisted-open-module", {
      scopeNodeId: "persisted-open-root",
      position: { x: 321, y: 654 },
      size: { width: 222, height: 111 }
    });
    db.close();

    const openResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/open",
      payload: { rootPath }
    });
    expect(openResponse.statusCode).toBe(200);
    expect(openResponse.json().status).toBe("opened");
    expect(openResponse.json().project).toEqual(expect.objectContaining({ id: project.id, name: "Persisted Open Project" }));

    const canvasResponse = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/canvas?rootNodeId=persisted-open-root`
    });
    expect(canvasResponse.statusCode).toBe(200);
    const moduleNode = canvasResponse.json().nodes.find((node: { id: string }) => node.id === "persisted-open-module");
    expect(moduleNode).toEqual(
      expect.objectContaining({
        name: "Persisted Module",
        position: { x: 321, y: 654 },
        size: { width: 222, height: 111 }
      })
    );
    expect(JSON.stringify(canvasResponse.json())).not.toContain("GraphCode Self Workspace");
  });

  it("prompts before initializing an empty self workspace database", async () => {
    await app.close();
    const rootPath = path.join(os.tmpdir(), `graphcode-self-open-${crypto.randomUUID()}`);
    await fs.promises.mkdir(path.join(rootPath, ".graphcode"), { recursive: true });
    app = await buildServer({
      dbPath: path.join(os.tmpdir(), `graphcode-empty-self-${crypto.randomUUID()}.sqlite`),
      selfRootPath: rootPath
    });

    const openResponse = await app.inject({
      method: "POST",
      url: "/api/workspaces/open",
      payload: { rootPath }
    });
    expect(openResponse.statusCode).toBe(409);
    expect(openResponse.json().status).toBe("empty_graphcode");
  });

  it("preserves existing database contents on normal startup", async () => {
    await app.close();

    const dbPath = path.join(os.tmpdir(), `graphcode-preserve-${crypto.randomUUID()}.sqlite`);
    const db = openDatabase(dbPath);
    migrate(db);
    const repo = new GraphRepository(db);
    const project = repo.createProject({ id: "persisted-project", name: "Persisted Project", rootPath: "/tmp/persisted" });
    repo.createNode({ id: "persisted-root", projectId: project.id, kind: "framework", name: "Persisted Root" });
    repo.createNode({ id: "persisted-module", projectId: project.id, kind: "module", name: "Persisted Module", parentId: "persisted-root" });
    repo.updateNodeLayout("persisted-module", {
      scopeNodeId: "persisted-root",
      position: { x: 123, y: 456 },
      size: { width: 240, height: 135 }
    });
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

    const canvasResponse = await app.inject({
      method: "GET",
      url: "/api/projects/persisted-project/canvas?rootNodeId=persisted-root"
    });
    expect(canvasResponse.statusCode).toBe(200);
    const moduleNode = canvasResponse.json().nodes.find((node: { id: string }) => node.id === "persisted-module");
    expect(moduleNode).toEqual(
      expect.objectContaining({
        position: { x: 123, y: 456 },
        size: { width: 240, height: 135 }
      })
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

async function waitForAgentRun(runId: string, status: string, projectId = "graphcode-self") {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await app.inject({ method: "GET", url: `/api/projects/${projectId}/agent-runs` });
    const run = response.json().find((item: { id: string }) => item.id === runId);
    if (run?.status === status) {
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Agent run ${runId} did not reach ${status}.`);
}

async function waitForAgentKind(projectId: string, agentKind: string, status: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await app.inject({ method: "GET", url: `/api/projects/${projectId}/agent-runs` });
    const run = response.json().find((item: { agentKind: string; status: string }) => item.agentKind === agentKind && item.status === status);
    if (run) {
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Agent kind ${agentKind} did not reach ${status}.`);
}
