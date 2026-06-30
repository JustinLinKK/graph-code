import { z } from "zod";

export const DOMAIN_NODE_KINDS = ["framework", "module", "website", "ui_component", "function", "object"] as const;
export const BASIC_NODE_KINDS = [
  "dependency",
  "input",
  "output",
  "process",
  "format",
  "environment",
  "config",
  "secret",
  "command",
  "file",
  "database",
  "api",
  "event",
  "artifact",
  "custom"
] as const;
export const ATTACHMENT_NODE_KINDS = BASIC_NODE_KINDS;
export const GRAPH_NODE_KINDS = [...DOMAIN_NODE_KINDS, ...ATTACHMENT_NODE_KINDS] as const;
export const GRAPH_EDGE_KINDS = ["calls", "imports", "uses", "owns", "impacts", "flows", "describes_format"] as const;
export const EDGE_POINTING_DIRECTIONS = ["source_to_target", "target_to_source", "bidirectional"] as const;
export const BASIC_DETAIL_NODE_KINDS = ["environment", "config", "secret", "command", "file", "database", "api", "event", "artifact", "custom"] as const;
export const DEPENDENCY_KINDS = [
  "package",
  "runtime",
  "service",
  "env",
  "file",
  "cli",
  "database",
  "external_system",
  "tool"
] as const;
export const IO_KINDS = ["api", "file", "user", "queue", "env", "artifact", "log", "database", "service"] as const;
export const PROCESS_KINDS = ["transform", "validate", "route", "persist", "render", "orchestrate", "analyze", "condition"] as const;
export const FORMAT_KINDS = ["type", "schema", "mime", "protocol", "artifact", "event"] as const;
export const LANGUAGE_TYPES = [
  "unknown",
  "typescript",
  "javascript",
  "python",
  "java",
  "go",
  "rust",
  "c",
  "cpp",
  "csharp",
  "kotlin",
  "swift",
  "ruby",
  "php",
  "sql",
  "shell",
  "json",
  "yaml",
  "markdown",
  "html",
  "css",
  "other"
] as const;
export const AGENT_STATUSES = ["none", "planning", "coded", "reviewed", "implemented", "bugged"] as const;
export const GIT_WORKTREE_STATUSES = ["untracked", "pending", "staged", "committed"] as const;
export const GIT_CHANGE_STATUSES = ["new", "modified", "deleted"] as const;
export const AGENT_KINDS = ["planning", "coding", "review", "scanning"] as const;
export const AGENT_RUN_STATUSES = ["queued", "running", "succeeded", "failed"] as const;
export const AGENT_PROVIDERS = ["fake", "claudecode", "openai", "gemini", "openrouter"] as const;
export const SETTINGS_THEME_MODES = ["light", "dark", "system"] as const;
export const SECRET_SOURCE_TYPES = ["manual", "file", "env"] as const;
export const PROMPT_SOURCE_TYPES = ["manual", "file"] as const;
export const GRAPH_PATCH_ENTITY_TYPES = ["node", "edge", "boundary"] as const;
export const WORKSPACE_CREATION_MODES = ["scan", "blank"] as const;

export const graphNodeKindSchema = z.enum(GRAPH_NODE_KINDS);
export const domainNodeKindSchema = z.enum(DOMAIN_NODE_KINDS);
export const basicNodeKindSchema = z.enum(BASIC_NODE_KINDS);
export const attachmentNodeKindSchema = z.enum(ATTACHMENT_NODE_KINDS);
export const graphEdgeKindSchema = z.enum(GRAPH_EDGE_KINDS);
export const edgePointingDirectionSchema = z.enum(EDGE_POINTING_DIRECTIONS);
export const dependencyKindSchema = z.enum(DEPENDENCY_KINDS);
export const ioKindSchema = z.enum(IO_KINDS);
export const processKindSchema = z.enum(PROCESS_KINDS);
export const formatKindSchema = z.enum(FORMAT_KINDS);
export const basicDetailNodeKindSchema = z.enum(BASIC_DETAIL_NODE_KINDS);
export const languageTypeSchema = z.enum(LANGUAGE_TYPES);
export const agentStatusSchema = z.enum(AGENT_STATUSES);
export const gitWorktreeStatusSchema = z.enum(GIT_WORKTREE_STATUSES);
export const gitChangeStatusSchema = z.enum(GIT_CHANGE_STATUSES);
export const agentKindSchema = z.enum(AGENT_KINDS);
export const agentRunStatusSchema = z.enum(AGENT_RUN_STATUSES);
export const agentProviderSchema = z.enum(AGENT_PROVIDERS);
export const settingsThemeModeSchema = z.enum(SETTINGS_THEME_MODES);
export const secretSourceTypeSchema = z.enum(SECRET_SOURCE_TYPES);
export const promptSourceTypeSchema = z.enum(PROMPT_SOURCE_TYPES);
export const graphPatchEntityTypeSchema = z.enum(GRAPH_PATCH_ENTITY_TYPES);
export const workspaceCreationModeSchema = z.enum(WORKSPACE_CREATION_MODES);

