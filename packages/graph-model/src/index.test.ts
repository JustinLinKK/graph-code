import { describe, expect, it } from "vitest";
import {
  agentConfigSchema,
  agentRunSchema,
  agentRunStatusSchema,
    agentStatusSchema,
    blankWorkspaceInitializationSchema,
    blockExecutionMetadataSchema,
    boundaryMutationSchema,
    codingAgentConfigSchema,
    codingAgentModeSchema,
    codingAgentRequestSchema,
    codingWorkflowApplyLayerRequestSchema,
    codingWorkflowItemSchema,
    codingWorkflowSchema,
    codingWorkflowStartRequestSchema,
    codeProposalArtifactManifestSchema,
    edgeMutationSchema,
    AVAILABLE_EXTENSION_PACKAGES,
    extensionNodeDetailsMutationSchema,
    extensionNodeDefinitionForKind,
    graphNodeSchema,
    graphPatchSchema,
  SCANNING_AGENT_MODES,
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
      planningChatRequestSchema,
      projectSchema,
    REVIEW_AGENT_MODES,
    reviewAgentConfigSchema,
    reviewAgentModeSchema,
    reviewAgentRequestSchema,
    scanningAgentConfigSchema,
    scanningAgentModeSchema,
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
    expect(graphNodeKindSchema.parse("ros_topic")).toBe("ros_topic");
    expect(graphNodeKindSchema.parse("ml_layer")).toBe("ml_layer");
  });

  it("accepts native extension package manifests and detail payloads", () => {
    expect(AVAILABLE_EXTENSION_PACKAGES.map((extensionPackage) => extensionPackage.id)).toEqual([
      "@graphcode/extension-embedded-systems",
      "@graphcode/extension-ml-pipeline"
    ]);
    expect(extensionNodeDefinitionForKind("ml_optimizer")?.fields.some((field) => field.key === "optimizerType")).toBe(true);
    expect(
      extensionNodeDetailsMutationSchema.parse({
        packageId: "@graphcode/extension-embedded-systems",
        schemaId: "uart_bus",
        payload: { baud: 115200, parity: "none" }
      }).payload.baud
    ).toBe(115200);
    expect(
      workspaceSettingsMutationSchema.parse({
        general: { theme: "system" },
        github: { enabled: false, repository: "", clientId: "" },
        automation: { autoReviewAfterCoding: true },
        extensions: { enabledPackageIds: ["@graphcode/extension-ml-pipeline"], configs: {} },
        agents: []
      }).extensions.enabledPackageIds
    ).toEqual(["@graphcode/extension-ml-pipeline"]);
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
      pointingDirection: "bidirectional",
      source: { path: "src/web.ts", startLine: 10, endLine: 12 }
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
      }).source.path
    ).toBe("src/web.ts");
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
      expect(agentRunStatusSchema.parse("conflicted")).toBe("conflicted");
      expect(codingAgentModeSchema.parse("small")).toBe("small");
      expect(REVIEW_AGENT_MODES).toEqual(["small", "medium", "large"]);
      expect(reviewAgentModeSchema.parse("large")).toBe("large");
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
        codingAgentConfigSchema.parse({
          mode: "large",
        provider: "openai",
        model: "gpt-5",
        parallelLimit: 2,
        apiKeySource: { type: "env", value: "OPENAI_API_KEY" },
        systemPromptSource: { type: "manual", value: "Use full scoped context." }
      }).mode
      ).toBe("large");
      expect(
        reviewAgentConfigSchema.parse({
          mode: "medium",
          provider: "openai",
          model: "gpt-5",
          parallelLimit: 2,
          apiKeySource: { type: "env", value: "OPENAI_API_KEY" },
          systemPromptSource: { type: "manual", value: "Review scoped diffs." }
        }).mode
      ).toBe("medium");
    expect(SCANNING_AGENT_MODES).toEqual(["local", "medium", "global"]);
    expect(scanningAgentModeSchema.parse("global")).toBe("global");
    expect(
      scanningAgentConfigSchema.parse({
        mode: "local",
        provider: "fake",
        model: "fake-local",
        parallelLimit: 8,
        apiKeySource: { type: "env", value: "" },
        systemPromptSource: { type: "manual", value: "Analyze one file." }
      }).mode
    ).toBe("local");
    expect(
      codingAgentRequestSchema.parse({
        projectId: "project",
        nodeId: "node-1"
      }).mode
    ).toBe("medium");
    expect(
      planningChatRequestSchema.parse({
        projectId: "project",
        prompt: "Plan changes"
      }).background
    ).toBe(false);
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
        ],
          codingAgents: [
            {
              mode: "small",
            provider: "fake",
            model: "fake-small",
            parallelLimit: 1,
            apiKeySource: { type: "env", value: "" },
              systemPromptSource: { type: "manual", value: "Small scoped coding." }
            }
          ],
          reviewAgents: [
            {
              mode: "small",
              provider: "fake",
              model: "fake-review-small",
              parallelLimit: 1,
              apiKeySource: { type: "env", value: "" },
              systemPromptSource: { type: "manual", value: "Small scoped review." }
            }
          ],
          scanningAgents: [
          {
            mode: "local",
            provider: "fake",
            model: "fake-local",
            parallelLimit: 8,
            apiKeySource: { type: "env", value: "" },
            systemPromptSource: { type: "manual", value: "Local scan." }
          }
        ]
      }).scanningAgents[0].mode
    ).toBe("local");
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
        extensions: {
          availablePackages: AVAILABLE_EXTENSION_PACKAGES,
          enabledPackageIds: [],
          configs: {}
        },
        agents: [],
          codingAgents: [
            {
              mode: "medium",
            provider: "fake",
            model: "fake-medium",
            parallelLimit: 2,
            apiKeySource: { type: "env", value: "" },
            systemPromptSource: { type: "manual", value: "Medium scoped coding." },
            apiKeyConfigured: false,
              systemPromptConfigured: true
            }
          ],
          reviewAgents: [
            {
              mode: "large",
              provider: "fake",
              model: "fake-review-large",
              parallelLimit: 2,
              apiKeySource: { type: "env", value: "" },
              systemPromptSource: { type: "manual", value: "Large scoped review." },
              apiKeyConfigured: false,
              systemPromptConfigured: true
            }
          ],
          scanningAgents: [
          {
            mode: "global",
            provider: "fake",
            model: "fake-global",
            parallelLimit: 1,
            apiKeySource: { type: "env", value: "" },
            systemPromptSource: { type: "manual", value: "Global scan." },
            apiKeyConfigured: false,
            systemPromptConfigured: true
          }
        ]
      }).scanningAgents[0].mode
    ).toBe("global");
    expect(
      settingsValidationResultSchema.parse({
        ok: false,
        testedAt: "now",
        fieldErrors: { "agents.0.model": "Required" }
      }).fieldErrors["agents.0.model"]
    ).toBe("Required");
    const parsedRun = agentRunSchema.parse({
        id: "run-1",
        projectId: "project",
          agentKind: "coding",
          codingMode: "large",
          reviewMode: null,
          status: "succeeded",
        targetNodeId: "node-1",
        prompt: "Do it",
        response: "Done",
        diff: "diff --git",
        graphPatch: null,
        error: null,
        createdAt: "now",
        updatedAt: "now"
      });
    expect(parsedRun.status).toBe("succeeded");
      expect(parsedRun.baseGraphRevision).toBe(0);
        expect(parsedRun.appliedGraphRevision).toBeNull();
        expect(parsedRun.conflictReason).toBeNull();
      expect(
        reviewAgentRequestSchema.parse({
          projectId: "project",
          runId: "run-1"
        }).mode
      ).toBeUndefined();
      expect(
        reviewAgentRequestSchema.parse({
          projectId: "project",
          runId: "run-1",
          mode: "small"
        }).mode
      ).toBe("small");
      });

    it("accepts block execution metadata and layered coding workflow payloads", () => {
      expect(
        blockExecutionMetadataSchema.parse({
          testScriptDirectory: "tests/generated",
          virtualEnvironment: ".venv",
          workingDirectory: ".",
          setupCommand: "pnpm install",
          testCommand: "pnpm test"
        }).virtualEnvironment
      ).toBe(".venv");
      expect(
        graphNodeSchema.parse({
          id: "function-leaf",
          projectId: "project",
          kind: "function",
          name: "leaf",
          summary: "Leaf function",
          code: { context: "", directory: "src/a.ts", startLine: 1, endLine: 2, language: "typescript" },
          parentId: null,
          attachedToId: null,
          customTypeId: null,
          source: { path: "src/a.ts", startLine: 1, endLine: 2 },
          position: { x: 0, y: 0 },
          size: { width: 200, height: 120 },
          childCount: 0,
          hasChildren: false,
          agentStatus: "planning",
          gitStatus: null,
          tags: [],
          createdAt: "now",
          updatedAt: "now"
        }).execution.testCommand
      ).toBeNull();
      expect(
        codeProposalArtifactManifestSchema.parse({
          testScriptDirectory: "tests/generated",
          scripts: [{ relativePath: "leaf.test.ts", content: "test('leaf', () => {})", command: "pnpm test leaf.test.ts" }]
        }).scripts[0].relativePath
      ).toBe("leaf.test.ts");
      const item = codingWorkflowItemSchema.parse({
        id: "item-1",
        workflowId: "workflow-1",
        projectId: "project",
        nodeId: "function-leaf",
        nodeName: "leaf",
        nodeKind: "function",
        layerIndex: 0,
        recommendedMode: "small",
        selectedMode: "small",
        modeReason: "Leaf-local block.",
        status: "pending",
        conflictGroup: "src/a.ts:function-leaf",
        agentRunId: null,
        proposalId: null,
        appliedAt: null,
        createdAt: "now",
        updatedAt: "now"
      });
      expect(item.recommendedMode).toBe("small");
      expect(
        codingWorkflowSchema.parse({
          id: "workflow-1",
          projectId: "project",
          scopeNodeId: "module-a",
          scopeName: "Module A",
          status: "preview",
          currentLayer: 0,
          summary: "One item.",
          createdAt: "now",
          updatedAt: "now",
          items: [item]
        }).items
      ).toHaveLength(1);
      expect(
        codingWorkflowStartRequestSchema.parse({
          projectId: "project",
          scopeNodeId: "module-a",
          modeOverrides: [{ nodeId: "function-leaf", mode: "medium" }]
        }).modeOverrides[0].mode
      ).toBe("medium");
      expect(
        codingWorkflowApplyLayerRequestSchema.parse({
          projectId: "project",
          workflowId: "workflow-1",
          layerIndex: 0
        }).layerIndex
      ).toBe(0);
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
