import { z } from "zod";

export const CORE_DOMAIN_NODE_KINDS = ["framework", "module", "website", "ui_component", "function", "object"] as const;
export const EMBEDDED_SYSTEMS_DOMAIN_NODE_KINDS = ["embedded_system", "embedded_device", "ros_node", "firmware_task"] as const;
export const ML_PIPELINE_DOMAIN_NODE_KINDS = ["ml_pipeline", "ml_training_stage", "ml_model", "ml_layer"] as const;
export const EXTENSION_DOMAIN_NODE_KINDS = [...EMBEDDED_SYSTEMS_DOMAIN_NODE_KINDS, ...ML_PIPELINE_DOMAIN_NODE_KINDS] as const;
export const DOMAIN_NODE_KINDS = [...CORE_DOMAIN_NODE_KINDS, ...EXTENSION_DOMAIN_NODE_KINDS] as const;
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
export const EMBEDDED_SYSTEMS_ATTACHMENT_NODE_KINDS = [
  "ros_topic",
  "ros_service",
  "ros_action",
  "gpio_pin",
  "uart_bus",
  "i2c_bus",
  "spi_bus",
  "pwm_channel",
  "adc_channel",
  "can_bus",
  "interrupt",
  "timer"
] as const;
export const ML_PIPELINE_ATTACHMENT_NODE_KINDS = [
  "ml_dataset",
  "ml_dataloader",
  "ml_preprocess",
  "ml_loss",
  "ml_optimizer",
  "ml_scheduler",
  "ml_metric",
  "ml_checkpoint",
  "ml_tensor",
  "ml_experiment"
] as const;
export const EXTENSION_ATTACHMENT_NODE_KINDS = [...EMBEDDED_SYSTEMS_ATTACHMENT_NODE_KINDS, ...ML_PIPELINE_ATTACHMENT_NODE_KINDS] as const;
export const EXTENSION_NODE_KINDS = [...EXTENSION_DOMAIN_NODE_KINDS, ...EXTENSION_ATTACHMENT_NODE_KINDS] as const;
export const ATTACHMENT_NODE_KINDS = [...BASIC_NODE_KINDS, ...EXTENSION_ATTACHMENT_NODE_KINDS] as const;
export const GRAPH_NODE_KINDS = [...DOMAIN_NODE_KINDS, ...ATTACHMENT_NODE_KINDS] as const;
export const GRAPH_EDGE_KINDS = ["calls", "imports", "uses", "owns", "impacts", "flows", "describes_format"] as const;
export const EDGE_POINTING_DIRECTIONS = ["source_to_target", "target_to_source", "bidirectional"] as const;
export const BASIC_DETAIL_NODE_KINDS = ["environment", "config", "secret", "command", "file", "database", "api", "event", "artifact", "custom"] as const;
export const EXTENSION_PACKAGE_IDS = ["@graphcode/extension-embedded-systems", "@graphcode/extension-ml-pipeline"] as const;
export const EXTENSION_FIELD_TYPES = ["string", "number", "boolean", "enum", "textarea"] as const;
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
export const INDEX_PROGRESS_PHASES = ["idle", "discovering", "parsing", "linking", "persisting", "complete", "failed", "cancelled"] as const;

export const indexCompletenessSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("complete") }),
  z.object({
    status: z.literal("partial"),
    indexedFiles: z.number().int().nonnegative(),
    discoveredFiles: z.number().int().nonnegative(),
    reasons: z.array(z.string().min(1))
  }),
  z.object({
    status: z.literal("stale"),
    changedFiles: z.array(z.string().min(1)),
    sinceRevision: z.string().min(1)
  }),
  z.object({
    status: z.literal("failed"),
    lastCompleteRevision: z.string().min(1).nullable(),
    errorCode: z.string().min(1)
  })
]);

export const indexFileCountsSchema = z
  .object({
    discovered: z.number().int().nonnegative(),
    supported: z.number().int().nonnegative(),
    indexed: z.number().int().nonnegative(),
    unsupported: z.number().int().nonnegative(),
    excluded: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative()
  })
  .superRefine((counts, context) => {
    if (counts.supported + counts.unsupported + counts.excluded !== counts.discovered) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Discovered files must reconcile to supported, unsupported, and excluded counts."
      });
    }
    if (counts.indexed + counts.failed > counts.supported) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Indexed and failed files cannot exceed the supported file count."
      });
    }
  });

export const indexProgressSchema = z.object({
  phase: z.enum(INDEX_PROGRESS_PHASES),
  completed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  message: z.string(),
  updatedAt: z.string().datetime()
});

export const indexTelemetrySchema = z.object({
  discoveryMs: z.number().nonnegative(),
  parseMs: z.number().nonnegative(),
  linkMs: z.number().nonnegative(),
  persistMs: z.number().nonnegative(),
  peakRssBytes: z.number().int().nonnegative()
});

export const indexStateSchema = z
  .object({
    projectId: z.string().min(1),
    providerId: z.string().min(1),
    indexRevision: z.string().min(1).nullable(),
    workspaceRevision: z.string().min(1).nullable(),
    generatedAt: z.string().datetime(),
    completeness: indexCompletenessSchema,
    counts: indexFileCountsSchema,
    progress: indexProgressSchema,
    telemetry: indexTelemetrySchema
  })
  .superRefine((state, context) => {
    if (state.completeness.status === "complete" && (state.counts.indexed !== state.counts.supported || state.counts.failed > 0 || state.counts.excluded > 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A complete index must account for every supported file without failures or exclusions."
      });
    }
    if (
      state.completeness.status === "partial" &&
      (state.completeness.indexedFiles !== state.counts.indexed || state.completeness.discoveredFiles !== state.counts.discovered)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Partial completeness counts must match the index state counts."
      });
    }
  });