export type GraphNodeKind = z.infer<typeof graphNodeKindSchema>;
export type DomainNodeKind = z.infer<typeof domainNodeKindSchema>;
export type BasicNodeKind = z.infer<typeof basicNodeKindSchema>;
export type AttachmentNodeKind = z.infer<typeof attachmentNodeKindSchema>;
export type GraphEdgeKind = z.infer<typeof graphEdgeKindSchema>;
export type EdgePointingDirection = z.infer<typeof edgePointingDirectionSchema>;
export type DependencyKind = z.infer<typeof dependencyKindSchema>;
export type IoKind = z.infer<typeof ioKindSchema>;
export type ProcessKind = z.infer<typeof processKindSchema>;
export type FormatKind = z.infer<typeof formatKindSchema>;
export type BasicDetailNodeKind = z.infer<typeof basicDetailNodeKindSchema>;
export type LanguageType = z.infer<typeof languageTypeSchema>;
export type AgentStatus = z.infer<typeof agentStatusSchema>;
export type GitWorktreeStatus = z.infer<typeof gitWorktreeStatusSchema>;
export type GitChangeStatus = z.infer<typeof gitChangeStatusSchema>;
export type AgentKind = z.infer<typeof agentKindSchema>;
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;
export type AgentProvider = z.infer<typeof agentProviderSchema>;
export type SettingsThemeMode = z.infer<typeof settingsThemeModeSchema>;
export type SecretSourceType = z.infer<typeof secretSourceTypeSchema>;
export type PromptSourceType = z.infer<typeof promptSourceTypeSchema>;
export type GraphPatchEntityType = z.infer<typeof graphPatchEntityTypeSchema>;
export type WorkspaceCreationMode = z.infer<typeof workspaceCreationModeSchema>;

export const positionSchema = z.object({
  x: z.number(),
  y: z.number()
});

export const sizeSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive()
});

export const sourceRangeSchema = z.object({
  path: z.string().nullable(),
  startLine: z.number().int().positive().nullable(),
  endLine: z.number().int().positive().nullable()
});

export const codeMetadataSchema = z.object({
  context: z.string(),
  directory: z.string().nullable(),
  startLine: z.number().int().positive().nullable(),
  endLine: z.number().int().positive().nullable(),
  language: languageTypeSchema
});

export const styleColorSchema = z.string().min(1);

export const graphTagSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  color: styleColorSchema,
  createdAt: z.string(),
  updatedAt: z.string()
});

export const tagMutationSchema = z.object({
  name: z.string().min(1),
  color: styleColorSchema.optional()
});

export const tagAssignmentSchema = z.object({
  tags: z.array(tagMutationSchema).max(24)
});

export const graphNodeReuseSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  scopeNodeId: z.string(),
  nodeId: z.string(),
  label: z.string(),
  context: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const nodeReuseMutationSchema = z.object({
  scopeNodeId: z.string().min(1),
  nodeId: z.string().min(1),
  label: z.string().optional(),
  context: z.string().optional()
});

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  rootPath: z.string(),
  description: z.string(),
  scanningInstructions: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const gitStatusInfoSchema = z.object({
  worktree: gitWorktreeStatusSchema,
  change: gitChangeStatusSchema.nullable()
});

