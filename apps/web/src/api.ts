import type {
  AgentRun,
  BoundaryMutation,
  BoundaryUpdate,
  CanvasGraph,
  CodingWorkflow,
  CodingWorkflowApplyLayerRequest,
  CodingWorkflowControlRequest,
  CodingAgentRequest,
  CodeProposalApplyRequest,
  CodingWorkflowPreviewRequest,
  CodingWorkflowStartRequest,
  ClaudeAuthStartResult,
  ClaudeCliStatus,
  ClaudeInstallResult,
  ClaudeModelInfo,
  CodexAuthStartResult,
  CodexCliStatus,
  CodexInstallResult,
  CodexModelInfo,
  CreateCustomBlockType,
  CustomBlockType,
  CustomBlockTypeUpdate,
  EdgeMutation,
  EdgeUpdate,
  GraphBoundary,
  GraphEdge,
  GithubDevicePollRequest,
  GithubDevicePollResponse,
  GithubDeviceStartRequest,
  GithubDeviceStartResponse,
  GraphNode,
  GraphNodeReuse,
  HierarchyNode,
  IndexState,
  FolderPickerResult,
  LayoutPatch,
  NodeDetail,
  NodeReuseMutation,
  NodeMutation,
  NodeUpdate,
  NodeTypeStyle,
  NodeTypeStyleUpdate,
  OpenWorkspaceResult,
  PlanningChatRequest,
  Project,
  ReviewAgentRequest,
  ScanningAgentRequest,
  BlankWorkspaceInitialization,
  WorkspaceCreationMode,
  WorkspaceInitialization,
  WorkspaceSettings,
  WorkspaceSettingsMutation,
  SettingsValidationResult,
  TagAssignment
} from "@graphcode/graph-model";
import { indexStateSchema } from "@graphcode/graph-model";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

function withJsonRequestHeaders(options: RequestInit = {}): RequestInit {
  const headers = new Headers(options.headers);
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (options.body !== undefined && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return {
    ...options,
    headers
  };
}

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) {
    return `Request failed: ${response.status}`;
  }
  try {
    const parsed = JSON.parse(text) as { message?: unknown; error?: unknown };
    if (typeof parsed.message === "string") {
      return parsed.message;
    }
    if (typeof parsed.error === "string") {
      return parsed.error;
    }
  } catch {
    // Fall back to the raw response text below.
  }
  return text;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, withJsonRequestHeaders(options));

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json() as Promise<T>;
}

export async function listProjects(): Promise<Project[]> {
  return request<Project[]>("/api/projects");
}

export async function openWorkspace(
  rootPath: string,
  createIfMissing = false,
  initialization?: WorkspaceInitialization | BlankWorkspaceInitialization,
  creationMode?: WorkspaceCreationMode
): Promise<OpenWorkspaceResult> {
  const response = await fetch(`${API_BASE}/api/workspaces/open`, withJsonRequestHeaders({
    method: "POST",
    body: JSON.stringify({ rootPath, createIfMissing, initialization, creationMode })
  }));
  if (response.status === 409) {
    return response.json() as Promise<OpenWorkspaceResult>;
  }
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return response.json() as Promise<OpenWorkspaceResult>;
}