export type IndexCompleteness = z.infer<typeof indexCompletenessSchema>;
export type IndexFileCounts = z.infer<typeof indexFileCountsSchema>;
export type IndexProgress = z.infer<typeof indexProgressSchema>;
export type IndexTelemetry = z.infer<typeof indexTelemetrySchema>;
export type IndexState = z.infer<typeof indexStateSchema>;
export const AGENT_KINDS = ["planning", "coding", "review", "scanning"] as const;
export const AGENT_RUN_STATUSES = ["queued", "running", "succeeded", "failed", "conflicted"] as const;
export const AGENT_PROVIDERS = ["fake", "codex", "claudecode", "openai", "gemini", "openrouter"] as const;
export const CODEX_REASONING_EFFORTS = ["low", "medium", "high", "xhigh", "max", "ultra"] as const;
export const CODEX_SPEED_TIERS = ["standard", "fast"] as const;
export const CODEX_PERMISSION_MODES = ["ask_for_permission", "approve_for_me", "full_access"] as const;
export const CODEX_SYSTEM_PROMPT_MODES = ["default", "custom"] as const;
export const CLAUDE_REASONING_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export const CLAUDE_SYSTEM_PROMPT_MODES = ["default", "custom"] as const;
export const CODING_AGENT_MODES = ["small", "medium", "large"] as const;
export const REVIEW_AGENT_MODES = ["small", "medium", "large"] as const;
export const SCANNING_AGENT_MODES = ["local", "medium", "global"] as const;
export const CODING_WORKFLOW_STATUSES = ["preview", "running", "blocked", "succeeded", "failed"] as const;
export const CODING_WORKFLOW_ITEM_STATUSES = ["pending", "running", "proposed", "applied", "skipped", "failed", "blocked"] as const;
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
export const codexReasoningEffortSchema = z.enum(CODEX_REASONING_EFFORTS);
export const codexSpeedTierSchema = z.enum(CODEX_SPEED_TIERS);
export const codexPermissionModeSchema = z.enum(CODEX_PERMISSION_MODES);
export const codexSystemPromptModeSchema = z.enum(CODEX_SYSTEM_PROMPT_MODES);
export const claudeReasoningEffortSchema = z.enum(CLAUDE_REASONING_EFFORTS);
export const claudeSystemPromptModeSchema = z.enum(CLAUDE_SYSTEM_PROMPT_MODES);
export const codingAgentModeSchema = z.enum(CODING_AGENT_MODES);
export const reviewAgentModeSchema = z.enum(REVIEW_AGENT_MODES);
export const scanningAgentModeSchema = z.enum(SCANNING_AGENT_MODES);
export const codingWorkflowStatusSchema = z.enum(CODING_WORKFLOW_STATUSES);
export const codingWorkflowItemStatusSchema = z.enum(CODING_WORKFLOW_ITEM_STATUSES);
export const settingsThemeModeSchema = z.enum(SETTINGS_THEME_MODES);
export const secretSourceTypeSchema = z.enum(SECRET_SOURCE_TYPES);
export const promptSourceTypeSchema = z.enum(PROMPT_SOURCE_TYPES);
export const graphPatchEntityTypeSchema = z.enum(GRAPH_PATCH_ENTITY_TYPES);
export const workspaceCreationModeSchema = z.enum(WORKSPACE_CREATION_MODES);
export const extensionPackageIdSchema = z.enum(EXTENSION_PACKAGE_IDS);
export const extensionFieldTypeSchema = z.enum(EXTENSION_FIELD_TYPES);

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
export type CodexReasoningEffort = z.infer<typeof codexReasoningEffortSchema>;
export type CodexSpeedTier = z.infer<typeof codexSpeedTierSchema>;
export type CodexPermissionMode = z.infer<typeof codexPermissionModeSchema>;
export type CodexSystemPromptMode = z.infer<typeof codexSystemPromptModeSchema>;
export type ClaudeReasoningEffort = z.infer<typeof claudeReasoningEffortSchema>;
export type ClaudeSystemPromptMode = z.infer<typeof claudeSystemPromptModeSchema>;
export type CodingAgentMode = z.infer<typeof codingAgentModeSchema>;
export type ReviewAgentMode = z.infer<typeof reviewAgentModeSchema>;
export type ScanningAgentMode = z.infer<typeof scanningAgentModeSchema>;
export type CodingWorkflowStatus = z.infer<typeof codingWorkflowStatusSchema>;
export type CodingWorkflowItemStatus = z.infer<typeof codingWorkflowItemStatusSchema>;
export type SettingsThemeMode = z.infer<typeof settingsThemeModeSchema>;
export type SecretSourceType = z.infer<typeof secretSourceTypeSchema>;
export type PromptSourceType = z.infer<typeof promptSourceTypeSchema>;
export type GraphPatchEntityType = z.infer<typeof graphPatchEntityTypeSchema>;
export type WorkspaceCreationMode = z.infer<typeof workspaceCreationModeSchema>;
export type ExtensionPackageId = z.infer<typeof extensionPackageIdSchema>;
export type ExtensionFieldType = z.infer<typeof extensionFieldTypeSchema>;

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
}).refine((range) => range.startLine === null || range.endLine === null || range.startLine <= range.endLine, {
  message: "source startLine must be less than or equal to endLine",
  path: ["endLine"]
});

export const codeMetadataSchema = z.object({
  context: z.string(),
  directory: z.string().nullable(),
  startLine: z.number().int().positive().nullable(),
  endLine: z.number().int().positive().nullable(),
  language: languageTypeSchema
});

export const blockExecutionMetadataSchema = z.object({
  testScriptDirectory: z.string().nullable().default(null),
  virtualEnvironment: z.string().nullable().default(null),
  workingDirectory: z.string().nullable().default(null),
  setupCommand: z.string().nullable().default(null),
  testCommand: z.string().nullable().default(null)
});

export const styleColorSchema = z.string().min(1);

const extensionScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const extensionFieldDefinitionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: extensionFieldTypeSchema,
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  placeholder: z.string().optional(),
  helpText: z.string().optional()
});