export const graphNodeSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  kind: graphNodeKindSchema,
  name: z.string(),
  summary: z.string(),
  code: codeMetadataSchema,
  parentId: z.string().nullable(),
  attachedToId: z.string().nullable(),
  customTypeId: z.string().nullable(),
  source: sourceRangeSchema,
  position: positionSchema,
  size: sizeSchema,
  childCount: z.number().int().nonnegative(),
  hasChildren: z.boolean(),
  agentStatus: agentStatusSchema.default("none"),
  gitStatus: gitStatusInfoSchema.nullable().default(null),
  tags: z.array(graphTagSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const graphEdgeSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  kind: graphEdgeKindSchema,
  sourceNodeId: z.string(),
  targetNodeId: z.string(),
  label: z.string().nullable(),
  codeContext: z.string(),
  color: styleColorSchema,
  animated: z.boolean(),
  pointingEnabled: z.boolean().default(true),
  pointingDirection: edgePointingDirectionSchema.default("source_to_target"),
  agentStatus: agentStatusSchema.default("none"),
  gitStatus: gitStatusInfoSchema.nullable().default(null),
  tags: z.array(graphTagSchema).default([]),
  createdAt: z.string()
});

export const graphBoundarySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  scopeNodeId: z.string(),
  name: z.string(),
  summary: z.string(),
  codeContext: z.string(),
  color: styleColorSchema,
  position: positionSchema,
  size: sizeSchema,
  memberNodeIds: z.array(z.string()),
  memberCount: z.number().int().nonnegative(),
  tags: z.array(graphTagSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const nodeTypeStyleSchema = z.object({
  projectId: z.string(),
  nodeKind: graphNodeKindSchema,
  color: styleColorSchema,
  createdAt: z.string(),
  updatedAt: z.string()
});

export const hierarchyBoundaryLabelSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: styleColorSchema
});

export const hierarchyBoundaryGroupSchema = z.object({
  id: z.string(),
  scopeNodeId: z.string(),
  name: z.string(),
  summary: z.string(),
  color: styleColorSchema,
  memberNodeIds: z.array(z.string()),
  memberNames: z.array(z.string())
});

export const dependencyDetailsSchema = z.object({
  nodeId: z.string(),
  dependencyKind: dependencyKindSchema,
  spec: z.string(),
  version: z.string().nullable(),
  required: z.boolean(),
  notes: z.string()
});

export const ioDetailsSchema = z.object({
  nodeId: z.string(),
  ioKind: ioKindSchema,
  channel: z.string(),
  schemaHint: z.string().nullable(),
  notes: z.string()
});

export const processDetailsSchema = z.object({
  nodeId: z.string(),
  processKind: processKindSchema,
  trigger: z.string().nullable(),
  notes: z.string()
});

export const formatDetailsSchema = z.object({
  nodeId: z.string(),
  formatKind: formatKindSchema,
  spec: z.string(),
  example: z.string().nullable(),
  notes: z.string()
});

export const basicBlockDetailsSchema = z.object({
  nodeId: z.string(),
  basicKind: basicDetailNodeKindSchema,
  key: z.string(),
  valueHint: z.string().nullable(),
  required: z.boolean(),
  notes: z.string()
});

export const layoutPatchSchema = z.object({
  scopeNodeId: z.string(),
  position: positionSchema,
  size: sizeSchema
});

export const customBlockTypeSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  description: z.string(),
  color: z.string(),
  icon: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const createCustomBlockTypeSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  color: z.string().min(1).optional(),
  icon: z.string().min(1).optional()
});

export const customBlockTypeUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  color: styleColorSchema.optional(),
  icon: z.string().min(1).optional()
});

export const nodeTypeStyleUpdateSchema = z.object({
  color: styleColorSchema
});

export const nodeMutationSchema = z.object({
  kind: graphNodeKindSchema,
  name: z.string().min(1),
  summary: z.string().optional(),
  codeContext: z.string().optional(),
  codeDirectory: z.string().nullable().optional(),
  codeStartLine: z.number().int().positive().nullable().optional(),
  codeEndLine: z.number().int().positive().nullable().optional(),
  language: languageTypeSchema.optional(),
  parentId: z.string().nullable().optional(),
  attachedToId: z.string().nullable().optional(),
  customTypeId: z.string().nullable().optional(),
  position: positionSchema.optional(),
  size: sizeSchema.optional()
});

export const nodeUpdateSchema = nodeMutationSchema.partial().extend({
  kind: graphNodeKindSchema.optional()
});

export const edgeMutationSchema = z.object({
  kind: graphEdgeKindSchema,
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  label: z.string().nullable().optional(),
  codeContext: z.string().optional(),
  color: styleColorSchema.optional(),
  animated: z.boolean().optional(),
  pointingEnabled: z.boolean().optional(),
  pointingDirection: edgePointingDirectionSchema.optional()
});