export async function pickWorkspaceFolder(): Promise<FolderPickerResult> {
  return request<FolderPickerResult>("/api/system/pick-folder", {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function getHierarchy(projectId: string): Promise<HierarchyNode[]> {
  return request<HierarchyNode[]>(`/api/projects/${projectId}/hierarchy`);
}

export async function getIndexState(projectId: string): Promise<IndexState> {
  return indexStateSchema.parse(await request<unknown>(`/api/v2/projects/${projectId}/index-state`));
}

export async function cancelCurrentIndexRun(projectId: string): Promise<IndexState> {
  return indexStateSchema.parse(await request<unknown>(`/api/v2/projects/${projectId}/index-runs/current`, { method: "DELETE" }));
}

export async function getCanvasGraph(
  projectId: string,
  options: { rootNodeId?: string | null; depth?: number; includeAttachments?: boolean } = {}
): Promise<CanvasGraph> {
  const params = new URLSearchParams();
  if (options.rootNodeId) {
    params.set("rootNodeId", options.rootNodeId);
  }
  if (options.depth !== undefined) {
    params.set("depth", String(options.depth));
  }
  params.set("includeAttachments", String(options.includeAttachments ?? true));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return request<CanvasGraph>(`/api/projects/${projectId}/canvas${suffix}`);
}

export async function getWorkspaceSettings(projectId: string): Promise<WorkspaceSettings> {
  return request<WorkspaceSettings>(`/api/projects/${projectId}/settings`);
}

export async function saveWorkspaceSettings(
  projectId: string,
  settings: WorkspaceSettingsMutation
): Promise<{ settings: WorkspaceSettings; validation: SettingsValidationResult }> {
  return request<{ settings: WorkspaceSettings; validation: SettingsValidationResult }>(`/api/projects/${projectId}/settings`, {
    method: "PUT",
    body: JSON.stringify(settings)
  });
}

export async function getCodexStatus(): Promise<CodexCliStatus> {
  return request<CodexCliStatus>("/api/codex/status");
}

export async function getCodexModels(): Promise<CodexModelInfo[]> {
  return request<CodexModelInfo[]>("/api/codex/models");
}

export async function installCodexCli(): Promise<CodexInstallResult> {
  return request<CodexInstallResult>("/api/codex/install", {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function startCodexAuth(): Promise<CodexAuthStartResult> {
  return request<CodexAuthStartResult>("/api/codex/auth/start", {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function getClaudeStatus(): Promise<ClaudeCliStatus> {
  return request<ClaudeCliStatus>("/api/claude/status");
}

export async function getClaudeModels(): Promise<ClaudeModelInfo[]> {
  return request<ClaudeModelInfo[]>("/api/claude/models");
}

export async function installClaudeCli(): Promise<ClaudeInstallResult> {
  return request<ClaudeInstallResult>("/api/claude/install", {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function startClaudeAuth(): Promise<ClaudeAuthStartResult> {
  return request<ClaudeAuthStartResult>("/api/claude/auth/start", {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function listAgentRuns(projectId: string): Promise<AgentRun[]> {
  return request<AgentRun[]>(`/api/projects/${projectId}/agent-runs`);
}

export async function applyAgentGraphPatch(projectId: string, runId: string): Promise<AgentRun> {
  return request<AgentRun>(`/api/projects/${projectId}/agent-runs/${runId}/apply-graph-patch`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function getGitStatus(projectId: string): Promise<{ status: string }> {
  return request<{ status: string }>(`/api/projects/${projectId}/git-status`);
}

export async function startGithubDeviceFlow(projectId: string, input: GithubDeviceStartRequest): Promise<GithubDeviceStartResponse> {
  return request<GithubDeviceStartResponse>(`/api/projects/${projectId}/github/device/start`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function pollGithubDeviceFlow(projectId: string, input: GithubDevicePollRequest): Promise<GithubDevicePollResponse> {
  return request<GithubDevicePollResponse>(`/api/projects/${projectId}/github/device/poll`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function disconnectGithub(projectId: string): Promise<WorkspaceSettings> {
  return request<WorkspaceSettings>(`/api/projects/${projectId}/github/disconnect`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function runPlanningAgent(input: PlanningChatRequest): Promise<AgentRun> {
  return request<AgentRun>("/api/agents/planning", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function runCodingAgent(input: CodingAgentRequest): Promise<AgentRun> {
  return request<AgentRun>("/api/agents/coding", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function applyCodeProposal(input: CodeProposalApplyRequest): Promise<AgentRun> {
  return request<AgentRun>("/api/code-proposals/apply", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function previewCodingWorkflow(input: CodingWorkflowPreviewRequest): Promise<CodingWorkflow> {
  return request<CodingWorkflow>("/api/coding-workflows/preview", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function startCodingWorkflow(input: CodingWorkflowStartRequest): Promise<CodingWorkflow> {
  return request<CodingWorkflow>("/api/coding-workflows/start", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function getCodingWorkflow(projectId: string, workflowId: string): Promise<CodingWorkflow> {
  return request<CodingWorkflow>(`/api/projects/${projectId}/coding-workflows/${workflowId}`);
}

export async function applyCodingWorkflowLayer(input: CodingWorkflowApplyLayerRequest): Promise<CodingWorkflow> {
  return request<CodingWorkflow>("/api/coding-workflows/apply-layer", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function controlCodingWorkflow(input: CodingWorkflowControlRequest): Promise<CodingWorkflow> {
  return request<CodingWorkflow>("/api/coding-workflows/control", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function runReviewAgent(input: ReviewAgentRequest): Promise<AgentRun> {
  return request<AgentRun>("/api/agents/review", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function runScanningAgent(input: ScanningAgentRequest): Promise<AgentRun> {
  return request<AgentRun>("/api/agents/scanning", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function getNodeDetail(nodeId: string): Promise<NodeDetail> {
  return request<NodeDetail>(`/api/nodes/${nodeId}`);
}

export async function createNode(projectId: string, node: NodeMutation): Promise<GraphNode> {
  return request<GraphNode>(`/api/projects/${projectId}/nodes`, {
    method: "POST",
    body: JSON.stringify(node)
  });
}

export async function updateNode(nodeId: string, node: NodeUpdate): Promise<GraphNode> {
  return request<GraphNode>(`/api/nodes/${nodeId}`, {
    method: "PATCH",
    body: JSON.stringify(node)
  });
}

export async function updateNodeTags(nodeId: string, input: TagAssignment): Promise<GraphNode> {
  return request<GraphNode>(`/api/nodes/${nodeId}/tags`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export async function createNodeReuse(projectId: string, input: NodeReuseMutation): Promise<GraphNodeReuse> {
  return request<GraphNodeReuse>(`/api/projects/${projectId}/node-reuses`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function createEdge(projectId: string, edge: EdgeMutation): Promise<GraphEdge> {
  return request<GraphEdge>(`/api/projects/${projectId}/edges`, {
    method: "POST",
    body: JSON.stringify(edge)
  });
}

export async function updateEdge(edgeId: string, edge: EdgeUpdate): Promise<GraphEdge> {
  return request<GraphEdge>(`/api/edges/${edgeId}`, {
    method: "PATCH",
    body: JSON.stringify(edge)
  });
}

export async function updateEdgeTags(edgeId: string, input: TagAssignment): Promise<GraphEdge> {
  return request<GraphEdge>(`/api/edges/${edgeId}/tags`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export async function deleteEdge(edgeId: string): Promise<void> {
  await request(`/api/edges/${edgeId}`, {
    method: "DELETE"
  });
}

export async function createBoundary(projectId: string, boundary: BoundaryMutation): Promise<GraphBoundary> {
  return request<GraphBoundary>(`/api/projects/${projectId}/boundaries`, {
    method: "POST",
    body: JSON.stringify(boundary)
  });
}

export async function updateBoundary(boundaryId: string, boundary: BoundaryUpdate): Promise<GraphBoundary> {
  return request<GraphBoundary>(`/api/boundaries/${boundaryId}`, {
    method: "PATCH",
    body: JSON.stringify(boundary)
  });
}

export async function updateBoundaryTags(boundaryId: string, input: TagAssignment): Promise<GraphBoundary> {
  return request<GraphBoundary>(`/api/boundaries/${boundaryId}/tags`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export async function deleteBoundary(boundaryId: string): Promise<void> {
  await request(`/api/boundaries/${boundaryId}`, {
    method: "DELETE"
  });
}

export async function createCustomBlockType(projectId: string, input: CreateCustomBlockType): Promise<CustomBlockType> {
  return request<CustomBlockType>(`/api/projects/${projectId}/custom-node-types`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function updateCustomBlockType(customTypeId: string, input: CustomBlockTypeUpdate): Promise<CustomBlockType> {
  return request<CustomBlockType>(`/api/custom-node-types/${customTypeId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export async function updateNodeTypeStyle(projectId: string, nodeKind: string, input: NodeTypeStyleUpdate): Promise<NodeTypeStyle> {
  return request<NodeTypeStyle>(`/api/projects/${projectId}/node-type-styles/${nodeKind}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export async function updateNodeLayout(nodeId: string, patch: LayoutPatch): Promise<void> {
  await request(`/api/nodes/${nodeId}/layout`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  });
}

export async function autoLayoutCanvas(
  projectId: string,
  options: { scopeNodeId?: string | null; includeAttachments?: boolean } = {}
): Promise<CanvasGraph> {
  return request<CanvasGraph>(`/api/projects/${projectId}/layout/auto`, {
    method: "POST",
    body: JSON.stringify({
      scopeNodeId: options.scopeNodeId ?? null,
      includeAttachments: options.includeAttachments ?? true
    })
  });
}

export async function seedSelfWorkspace(): Promise<Project> {
  return request<Project>("/api/dev/seed-self", {
    method: "POST"
  });
}