export const extensionNodeKindDefinitionSchema = z.object({
  packageId: extensionPackageIdSchema,
  kind: graphNodeKindSchema,
  label: z.string().min(1),
  description: z.string(),
  category: z.enum(["domain", "attachment"]),
  icon: z.string().min(1),
  color: styleColorSchema,
  sortOrder: z.number().int().nonnegative(),
  defaultSize: sizeSchema,
  parentKinds: z.array(graphNodeKindSchema).default([]),
  attachableToKinds: z.array(graphNodeKindSchema).default([]),
  detailSchemaId: z.string().min(1),
  fields: z.array(extensionFieldDefinitionSchema).default([])
});

export const graphExtensionPackageSchema = z.object({
  id: extensionPackageIdSchema,
  name: z.string().min(1),
  description: z.string(),
  promptAddendum: z.string(),
  nodeKinds: z.array(extensionNodeKindDefinitionSchema)
});

export const extensionNodeDetailsSchema = z.object({
  nodeId: z.string(),
  packageId: extensionPackageIdSchema,
  schemaId: z.string().min(1),
  payload: z.record(extensionScalarSchema).default({})
});

export const extensionNodeDetailsMutationSchema = z.object({
  packageId: extensionPackageIdSchema,
  schemaId: z.string().min(1),
  payload: z.record(extensionScalarSchema).default({})
});

export const workspaceExtensionsConfigSchema = z.record(z.record(extensionScalarSchema));

export const workspaceExtensionsSettingsSchema = z.object({
  availablePackages: z.array(graphExtensionPackageSchema),
  enabledPackageIds: z.array(extensionPackageIdSchema).default([]),
  configs: workspaceExtensionsConfigSchema.default({})
});

export const workspaceExtensionsMutationSchema = z.object({
  enabledPackageIds: z.array(extensionPackageIdSchema).default([]),
  configs: workspaceExtensionsConfigSchema.default({})
});

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
  execution: blockExecutionMetadataSchema.default({}),
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
  source: sourceRangeSchema.default({ path: null, startLine: null, endLine: null }),
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
  extensionDetails: extensionNodeDetailsMutationSchema.nullable().optional(),
  execution: blockExecutionMetadataSchema.partial().optional(),
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
  source: sourceRangeSchema.optional(),
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

const agentConfigBaseSchema = z.object({
  provider: agentProviderSchema,
  model: z.string(),
  cliCommand: z.string().optional().default(""),
  reasoningEffort: codexReasoningEffortSchema.optional().default("medium"),
  speedTier: codexSpeedTierSchema.optional().default("standard"),
  permissionMode: codexPermissionModeSchema.optional().default("ask_for_permission"),
  codexSystemPromptMode: codexSystemPromptModeSchema.optional().default("custom"),
  claudeSystemPromptMode: claudeSystemPromptModeSchema.optional().default("custom"),
  parallelLimit: z.number().int().min(1).max(64),
  apiKeySource: secretSourceSchema,
  systemPromptSource: promptSourceSchema
});

export const agentConfigSchema = agentConfigBaseSchema.extend({
  agentKind: agentKindSchema
});

export const agentConfigViewSchema = agentConfigSchema.extend({
  apiKeyConfigured: z.boolean(),
  systemPromptConfigured: z.boolean()
});

export const codingAgentConfigSchema = agentConfigBaseSchema.extend({
  mode: codingAgentModeSchema
});

export const codingAgentConfigViewSchema = codingAgentConfigSchema.extend({
  apiKeyConfigured: z.boolean(),
  systemPromptConfigured: z.boolean()
});

export const reviewAgentConfigSchema = agentConfigBaseSchema.extend({
  mode: reviewAgentModeSchema
});

export const reviewAgentConfigViewSchema = reviewAgentConfigSchema.extend({
  apiKeyConfigured: z.boolean(),
  systemPromptConfigured: z.boolean()
});

export const scanningAgentConfigSchema = agentConfigBaseSchema.extend({
  mode: scanningAgentModeSchema
});

export const scanningAgentConfigViewSchema = scanningAgentConfigSchema.extend({
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
  extensions: workspaceExtensionsSettingsSchema.default({ availablePackages: [], enabledPackageIds: [], configs: {} }),
  agents: z.array(agentConfigViewSchema),
  codingAgents: z.array(codingAgentConfigViewSchema).default([]),
  reviewAgents: z.array(reviewAgentConfigViewSchema).default([]),
  scanningAgents: z.array(scanningAgentConfigViewSchema).default([])
});