export const edgeUpdateSchema = edgeMutationSchema.partial().extend({
  kind: graphEdgeKindSchema.optional()
});

export const graphStatusPatchSchema = z.object({
  entityType: graphPatchEntityTypeSchema,
  entityId: z.string().min(1),
  status: agentStatusSchema,
  note: z.string().optional(),
  agentRunId: z.string().nullable().optional()
});

export const secretSourceSchema = z.object({
  type: secretSourceTypeSchema,
  value: z.string().optional()
});

export const promptSourceSchema = z.object({
  type: promptSourceTypeSchema,
  value: z.string().optional()
});

export const agentConfigSchema = z.object({
  agentKind: agentKindSchema,
  provider: agentProviderSchema,
  model: z.string(),
  parallelLimit: z.number().int().min(1).max(64),
  apiKeySource: secretSourceSchema,
  systemPromptSource: promptSourceSchema
});

export const agentConfigViewSchema = agentConfigSchema.extend({
  apiKeyConfigured: z.boolean(),
  systemPromptConfigured: z.boolean()
});

export const generalSettingsSchema = z.object({
  theme: settingsThemeModeSchema
});

export const githubAuthStateSchema = z.object({
  connected: z.boolean(),
  username: z.string().nullable(),
  tokenConfigured: z.boolean(),
  scopes: z.array(z.string()).default([]),
  connectedAt: z.string().nullable(),
  lastValidatedAt: z.string().nullable()
});

export const githubIntegrationSettingsMutationSchema = z.object({
  enabled: z.boolean(),
  repository: z.string(),
  clientId: z.string()
});

export const githubIntegrationSettingsSchema = githubIntegrationSettingsMutationSchema.extend({
  auth: githubAuthStateSchema
});

export const agentAutomationSettingsSchema = z.object({
  autoReviewAfterCoding: z.boolean()
});

export const workspaceSettingsSchema = z.object({
  general: generalSettingsSchema,
  github: githubIntegrationSettingsSchema,
  automation: agentAutomationSettingsSchema,
  agents: z.array(agentConfigViewSchema)
});

export const workspaceSettingsMutationSchema = z.object({
  general: generalSettingsSchema,
  github: githubIntegrationSettingsMutationSchema,
  automation: agentAutomationSettingsSchema,
  agents: z.array(agentConfigSchema)
});

export const githubDeviceStartRequestSchema = z.object({
  clientId: z.string().optional(),
  repository: z.string().optional()
});

export const githubDeviceStartResponseSchema = z.object({
  deviceCode: z.string(),
  userCode: z.string(),
  verificationUri: z.string(),
  expiresIn: z.number().int().positive(),
  interval: z.number().int().positive(),
  message: z.string()
});

export const githubDevicePollRequestSchema = z.object({
  deviceCode: z.string().min(1),
  clientId: z.string().optional(),
  repository: z.string().optional()
});

export const githubDevicePollResponseSchema = z.object({
  status: z.enum(["pending", "connected", "expired", "failed"]),
  message: z.string(),
  settings: workspaceSettingsSchema.optional()
});

export const settingsValidationResultSchema = z.object({
  ok: z.boolean(),
  testedAt: z.string(),
  fieldErrors: z.record(z.string())
});

export const planningChatRequestSchema = z.object({
  projectId: z.string().min(1),
  prompt: z.string().min(1),
  scopeNodeId: z.string().nullable().optional()
});

export const codingAgentRequestSchema = z.object({
  projectId: z.string().min(1),
  nodeId: z.string().min(1),
  prompt: z.string().optional()
});

export const reviewAgentRequestSchema = z.object({
  projectId: z.string().min(1),
  runId: z.string().min(1)
});

export const workspaceInitializationSchema = z.object({
  projectName: z.string().trim().min(1),
  projectDescription: z.string().trim().min(1),
  scanningInstructions: z.string().trim().min(1)
});

export const blankWorkspaceInitializationSchema = z.object({
  projectName: z.string().trim().min(1),
  projectDescription: z.string().trim().optional().default("")
});

export const scanningAgentRequestSchema = z.object({
  projectId: z.string().min(1),
  rootPath: z.string().optional(),
  projectDescription: z.string().optional(),
  scanningInstructions: z.string().optional()
});

