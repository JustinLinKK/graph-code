import { describe, expect, it } from "vitest";
import {
  agentConfigSchema,
  agentRunSchema,
  agentStatusSchema,
  blankWorkspaceInitializationSchema,
  boundaryMutationSchema,
  edgeMutationSchema,
  graphPatchSchema,
  githubDevicePollRequestSchema,
  githubDeviceStartResponseSchema,
  gitStatusInfoSchema,
  graphNodeReuseSchema,
  graphTagSchema,
  graphBoundarySchema,
  graphEdgeSchema,
  graphNodeKindSchema,
  graphStatusPatchSchema,
  hierarchyBoundaryGroupSchema,
  hierarchyBoundaryLabelSchema,
  isAttachmentNodeKind,
  isDomainNodeKind,
  nodeReuseMutationSchema,
  processKindSchema,
  tagAssignmentSchema,
  nodeTypeStyleSchema,
  openWorkspaceSchema,
  projectSchema,
  scanningAgentRequestSchema,
  settingsValidationResultSchema,
  workspaceInitializationSchema,
  workspaceSettingsSchema,
  workspaceSettingsMutationSchema
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
      animated: true,
      pointingEnabled: true,
      pointingDirection: "bidirectional"
    });

    expect(parsed.codeContext).toContain("local server");
    expect(parsed.animated).toBe(true);
    expect(parsed.pointingDirection).toBe("bidirectional");
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

  it("accepts agent settings, statuses, validation, and run payloads", () => {
    expect(agentStatusSchema.parse("coded")).toBe("coded");
    expect(agentStatusSchema.parse("implemented")).toBe("implemented");
    expect(processKindSchema.parse("condition")).toBe("condition");
    expect(gitStatusInfoSchema.parse({ worktree: "pending", change: "modified" }).change).toBe("modified");
    expect(
      agentConfigSchema.parse({
        agentKind: "coding",
        provider: "openrouter",
        model: "openai/gpt-4.1-mini",
        parallelLimit: 3,
        apiKeySource: { type: "env", value: "OPENROUTER_API_KEY" },
        systemPromptSource: { type: "manual", value: "Stay scoped." }
      }).provider
    ).toBe("openrouter");
    expect(
      workspaceSettingsMutationSchema.parse({
        general: { theme: "dark" },
        github: { enabled: true, repository: "owner/repo", clientId: "github-client" },
        automation: { autoReviewAfterCoding: true },
        agents: [
          {
            agentKind: "planning",
            provider: "fake",
            model: "fake",
            parallelLimit: 1,
            apiKeySource: { type: "env", value: "" },
            systemPromptSource: { type: "manual", value: "Plan." }
          }
        ]
      }).general.theme
    ).toBe("dark");
    expect(
      workspaceSettingsSchema.parse({
        general: { theme: "dark" },
        github: {
          enabled: true,
          repository: "owner/repo",
          clientId: "github-client",
          auth: {
            connected: true,
            username: "octocat",
            tokenConfigured: true,
            scopes: ["repo", "read:user"],
            connectedAt: "now",
            lastValidatedAt: "now"
          }
        },
        automation: { autoReviewAfterCoding: true },
        agents: []
      }).github.auth.username
    ).toBe("octocat");
    expect(
      settingsValidationResultSchema.parse({
        ok: false,
        testedAt: "now",
        fieldErrors: { "agents.0.model": "Required" }
      }).fieldErrors["agents.0.model"]
    ).toBe("Required");
    expect(
      agentRunSchema.parse({
        id: "run-1",
        projectId: "project",
        agentKind: "coding",
        status: "succeeded",
        targetNodeId: "node-1",
        prompt: "Do it",
        response: "Done",
        diff: "diff --git",
        graphPatch: null,
        error: null,
        createdAt: "now",
        updatedAt: "now"
      }).status
    ).toBe("succeeded");
  });

  it("requires first-run workspace initialization context", () => {
    const initialization = workspaceInitializationSchema.parse({
      projectName: "  Compiler Explorer  ",
      projectDescription: "Maps the frontend, API, and execution backends.",
      scanningInstructions: "Group by user-visible workflow first, then by package ownership."
    });

    expect(initialization.projectName).toBe("Compiler Explorer");
    expect(() =>
      workspaceInitializationSchema.parse({
        projectName: "",
        projectDescription: "Has a description",
        scanningInstructions: "Has instructions"
      })
    ).toThrow();
    expect(
      openWorkspaceSchema.parse({
        rootPath: "/tmp/project",
        createIfMissing: true,
        creationMode: "scan",
        initialization
      }).initialization?.scanningInstructions
    ).toContain("workflow");
    expect(
      openWorkspaceSchema.parse({
        rootPath: "/tmp/project",
        createIfMissing: true,
        creationMode: "blank",
        initialization: blankWorkspaceInitializationSchema.parse({
          projectName: "Blank Project"
        })
      }).creationMode
    ).toBe("blank");
  });

  it("accepts project metadata and scanner request context", () => {
    expect(
      projectSchema.parse({
        id: "project",
        name: "Project",
        rootPath: "/tmp/project",
        description: "A source workspace.",
        scanningInstructions: "Show architecture boundaries.",
        createdAt: "now",
        updatedAt: "now"
      }).scanningInstructions
    ).toContain("architecture");
    expect(
      scanningAgentRequestSchema.parse({
        projectId: "project",
        rootPath: "/tmp/project",
        projectDescription: "A source workspace.",
        scanningInstructions: "Show architecture boundaries."
      }).projectDescription
    ).toContain("source");
  });

  it("accepts graph patches and status updates", () => {
    expect(
      graphPatchSchema.parse({
        summary: "Mark block planned",
        operations: [{ entityType: "node", entityId: "node-1", action: "update", fields: { summary: "new" } }]
      }).operations[0].entityType
    ).toBe("node");
    expect(
      graphStatusPatchSchema.parse({
        entityType: "edge",
        entityId: "edge-1",
        status: "reviewed",
        note: "Looks good"
      }).status
    ).toBe("reviewed");
    expect(
      graphStatusPatchSchema.parse({
        entityType: "node",
        entityId: "node-1",
        status: "implemented"
      }).status
    ).toBe("implemented");
  });

  it("accepts GitHub device flow payloads", () => {
    expect(
      githubDeviceStartResponseSchema.parse({
        deviceCode: "device",
        userCode: "ABCD-EFGH",
        verificationUri: "https://github.com/login/device",
        expiresIn: 900,
        interval: 5,
        message: "Open GitHub"
      }).userCode
    ).toBe("ABCD-EFGH");
    expect(githubDevicePollRequestSchema.parse({ deviceCode: "device", clientId: "client" }).deviceCode).toBe("device");
  });
});