export const workspaceSettingsMutationSchema = z.object({
  general: generalSettingsSchema,
  github: githubIntegrationSettingsMutationSchema,
  automation: agentAutomationSettingsSchema,
  extensions: workspaceExtensionsMutationSchema.default({ enabledPackageIds: [], configs: {} }),
  agents: z.array(agentConfigSchema),
  codingAgents: z.array(codingAgentConfigSchema).default([]),
  reviewAgents: z.array(reviewAgentConfigSchema).default([]),
  scanningAgents: z.array(scanningAgentConfigSchema).default([])
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

export const codexCliStatusSchema = z.object({
  installed: z.boolean(),
  command: z.string(),
  resolvedPath: z.string().nullable(),
  version: z.string().nullable(),
  authenticated: z.boolean(),
  authStatus: z.string().nullable(),
  modelsAvailable: z.boolean(),
  error: z.string().nullable(),
  checkedAt: z.string()
});

export const codexInstallResultSchema = z.object({
  ok: z.boolean(),
  command: z.string(),
  message: z.string(),
  status: codexCliStatusSchema.optional()
});

export const codexAuthStartResultSchema = z.object({
  ok: z.boolean(),
  command: z.string(),
  message: z.string(),
  status: codexCliStatusSchema.optional()
});

export const codexReasoningLevelSchema = z.object({
  effort: codexReasoningEffortSchema,
  description: z.string().default("")
});

export const codexModelInfoSchema = z.object({
  slug: z.string(),
  displayName: z.string(),
  description: z.string().default(""),
  defaultReasoningLevel: codexReasoningEffortSchema.default("medium"),
  supportedReasoningLevels: z.array(codexReasoningLevelSchema).default([]),
  speedTiers: z.array(codexSpeedTierSchema).default(["standard"])
});

export const claudeCliStatusSchema = z.object({
  installed: z.boolean(),
  command: z.string(),
  resolvedPath: z.string().nullable(),
  version: z.string().nullable(),
  authenticated: z.boolean(),
  authStatus: z.string().nullable(),
  modelsAvailable: z.boolean(),
  error: z.string().nullable(),
  checkedAt: z.string()
});

export const claudeInstallResultSchema = z.object({
  ok: z.boolean(),
  command: z.string(),
  message: z.string(),
  status: claudeCliStatusSchema.optional()
});

export const claudeAuthStartResultSchema = z.object({
  ok: z.boolean(),
  command: z.string(),
  message: z.string(),
  status: claudeCliStatusSchema.optional()
});

export const claudeReasoningLevelSchema = z.object({
  effort: claudeReasoningEffortSchema,
  description: z.string().default("")
});

export const claudeModelInfoSchema = z.object({
  slug: z.string(),
  displayName: z.string(),
  description: z.string().default(""),
  defaultReasoningLevel: claudeReasoningEffortSchema.default("medium"),
  supportedReasoningLevels: z.array(claudeReasoningLevelSchema).default([]),
  speedTiers: z.array(codexSpeedTierSchema).default(["standard"])
});

export const folderPickerResultSchema = z.object({
  supported: z.boolean(),
  selected: z.boolean(),
  path: z.string().nullable(),
  message: z.string().nullable().default(null)
});

export const planningChatRequestSchema = z.object({
  projectId: z.string().min(1),
  prompt: z.string().min(1),
  scopeNodeId: z.string().nullable().optional(),
  background: z.boolean().optional().default(false)
});

export const codingAgentRequestSchema = z.object({
  projectId: z.string().min(1),
  nodeId: z.string().min(1),
  mode: codingAgentModeSchema.default("medium"),
  recommendedModeReason: z.string().optional(),
  prompt: z.string().optional()
});

export const codeProposalTestScriptSchema = z.object({
  relativePath: z.string().min(1),
  content: z.string(),
  command: z.string().optional(),
  description: z.string().optional()
});

export const codeProposalArtifactManifestSchema = z.object({
  testScriptDirectory: z.string().nullable().default(null),
  scripts: z.array(codeProposalTestScriptSchema).default([]),
  notes: z.string().optional()
});

export const codingWorkflowItemSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  projectId: z.string(),
  nodeId: z.string(),
  nodeName: z.string(),
  nodeKind: graphNodeKindSchema,
  layerIndex: z.number().int().nonnegative(),
  recommendedMode: codingAgentModeSchema,
  selectedMode: codingAgentModeSchema,
  modeReason: z.string(),
  status: codingWorkflowItemStatusSchema,
  conflictGroup: z.string(),
  agentRunId: z.string().nullable(),
  proposalId: z.string().nullable(),
  appliedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const codingWorkflowSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  scopeNodeId: z.string(),
  scopeName: z.string(),
  status: codingWorkflowStatusSchema,
  currentLayer: z.number().int().nonnegative(),
  summary: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  items: z.array(codingWorkflowItemSchema).default([])
});

export const codingWorkflowModeOverrideSchema = z.object({
  nodeId: z.string().min(1),
  mode: codingAgentModeSchema
});

export const codingWorkflowPreviewRequestSchema = z.object({
  projectId: z.string().min(1),
  scopeNodeId: z.string().min(1)
});

export const codingWorkflowStartRequestSchema = z.object({
  projectId: z.string().min(1),
  scopeNodeId: z.string().min(1),
  modeOverrides: z.array(codingWorkflowModeOverrideSchema).optional().default([])
});

export const codingWorkflowApplyLayerRequestSchema = z.object({
  projectId: z.string().min(1),
  workflowId: z.string().min(1),
  layerIndex: z.number().int().nonnegative()
});

export const reviewAgentRequestSchema = z.object({
  projectId: z.string().min(1),
  runId: z.string().min(1),
  mode: reviewAgentModeSchema.optional()
});

export const workspaceInitializationSchema = z.object({
  projectName: z.string().trim().min(1),
  projectDescription: z.string().trim().min(1),
  scanningInstructions: z.string().trim().min(1),
  skipCodexDefaultSystemPrompt: z.boolean().optional().default(false)
});

export const blankWorkspaceInitializationSchema = z.object({
  projectName: z.string().trim().min(1),
  projectDescription: z.string().trim().optional().default("")
});