export const graphPatchOperationSchema = z.object({
  entityType: graphPatchEntityTypeSchema,
  entityId: z.string().min(1),
  action: z.enum(["create", "update"]),
  fields: z.record(z.unknown()).default({})
});

export const graphPatchSchema = z.object({
  summary: z.string(),
  operations: z.array(graphPatchOperationSchema).default([])
});

export const agentRunSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  agentKind: agentKindSchema,
  status: agentRunStatusSchema,
  targetNodeId: z.string().nullable(),
  prompt: z.string(),
  response: z.string(),
  diff: z.string(),
  graphPatch: graphPatchSchema.nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const agentMessageSchema = z.object({
  id: z.string(),
  runId: z.string(),
  role: z.enum(["user", "assistant", "tool", "system"]),
  content: z.string(),
  createdAt: z.string()
});

export const graphStatusHistorySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  entityType: graphPatchEntityTypeSchema,
  entityId: z.string(),
  status: agentStatusSchema,
  note: z.string(),
  agentRunId: z.string().nullable(),
  createdAt: z.string()
});

export const boundaryMutationSchema = z.object({
  scopeNodeId: z.string().min(1),
  name: z.string().min(1),
  summary: z.string().optional(),
  codeContext: z.string().optional(),
  color: styleColorSchema.optional(),
  position: positionSchema,
  size: sizeSchema
});

export const boundaryUpdateSchema = boundaryMutationSchema.partial().extend({
  scopeNodeId: z.string().min(1).optional()
});

export const openWorkspaceSchema = z.object({
  rootPath: z.string().min(1),
  createIfMissing: z.boolean().optional(),
  creationMode: workspaceCreationModeSchema.optional(),
  initialization: z.union([workspaceInitializationSchema, blankWorkspaceInitializationSchema]).optional()
});

export type OpenWorkspaceResult =
  | {
      status: "opened" | "created";
      project: Project;
      graphcodePath: string;
	    }
	  | {
	      status: "missing_graphcode" | "empty_graphcode";
	      rootPath: string;
	      graphcodePath: string;
	      message: string;
    };

