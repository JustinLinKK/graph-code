import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  boundaryMutationSchema,
  boundaryUpdateSchema,
  codingWorkflowApplyLayerRequestSchema,
  codingWorkflowPreviewRequestSchema,
  codingWorkflowStartRequestSchema,
  codingAgentRequestSchema,
  createCustomBlockTypeSchema,
  customBlockTypeUpdateSchema,
  edgeMutationSchema,
  edgeUpdateSchema,
  githubDevicePollRequestSchema,
  githubDeviceStartRequestSchema,
  graphNodeKindSchema,
  indexStateSchema,
  layoutPatchSchema,
  nodeReuseMutationSchema,
  nodeMutationSchema,
  nodeTypeStyleUpdateSchema,
  nodeUpdateSchema,
  openWorkspaceSchema,
  planningChatRequestSchema,
  reviewAgentRequestSchema,
  scanningAgentRequestSchema,
  workspaceSettingsMutationSchema,
  tagAssignmentSchema
} from "@graphcode/graph-model";
import type { WorkspaceRuntime } from "./workspace";

const projectParamsSchema = z.object({
  projectId: z.string().min(1)
});

const projectRunParamsSchema = projectParamsSchema.extend({
  runId: z.string().min(1)
});

const projectWorkflowParamsSchema = projectParamsSchema.extend({
  workflowId: z.string().min(1)
});

const nodeParamsSchema = z.object({
  nodeId: z.string().min(1)
});

const edgeParamsSchema = z.object({
  edgeId: z.string().min(1)
});

const boundaryParamsSchema = z.object({
  boundaryId: z.string().min(1)
});

const reuseParamsSchema = z.object({
  reuseId: z.string().min(1)
});

const customTypeParamsSchema = z.object({
  customTypeId: z.string().min(1)
});

const nodeKindParamsSchema = z.object({
  nodeKind: graphNodeKindSchema
});

const canvasQuerySchema = z.object({
  rootNodeId: z.string().min(1).optional(),
  depth: z.coerce.number().int().min(0).max(12).optional(),
  includeAttachments: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value !== "false")
});

const autoLayoutBodySchema = z.object({
  scopeNodeId: z.string().min(1).nullable().optional(),
  rootNodeId: z.string().min(1).nullable().optional(),
  includeAttachments: z.boolean().optional()
});