export const scanningAgentRequestSchema = z.object({
  projectId: z.string().min(1),
  rootPath: z.string().optional(),
  projectDescription: z.string().optional(),
  scanningInstructions: z.string().optional(),
  skipCodexDefaultSystemPrompt: z.boolean().optional().default(false),
  enabledExtensionPackageIds: z.array(extensionPackageIdSchema).optional().default([]),
  background: z.boolean().optional().default(false)
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
  codingMode: codingAgentModeSchema.nullable().default(null),
  reviewMode: reviewAgentModeSchema.nullable().default(null),
  status: agentRunStatusSchema,
  baseGraphRevision: z.number().int().nonnegative().default(0),
  appliedGraphRevision: z.number().int().nonnegative().nullable().default(null),
  conflictReason: z.string().nullable().default(null),
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
export type BlockExecutionMetadata = z.infer<typeof blockExecutionMetadataSchema>;
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
export type ExtensionFieldDefinition = z.infer<typeof extensionFieldDefinitionSchema>;
export type ExtensionNodeKindDefinition = z.infer<typeof extensionNodeKindDefinitionSchema>;
export type GraphExtensionPackage = z.infer<typeof graphExtensionPackageSchema>;
export type ExtensionNodeDetails = z.infer<typeof extensionNodeDetailsSchema>;
export type ExtensionNodeDetailsMutation = z.infer<typeof extensionNodeDetailsMutationSchema>;
export type WorkspaceExtensionsSettings = z.infer<typeof workspaceExtensionsSettingsSchema>;
export type WorkspaceExtensionsMutation = z.input<typeof workspaceExtensionsMutationSchema>;
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
export type CodingAgentConfig = z.infer<typeof codingAgentConfigSchema>;
export type CodingAgentConfigView = z.infer<typeof codingAgentConfigViewSchema>;
export type ReviewAgentConfig = z.infer<typeof reviewAgentConfigSchema>;
export type ReviewAgentConfigView = z.infer<typeof reviewAgentConfigViewSchema>;
export type ScanningAgentConfig = z.infer<typeof scanningAgentConfigSchema>;
export type ScanningAgentConfigView = z.infer<typeof scanningAgentConfigViewSchema>;
export type GeneralSettings = z.infer<typeof generalSettingsSchema>;
export type GithubAuthState = z.infer<typeof githubAuthStateSchema>;
export type GithubIntegrationSettingsMutation = z.infer<typeof githubIntegrationSettingsMutationSchema>;
export type GithubIntegrationSettings = z.infer<typeof githubIntegrationSettingsSchema>;
export type AgentAutomationSettings = z.infer<typeof agentAutomationSettingsSchema>;
export type WorkspaceSettings = z.infer<typeof workspaceSettingsSchema>;
export type WorkspaceSettingsMutation = z.infer<typeof workspaceSettingsMutationSchema>;
export type SettingsValidationResult = z.infer<typeof settingsValidationResultSchema>;
export type CodexCliStatus = z.infer<typeof codexCliStatusSchema>;
export type CodexInstallResult = z.infer<typeof codexInstallResultSchema>;
export type CodexAuthStartResult = z.infer<typeof codexAuthStartResultSchema>;
export type CodexReasoningLevel = z.infer<typeof codexReasoningLevelSchema>;
export type CodexModelInfo = z.infer<typeof codexModelInfoSchema>;
export type ClaudeCliStatus = z.infer<typeof claudeCliStatusSchema>;
export type ClaudeInstallResult = z.infer<typeof claudeInstallResultSchema>;
export type ClaudeAuthStartResult = z.infer<typeof claudeAuthStartResultSchema>;
export type ClaudeReasoningLevel = z.infer<typeof claudeReasoningLevelSchema>;
export type ClaudeModelInfo = z.infer<typeof claudeModelInfoSchema>;
export type FolderPickerResult = z.infer<typeof folderPickerResultSchema>;
export type PlanningChatRequest = z.input<typeof planningChatRequestSchema>;
export type CodingAgentRequest = z.input<typeof codingAgentRequestSchema>;
export type CodeProposalTestScript = z.infer<typeof codeProposalTestScriptSchema>;
export type CodeProposalArtifactManifest = z.infer<typeof codeProposalArtifactManifestSchema>;
export type CodingWorkflowItem = z.infer<typeof codingWorkflowItemSchema>;
export type CodingWorkflow = z.infer<typeof codingWorkflowSchema>;
export type CodingWorkflowModeOverride = z.infer<typeof codingWorkflowModeOverrideSchema>;
export type CodingWorkflowPreviewRequest = z.input<typeof codingWorkflowPreviewRequestSchema>;
export type CodingWorkflowStartRequest = z.input<typeof codingWorkflowStartRequestSchema>;
export type CodingWorkflowApplyLayerRequest = z.input<typeof codingWorkflowApplyLayerRequestSchema>;
export type ReviewAgentRequest = z.input<typeof reviewAgentRequestSchema>;
export type ScanningAgentRequest = z.input<typeof scanningAgentRequestSchema>;
export type GraphPatchOperation = z.infer<typeof graphPatchOperationSchema>;
export type GraphPatch = z.infer<typeof graphPatchSchema>;
export type AgentRun = z.infer<typeof agentRunSchema>;
export type AgentMessage = z.infer<typeof agentMessageSchema>;
export type GraphStatusHistory = z.infer<typeof graphStatusHistorySchema>;
export type GithubDeviceStartRequest = z.infer<typeof githubDeviceStartRequestSchema>;
export type GithubDeviceStartResponse = z.infer<typeof githubDeviceStartResponseSchema>;
export type GithubDevicePollRequest = z.infer<typeof githubDevicePollRequestSchema>;
export type GithubDevicePollResponse = z.infer<typeof githubDevicePollResponseSchema>;

export const AVAILABLE_EXTENSION_PACKAGES: GraphExtensionPackage[] = [
  {
    id: "@graphcode/extension-embedded-systems",
    name: "Embedded Systems",
    description: "Native blocks for ROS runtime graphs, firmware tasks, and common embedded device I/O.",
    promptAddendum:
      "When the Embedded Systems extension is enabled, represent robotics and firmware evidence with embedded_system, embedded_device, ros_node, firmware_task, ROS interface blocks, and hardware I/O blocks such as GPIO, UART, I2C, SPI, PWM, ADC, CAN, interrupts, and timers.",
    nodeKinds: [
      extensionDomain("@graphcode/extension-embedded-systems", "embedded_system", "Embedded System", "Robot, device, firmware, or embedded subsystem.", "cpu", "#0f766e", 30, ["framework", "module"], [
        textField("target", "Target", "robot, board, or product name"),
        enumField("runtime", "Runtime", ["bare-metal", "freertos", "zephyr", "linux", "ros2", "mixed", "custom"]),
        textField("clock", "Clock", "main clock or timing source")
      ]),
      extensionDomain("@graphcode/extension-embedded-systems", "embedded_device", "Embedded Device", "Board, controller, sensor, actuator, or peripheral.", "microchip", "#0891b2", 31, ["embedded_system", "module"], [
        enumField("deviceType", "Device Type", ["board", "mcu", "sensor", "actuator", "peripheral", "gateway", "custom"]),
        textField("partNumber", "Part Number", "STM32, Jetson, ESP32, IMU model"),
        textField("voltage", "Voltage", "3.3V, 5V, 24V")
      ]),
      extensionDomain("@graphcode/extension-embedded-systems", "ros_node", "ROS Node", "ROS node, component, lifecycle node, or runtime process.", "radio-tower", "#0284c7", 32, ["embedded_system", "embedded_device", "module"], [
        textField("nodeName", "Node Name", "/camera_driver"),
        enumField("rosVersion", "ROS Version", ["ros1", "ros2"]),
        textField("namespace", "Namespace", "/robot/front")
      ]),
      extensionDomain("@graphcode/extension-embedded-systems", "firmware_task", "Firmware Task", "RTOS task, control loop, ISR-adjacent task, or scheduled unit.", "timer", "#7c2d12", 33, ["embedded_system", "embedded_device", "ros_node"], [
        enumField("taskType", "Task Type", ["rtos-task", "control-loop", "isr-handler", "scheduler-job", "polling-loop", "custom"]),
        textField("period", "Period", "10ms"),
        textField("priority", "Priority", "high, 4, realtime")
      ]),
      extensionAttachment("@graphcode/extension-embedded-systems", "ros_topic", "ROS Topic", "Published or subscribed ROS topic.", "radio", "#2563eb", 110, ["ros_node"], rosInterfaceFields("topic")),
      extensionAttachment("@graphcode/extension-embedded-systems", "ros_service", "ROS Service", "Request/response ROS service.", "workflow", "#4f46e5", 111, ["ros_node"], rosInterfaceFields("service")),
      extensionAttachment("@graphcode/extension-embedded-systems", "ros_action", "ROS Action", "Long-running ROS action interface.", "workflow", "#7c3aed", 112, ["ros_node"], rosInterfaceFields("action")),
      extensionAttachment("@graphcode/extension-embedded-systems", "gpio_pin", "GPIO Pin", "Digital input or output pin.", "plug", "#16a34a", 113, ["embedded_device", "firmware_task"], [
        textField("pin", "Pin", "PA5, GPIO17"),
        enumField("direction", "Direction", ["input", "output", "bidirectional"]),
        enumField("pull", "Pull", ["none", "up", "down"]),
        enumField("activeLevel", "Active Level", ["high", "low"])
      ]),
      extensionAttachment("@graphcode/extension-embedded-systems", "uart_bus", "UART Bus", "Serial UART interface.", "terminal", "#0d9488", 114, ["embedded_device", "firmware_task", "ros_node"], [
        textField("port", "Port", "USART1, /dev/ttyUSB0"),
        numberField("baud", "Baud"),
        enumField("parity", "Parity", ["none", "even", "odd"]),
        enumField("stopBits", "Stop Bits", ["1", "1.5", "2"])
      ]),
      extensionAttachment("@graphcode/extension-embedded-systems", "i2c_bus", "I2C Bus", "I2C peripheral bus.", "network", "#0f766e", 115, ["embedded_device", "firmware_task"], [
        textField("bus", "Bus", "I2C1"),
        textField("address", "Address", "0x68"),
        textField("speed", "Speed", "100kHz, 400kHz")
      ]),
      extensionAttachment("@graphcode/extension-embedded-systems", "spi_bus", "SPI Bus", "SPI peripheral bus.", "network", "#0369a1", 116, ["embedded_device", "firmware_task"], [
        textField("bus", "Bus", "SPI2"),
        textField("chipSelect", "Chip Select", "CS0, PB12"),
        enumField("mode", "Mode", ["0", "1", "2", "3"]),
        textField("speed", "Speed", "10MHz")
      ]),
      extensionAttachment("@graphcode/extension-embedded-systems", "pwm_channel", "PWM Channel", "Pulse-width modulation output.", "activity", "#ca8a04", 117, ["embedded_device", "firmware_task"], [
        textField("channel", "Channel", "TIM2_CH1"),
        textField("frequency", "Frequency", "20kHz"),
        textField("dutyCycle", "Duty Cycle", "50%")
      ]),
      extensionAttachment("@graphcode/extension-embedded-systems", "adc_channel", "ADC Channel", "Analog-to-digital input.", "gauge", "#ea580c", 118, ["embedded_device", "firmware_task"], [
        textField("channel", "Channel", "ADC1_IN4"),
        textField("resolution", "Resolution", "12-bit"),
        textField("range", "Range", "0-3.3V")
      ]),
      extensionAttachment("@graphcode/extension-embedded-systems", "can_bus", "CAN Bus", "CAN or CAN-FD bus interface.", "network", "#be123c", 119, ["embedded_device", "firmware_task", "ros_node"], [
        textField("bus", "Bus", "CAN1"),
        textField("bitrate", "Bitrate", "500k"),
        textField("frameId", "Frame ID", "0x123")
      ]),
      extensionAttachment("@graphcode/extension-embedded-systems", "interrupt", "Interrupt", "Hardware or software interrupt.", "zap", "#dc2626", 120, ["embedded_device", "firmware_task"], [
        textField("source", "Source", "EXTI0, DMA1"),
        enumField("trigger", "Trigger", ["rising", "falling", "both", "level-high", "level-low", "timer", "custom"]),
        textField("priority", "Priority", "0, high")
      ]),
      extensionAttachment("@graphcode/extension-embedded-systems", "timer", "Timer", "Hardware timer or scheduled tick.", "timer", "#a16207", 121, ["embedded_device", "firmware_task"], [
        textField("timer", "Timer", "TIM3, SysTick"),
        textField("period", "Period", "1ms"),
        textField("source", "Source", "APB1, external")
      ])
    ]
  },
  {
    id: "@graphcode/extension-ml-pipeline",
    name: "ML Pipeline",
    description: "Native blocks for model architecture, training stages, datasets, optimizers, metrics, and artifacts.",
    promptAddendum:
      "When the ML Pipeline extension is enabled, represent ML evidence with ml_pipeline, ml_training_stage, ml_model, ml_layer, datasets, dataloaders, preprocessing, loss, optimizer, scheduler, metrics, checkpoints, tensors, and experiments.",
    nodeKinds: [
      extensionDomain("@graphcode/extension-ml-pipeline", "ml_pipeline", "ML Pipeline", "Training, evaluation, export, or inference workflow.", "workflow", "#2563eb", 40, ["framework", "module"], [
        enumField("pipelineType", "Pipeline Type", ["training", "inference", "evaluation", "export", "deployment", "custom"]),
        textField("framework", "Framework", "PyTorch, TensorFlow, JAX, ONNX"),
        textField("task", "Task", "classification, detection, language modeling")
      ]),
      extensionDomain("@graphcode/extension-ml-pipeline", "ml_training_stage", "Training Stage", "Data prep, train, validate, tune, evaluate, export, or deploy stage.", "flask-conical", "#0d9488", 41, ["ml_pipeline"], [
        enumField("stageType", "Stage Type", ["data-prep", "train", "validate", "tune", "evaluate", "export", "deploy", "custom"]),
        textField("entrypoint", "Entrypoint", "train.py, Trainer.fit"),
        textField("device", "Device", "cpu, cuda, tpu")
      ]),
      extensionDomain("@graphcode/extension-ml-pipeline", "ml_model", "ML Model", "Model architecture or nested module.", "brain-circuit", "#7c3aed", 42, ["ml_pipeline", "ml_training_stage", "module"], [
        textField("modelName", "Model Name", "ResNet, Transformer"),
        textField("frameworkClass", "Framework Class", "torch.nn.Module"),
        textField("inputShape", "Input Shape", "N,C,H,W")
      ]),
      extensionDomain("@graphcode/extension-ml-pipeline", "ml_layer", "ML Layer", "Layer or operation inside an ML model.", "layers", "#db2777", 43, ["ml_model", "ml_layer"], [
        enumField("layerType", "Layer Type", [
          "linear",
          "conv1d",
          "conv2d",
          "conv3d",
          "embedding",
          "attention",
          "normalization",
          "activation",
          "pooling",
          "recurrent",
          "dropout",
          "reshape",
          "concat",
          "residual",
          "custom"
        ]),
        textField("inputShape", "Input Shape", "N,C,H,W"),
        textField("outputShape", "Output Shape", "N,D"),
        textField("parameters", "Parameters", "hidden=768, heads=12")
      ]),
      extensionAttachment("@graphcode/extension-ml-pipeline", "ml_dataset", "ML Dataset", "Training, validation, test, or inference dataset.", "database", "#0891b2", 130, ["ml_pipeline", "ml_training_stage"], [
        textField("source", "Source", "s3://, local path, Hugging Face ID"),
        enumField("split", "Split", ["train", "validation", "test", "inference", "all", "custom"]),
        textField("schema", "Schema", "feature/label columns or tensor shape")
      ]),
      extensionAttachment("@graphcode/extension-ml-pipeline", "ml_dataloader", "DataLoader", "Batching, sampling, and loading configuration.", "file-input", "#0284c7", 131, ["ml_training_stage", "ml_pipeline"], [
        textField("batchSize", "Batch Size", "32"),
        textField("shuffle", "Shuffle", "true/false"),
        textField("numWorkers", "Workers", "8")
      ]),
      extensionAttachment("@graphcode/extension-ml-pipeline", "ml_preprocess", "Preprocess", "Transform, tokenization, augmentation, or feature step.", "wand", "#4f46e5", 132, ["ml_training_stage", "ml_pipeline", "ml_dataset"], [
        enumField("preprocessType", "Preprocess Type", ["normalize", "tokenize", "augment", "resize", "feature-extract", "filter", "custom"]),
        textField("operation", "Operation", "Normalize(mean, std)"),
        textAreaField("notes", "Notes")
      ]),
      extensionAttachment("@graphcode/extension-ml-pipeline", "ml_loss", "Loss", "Training objective or criterion.", "activity", "#dc2626", 133, ["ml_training_stage", "ml_model"], [
        enumField("lossType", "Loss Type", ["cross_entropy", "mse", "mae", "bce", "contrastive", "ctc", "custom"]),
        textField("reduction", "Reduction", "mean, sum, none"),
        textField("weights", "Weights", "class weights or coefficient")
      ]),
      extensionAttachment("@graphcode/extension-ml-pipeline", "ml_optimizer", "Optimizer", "Optimizer type and hyperparameters.", "sliders-horizontal", "#16a34a", 134, ["ml_training_stage", "ml_model"], [
        enumField("optimizerType", "Optimizer Type", ["sgd", "adam", "adamw", "rmsprop", "adagrad", "lion", "custom"]),
        textField("learningRate", "Learning Rate", "1e-3"),
        textField("weightDecay", "Weight Decay", "0.01")
      ]),
      extensionAttachment("@graphcode/extension-ml-pipeline", "ml_scheduler", "Scheduler", "Learning-rate or training schedule.", "line-chart", "#65a30d", 135, ["ml_training_stage", "ml_optimizer"], [
        enumField("schedulerType", "Scheduler Type", ["step", "cosine", "linear", "plateau", "warmup", "custom"]),
        textField("schedule", "Schedule", "warmup=1000, T_max=10"),
        textField("interval", "Interval", "step, epoch")
      ]),
      extensionAttachment("@graphcode/extension-ml-pipeline", "ml_metric", "Metric", "Training or evaluation metric.", "gauge", "#9333ea", 136, ["ml_training_stage", "ml_model"], [
        textField("metricName", "Metric", "accuracy, F1, MAPE"),
        enumField("phase", "Phase", ["train", "validation", "test", "inference", "all"]),
        textField("target", "Target", "top-1 > 90%")
      ]),
      extensionAttachment("@graphcode/extension-ml-pipeline", "ml_checkpoint", "Checkpoint", "Model checkpoint, exported weights, or saved state.", "file-archive", "#b45309", 137, ["ml_training_stage", "ml_model"], [
        textField("path", "Path", "checkpoints/best.pt"),
        enumField("artifactType", "Artifact Type", ["weights", "optimizer-state", "full-state", "onnx", "safetensors", "custom"]),
        textField("retention", "Retention", "best, last, every epoch")
      ]),
      extensionAttachment("@graphcode/extension-ml-pipeline", "ml_tensor", "Tensor", "Tensor flowing through a model or pipeline.", "box", "#0f766e", 138, ["ml_model", "ml_layer", "ml_training_stage"], [
        textField("shape", "Shape", "N,C,H,W"),
        textField("dtype", "DType", "float32, bf16"),
        textField("semantic", "Semantic", "tokens, logits, labels")
      ]),
      extensionAttachment("@graphcode/extension-ml-pipeline", "ml_experiment", "Experiment", "Experiment run, sweep, or tracking metadata.", "flask-conical", "#c026d3", 139, ["ml_pipeline", "ml_training_stage"], [
        textField("tracker", "Tracker", "wandb, mlflow, tensorboard"),
        textField("runId", "Run ID", "abc123"),
        textField("sweep", "Sweep", "lr x batch")
      ])
    ]
  }
];

export const EXTENSION_NODE_KIND_DEFINITIONS: ExtensionNodeKindDefinition[] = AVAILABLE_EXTENSION_PACKAGES.flatMap((extensionPackage) => extensionPackage.nodeKinds);

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
  extensionDetails: ExtensionNodeDetails[];
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
  extensionDetails: Array<{ node: GraphNode; details: ExtensionNodeDetails }>;
  incomingEdges: GraphEdge[];
  outgoingEdges: GraphEdge[];
  relatedNodes: GraphNode[];
  reusedIn: GraphNodeReuse[];
};

export const isDomainNodeKind = (kind: GraphNodeKind): kind is DomainNodeKind =>
  DOMAIN_NODE_KINDS.includes(kind as DomainNodeKind);

export const isAttachmentNodeKind = (kind: GraphNodeKind): kind is AttachmentNodeKind =>
  ATTACHMENT_NODE_KINDS.includes(kind as AttachmentNodeKind);

export const isExtensionNodeKind = (kind: GraphNodeKind): boolean =>
  isExtensionDomainNodeKind(kind) || isExtensionAttachmentNodeKind(kind);

export const isExtensionDomainNodeKind = (kind: GraphNodeKind): boolean =>
  EXTENSION_DOMAIN_NODE_KINDS.includes(kind as (typeof EXTENSION_DOMAIN_NODE_KINDS)[number]);

export const isExtensionAttachmentNodeKind = (kind: GraphNodeKind): boolean =>
  EXTENSION_ATTACHMENT_NODE_KINDS.includes(kind as (typeof EXTENSION_ATTACHMENT_NODE_KINDS)[number]);

export type ExtensionNodeKind = (typeof EXTENSION_DOMAIN_NODE_KINDS)[number] | (typeof EXTENSION_ATTACHMENT_NODE_KINDS)[number];

export function extensionPackageForNodeKind(kind: GraphNodeKind): GraphExtensionPackage | null {
  return AVAILABLE_EXTENSION_PACKAGES.find((extensionPackage) => extensionPackage.nodeKinds.some((definition) => definition.kind === kind)) ?? null;
}

export function extensionNodeDefinitionForKind(kind: GraphNodeKind): ExtensionNodeKindDefinition | null {
  return EXTENSION_NODE_KIND_DEFINITIONS.find((definition) => definition.kind === kind) ?? null;
}

export function extensionPackageById(packageId: ExtensionPackageId): GraphExtensionPackage {
  return AVAILABLE_EXTENSION_PACKAGES.find((extensionPackage) => extensionPackage.id === packageId)!;
}

function extensionDomain(
  packageId: ExtensionPackageId,
  kind: GraphNodeKind,
  label: string,
  description: string,
  icon: string,
  color: string,
  sortOrder: number,
  parentKinds: GraphNodeKind[],
  fields: ExtensionFieldDefinition[]
): ExtensionNodeKindDefinition {
  return {
    packageId,
    kind,
    label,
    description,
    category: "domain",
    icon,
    color,
    sortOrder,
    defaultSize: { width: 272, height: 140 },
    parentKinds,
    attachableToKinds: [],
    detailSchemaId: kind,
    fields
  };
}

function extensionAttachment(
  packageId: ExtensionPackageId,
  kind: GraphNodeKind,
  label: string,
  description: string,
  icon: string,
  color: string,
  sortOrder: number,
  attachableToKinds: GraphNodeKind[],
  fields: ExtensionFieldDefinition[]
): ExtensionNodeKindDefinition {
  return {
    packageId,
    kind,
    label,
    description,
    category: "attachment",
    icon,
    color,
    sortOrder,
    defaultSize: { width: 224, height: 112 },
    parentKinds: [],
    attachableToKinds,
    detailSchemaId: kind,
    fields
  };
}

function textField(key: string, label: string, placeholder?: string): ExtensionFieldDefinition {
  return { key, label, type: "string", placeholder };
}

function numberField(key: string, label: string): ExtensionFieldDefinition {
  return { key, label, type: "number" };
}

function enumField(key: string, label: string, options: string[]): ExtensionFieldDefinition {
  return { key, label, type: "enum", options };
}

function textAreaField(key: string, label: string): ExtensionFieldDefinition {
  return { key, label, type: "textarea" };
}

function rosInterfaceFields(interfaceKind: string): ExtensionFieldDefinition[] {
  return [
    textField("interfaceName", "Interface Name", `/${interfaceKind}_name`),
    textField("messageType", "Message Type", "std_msgs/msg/String"),
    enumField("direction", "Direction", ["publish", "subscribe", "client", "server", "feedback", "goal", "result"]),
    textField("qos", "QoS", "reliable, best_effort, depth=10")
  ];
}