export type Project = z.infer<typeof projectSchema>;
export type WorkspaceInitialization = z.infer<typeof workspaceInitializationSchema>;
export type BlankWorkspaceInitialization = z.infer<typeof blankWorkspaceInitializationSchema>;
export type OpenWorkspaceRequest = z.infer<typeof openWorkspaceSchema>;
export type GitStatusInfo = z.infer<typeof gitStatusInfoSchema>;
export type GraphNode = z.infer<typeof graphNodeSchema>;
export type GraphEdge = z.infer<typeof graphEdgeSchema>;
export type GraphBoundary = z.infer<typeof graphBoundarySchema>;
export type GraphTag = z.infer<typeof graphTagSchema>;
export type TagMutation = z.infer<typeof tagMutationSchema>;
export type TagAssignment = z.infer<typeof tagAssignmentSchema>;
export type GraphNodeReuse = z.infer<typeof graphNodeReuseSchema>;
export type NodeReuseMutation = z.infer<typeof nodeReuseMutationSchema>;
export type DependencyDetails = z.infer<typeof dependencyDetailsSchema>;
export type IoDetails = z.infer<typeof ioDetailsSchema>;
export type ProcessDetails = z.infer<typeof processDetailsSchema>;
export type FormatDetails = z.infer<typeof formatDetailsSchema>;
export type BasicBlockDetails = z.infer<typeof basicBlockDetailsSchema>;
export type LayoutPatch = z.infer<typeof layoutPatchSchema>;
export type CustomBlockType = z.infer<typeof customBlockTypeSchema>;
export type NodeTypeStyle = z.infer<typeof nodeTypeStyleSchema>;
export type HierarchyBoundaryLabel = z.infer<typeof hierarchyBoundaryLabelSchema>;
export type HierarchyBoundaryGroup = z.infer<typeof hierarchyBoundaryGroupSchema>;
export type CreateCustomBlockType = z.infer<typeof createCustomBlockTypeSchema>;
export type CustomBlockTypeUpdate = z.infer<typeof customBlockTypeUpdateSchema>;
export type NodeTypeStyleUpdate = z.infer<typeof nodeTypeStyleUpdateSchema>;
export type NodeMutation = z.infer<typeof nodeMutationSchema>;
export type NodeUpdate = z.infer<typeof nodeUpdateSchema>;
export type EdgeMutation = z.infer<typeof edgeMutationSchema>;
export type EdgeUpdate = z.infer<typeof edgeUpdateSchema>;
export type BoundaryMutation = z.infer<typeof boundaryMutationSchema>;
export type BoundaryUpdate = z.infer<typeof boundaryUpdateSchema>;
export type GraphStatusPatch = z.infer<typeof graphStatusPatchSchema>;
export type SecretSource = z.infer<typeof secretSourceSchema>;
export type PromptSource = z.infer<typeof promptSourceSchema>;
export type AgentConfig = z.infer<typeof agentConfigSchema>;
export type AgentConfigView = z.infer<typeof agentConfigViewSchema>;
export type GeneralSettings = z.infer<typeof generalSettingsSchema>;
export type GithubAuthState = z.infer<typeof githubAuthStateSchema>;
export type GithubIntegrationSettingsMutation = z.infer<typeof githubIntegrationSettingsMutationSchema>;
export type GithubIntegrationSettings = z.infer<typeof githubIntegrationSettingsSchema>;
export type AgentAutomationSettings = z.infer<typeof agentAutomationSettingsSchema>;
export type WorkspaceSettings = z.infer<typeof workspaceSettingsSchema>;
export type WorkspaceSettingsMutation = z.infer<typeof workspaceSettingsMutationSchema>;
export type SettingsValidationResult = z.infer<typeof settingsValidationResultSchema>;
export type PlanningChatRequest = z.infer<typeof planningChatRequestSchema>;
export type CodingAgentRequest = z.infer<typeof codingAgentRequestSchema>;
export type ReviewAgentRequest = z.infer<typeof reviewAgentRequestSchema>;
export type ScanningAgentRequest = z.infer<typeof scanningAgentRequestSchema>;
export type GraphPatchOperation = z.infer<typeof graphPatchOperationSchema>;
export type GraphPatch = z.infer<typeof graphPatchSchema>;
export type AgentRun = z.infer<typeof agentRunSchema>;
export type AgentMessage = z.infer<typeof agentMessageSchema>;
export type GraphStatusHistory = z.infer<typeof graphStatusHistorySchema>;
export type GithubDeviceStartRequest = z.infer<typeof githubDeviceStartRequestSchema>;
export type GithubDeviceStartResponse = z.infer<typeof githubDeviceStartResponseSchema>;
export type GithubDevicePollRequest = z.infer<typeof githubDevicePollRequestSchema>;
export type GithubDevicePollResponse = z.infer<typeof githubDevicePollResponseSchema>;

export type HierarchyNode = GraphNode & {
  children: HierarchyNode[];
  boundaryLabels: HierarchyBoundaryLabel[];
  boundaryGroups: HierarchyBoundaryGroup[];
};

export type CanvasGraph = {
  project: Project;
  rootNodeId: string | null;
  scopeNodeId: string | null;
  scopeLabel: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  boundaries: GraphBoundary[];
  dependencies: DependencyDetails[];
  io: IoDetails[];
  processes: ProcessDetails[];
  formats: FormatDetails[];
  basicDetails: BasicBlockDetails[];
  customTypes: CustomBlockType[];
  nodeTypeStyles: NodeTypeStyle[];
  reuses: GraphNodeReuse[];
};

export type NodeDetail = {
  node: GraphNode;
  childCount: number;
  hasChildren: boolean;
  dependencies: Array<{ node: GraphNode; details: DependencyDetails }>;
  inputs: Array<{ node: GraphNode; details: IoDetails }>;
  outputs: Array<{ node: GraphNode; details: IoDetails }>;
  processes: Array<{ node: GraphNode; details: ProcessDetails }>;
  formats: Array<{ node: GraphNode; details: FormatDetails }>;
  basicDetails: Array<{ node: GraphNode; details: BasicBlockDetails }>;
  incomingEdges: GraphEdge[];
  outgoingEdges: GraphEdge[];
  relatedNodes: GraphNode[];
  reusedIn: GraphNodeReuse[];
};

export const isDomainNodeKind = (kind: GraphNodeKind): kind is DomainNodeKind =>
  DOMAIN_NODE_KINDS.includes(kind as DomainNodeKind);

export const isAttachmentNodeKind = (kind: GraphNodeKind): kind is AttachmentNodeKind =>
  ATTACHMENT_NODE_KINDS.includes(kind as AttachmentNodeKind);