export async function registerApiRoutes(app: FastifyInstance, runtime: WorkspaceRuntime): Promise<void> {
  app.get("/api/health", async () => ({
    ok: true,
    service: "graphcode-local-server"
  }));

  app.post("/api/system/pick-folder", async () => runtime.pickWorkspaceFolder());

  app.get("/api/codex/status", async () => runtime.getCodexStatus());

  app.get("/api/codex/models", async () => runtime.listCodexModels());

  app.post("/api/codex/install", async () => runtime.installCodexCli());

  app.post("/api/codex/auth/start", async () => runtime.startCodexAuth());

  app.get("/api/claude/status", async () => runtime.getClaudeStatus());

  app.get("/api/claude/models", async () => runtime.listClaudeModels());

  app.post("/api/claude/install", async () => runtime.installClaudeCli());

  app.post("/api/claude/auth/start", async () => runtime.startClaudeAuth());

  app.get("/api/projects", async () => runtime.repo().listProjects());

  app.get("/api/v2/projects/:projectId/index-state", async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    return indexStateSchema.parse(runtime.getIndexState(projectId));
  });

  app.delete("/api/v2/projects/:projectId/index-runs/current", async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    return indexStateSchema.parse(runtime.cancelIndex(projectId));
  });

  app.post("/api/workspaces/open", async (request, reply) => {
    const body = openWorkspaceSchema.parse(request.body);
    const result = runtime.openWorkspace(body);
    if (result.status === "missing_graphcode" || result.status === "empty_graphcode") {
      reply.status(409);
    }
    return result;
  });

  app.get("/api/projects/:projectId/hierarchy", async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    return runtime.repo().getHierarchy(projectId);
  });

  app.get("/api/projects/:projectId/canvas", async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const query = canvasQuerySchema.parse(request.query);
    return await runtime.getCanvasGraph({
      projectId,
      rootNodeId: query.rootNodeId ?? null,
      depth: query.depth ?? null,
      includeAttachments: query.includeAttachments
    });
  });

  app.get("/api/projects/:projectId/settings", async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    return runtime.getSettings(projectId);
  });

  app.put("/api/projects/:projectId/settings", async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const body = workspaceSettingsMutationSchema.parse(request.body);
    return runtime.saveSettings(projectId, body);
  });

  app.get("/api/projects/:projectId/agent-runs", async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    return runtime.listAgentRuns(projectId);
  });

  app.post("/api/projects/:projectId/agent-runs/:runId/apply-graph-patch", async (request) => {
    const { projectId, runId } = projectRunParamsSchema.parse(request.params);
    return runtime.applyAgentGraphPatch(projectId, runId);
  });

  app.get("/api/projects/:projectId/git-status", async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const status = await runtime.readGitStatus(projectId);
    return { status };
  });

  app.post("/api/projects/:projectId/github/device/start", async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const body = githubDeviceStartRequestSchema.parse(request.body ?? {});
    return runtime.startGithubDeviceFlow(projectId, body);
  });

  app.post("/api/projects/:projectId/github/device/poll", async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const body = githubDevicePollRequestSchema.parse(request.body ?? {});
    return runtime.pollGithubDeviceFlow(projectId, body);
  });

  app.post("/api/projects/:projectId/github/disconnect", async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    return runtime.disconnectGithub(projectId);
  });

  app.post("/api/agents/planning", async (request) => {
    const body = planningChatRequestSchema.parse(request.body);
    return runtime.runPlanning(body);
  });

  app.post("/api/agents/coding", async (request) => {
    const body = codingAgentRequestSchema.parse(request.body);
    return runtime.runCoding(body);
  });

  app.post("/api/coding-workflows/preview", async (request) => {
    const body = codingWorkflowPreviewRequestSchema.parse(request.body);
    return runtime.previewCodingWorkflow(body);
  });

  app.post("/api/coding-workflows/start", async (request) => {
    const body = codingWorkflowStartRequestSchema.parse(request.body);
    return runtime.startCodingWorkflow(body);
  });

  app.get("/api/projects/:projectId/coding-workflows/:workflowId", async (request) => {
    const { projectId, workflowId } = projectWorkflowParamsSchema.parse(request.params);
    return runtime.getCodingWorkflow(projectId, workflowId);
  });

  app.post("/api/coding-workflows/apply-layer", async (request) => {
    const body = codingWorkflowApplyLayerRequestSchema.parse(request.body);
    return runtime.applyCodingWorkflowLayer(body);
  });

  app.post("/api/agents/review", async (request) => {
    const body = reviewAgentRequestSchema.parse(request.body);
    return runtime.runReview(body);
  });

  app.post("/api/agents/scanning", async (request) => {
    const body = scanningAgentRequestSchema.parse(request.body);
    return runtime.runScanning(body);
  });

  app.post("/api/projects/:projectId/layout/auto", async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const body = autoLayoutBodySchema.parse(request.body ?? {});
    return await runtime.repo().autoLayoutScope({
      projectId,
      scopeNodeId: body.scopeNodeId ?? body.rootNodeId ?? null,
      includeAttachments: body.includeAttachments ?? true
    });
  });

  app.get("/api/projects/:projectId/custom-node-types", async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    return runtime.repo().listCustomBlockTypes(projectId);
  });

  app.post("/api/projects/:projectId/custom-node-types", async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const body = createCustomBlockTypeSchema.parse(request.body);
    return runtime.repo().createCustomBlockType(projectId, body);
  });

  app.patch("/api/custom-node-types/:customTypeId", async (request) => {
    const { customTypeId } = customTypeParamsSchema.parse(request.params);
    const body = customBlockTypeUpdateSchema.parse(request.body);
    return runtime.repo().updateCustomBlockType(customTypeId, body);
  });

  app.patch("/api/projects/:projectId/node-type-styles/:nodeKind", async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const { nodeKind } = nodeKindParamsSchema.parse(request.params);
    const body = nodeTypeStyleUpdateSchema.parse(request.body);
    return runtime.repo().updateNodeTypeStyle(projectId, nodeKind, body);
  });

  app.post("/api/projects/:projectId/nodes", async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const body = nodeMutationSchema.parse(request.body);
    return runtime.repo().createNodeFromMutation(projectId, body);
  });

  app.post("/api/projects/:projectId/node-reuses", async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const body = nodeReuseMutationSchema.parse(request.body);
    return runtime.repo().createNodeReuse(projectId, body);
  });

  app.delete("/api/node-reuses/:reuseId", async (request) => {
    const { reuseId } = reuseParamsSchema.parse(request.params);
    runtime.repo().deleteNodeReuse(reuseId);
    return { ok: true };
  });

  app.post("/api/projects/:projectId/edges", async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const body = edgeMutationSchema.parse(request.body);
    return runtime.repo().createEdgeFromMutation(projectId, body);
  });

  app.patch("/api/edges/:edgeId", async (request) => {
    const { edgeId } = edgeParamsSchema.parse(request.params);
    const body = edgeUpdateSchema.parse(request.body);
    return runtime.repo().updateEdge(edgeId, body);
  });

  app.patch("/api/edges/:edgeId/tags", async (request) => {
    const { edgeId } = edgeParamsSchema.parse(request.params);
    const body = tagAssignmentSchema.parse(request.body);
    return runtime.repo().setEdgeTags(edgeId, body);
  });

  app.delete("/api/edges/:edgeId", async (request) => {
    const { edgeId } = edgeParamsSchema.parse(request.params);
    runtime.repo().deleteEdge(edgeId);
    return { ok: true };
  });

  app.post("/api/projects/:projectId/boundaries", async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const body = boundaryMutationSchema.parse(request.body);
    return runtime.repo().createBoundary(projectId, body);
  });

  app.patch("/api/boundaries/:boundaryId", async (request) => {
    const { boundaryId } = boundaryParamsSchema.parse(request.params);
    const body = boundaryUpdateSchema.parse(request.body);
    return runtime.repo().updateBoundary(boundaryId, body);
  });

  app.patch("/api/boundaries/:boundaryId/tags", async (request) => {
    const { boundaryId } = boundaryParamsSchema.parse(request.params);
    const body = tagAssignmentSchema.parse(request.body);
    return runtime.repo().setBoundaryTags(boundaryId, body);
  });

  app.delete("/api/boundaries/:boundaryId", async (request) => {
    const { boundaryId } = boundaryParamsSchema.parse(request.params);
    runtime.repo().deleteBoundary(boundaryId);
    return { ok: true };
  });

  app.get("/api/nodes/:nodeId", async (request) => {
    const { nodeId } = nodeParamsSchema.parse(request.params);
    return runtime.repo().getNodeDetail(nodeId);
  });

  app.patch("/api/nodes/:nodeId", async (request) => {
    const { nodeId } = nodeParamsSchema.parse(request.params);
    const body = nodeUpdateSchema.parse(request.body);
    return runtime.repo().updateNode(nodeId, body);
  });

  app.patch("/api/nodes/:nodeId/tags", async (request) => {
    const { nodeId } = nodeParamsSchema.parse(request.params);
    const body = tagAssignmentSchema.parse(request.body);
    return runtime.repo().setNodeTags(nodeId, body);
  });

  app.patch("/api/nodes/:nodeId/layout", async (request) => {
    const { nodeId } = nodeParamsSchema.parse(request.params);
    const patch = layoutPatchSchema.parse(request.body);
    return runtime.repo().updateNodeLayout(nodeId, patch);
  });

  app.post("/api/dev/seed-self", async () => runtime.seedSelfGraph());
}
