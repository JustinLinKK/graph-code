import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  AGENT_KINDS,
  type AgentConfig,
  type AgentConfigView,
  type AgentKind,
  type AgentMessage,
  type AgentRun,
  type AgentRunStatus,
  type AgentStatus,
  BASIC_DETAIL_NODE_KINDS,
  type BlockExecutionMetadata,
  type BasicBlockDetails,
  type BasicDetailNodeKind,
  type BoundaryMutation,
  type BoundaryUpdate,
  type CanvasGraph,
  CODING_AGENT_MODES,
  type CodingAgentConfig,
  type CodingAgentConfigView,
  type CodingAgentMode,
  type CodingWorkflow,
  type CodingWorkflowItem,
  type CodingWorkflowItemStatus,
  type CodingWorkflowModeOverride,
  type CodeProposalArtifactManifest,
  type CreateCustomBlockType,
  type CustomBlockType,
  type CustomBlockTypeUpdate,
  DEPENDENCY_KINDS,
  DOMAIN_NODE_KINDS,
  type DependencyDetails,
  type DependencyKind,
  type EdgeMutation,
  type EdgePointingDirection,
  type EdgeUpdate,
  boundaryMutationSchema,
  boundaryUpdateSchema,
  edgeMutationSchema,
  edgeUpdateSchema,
  FORMAT_KINDS,
  type FormatDetails,
  type FormatKind,
  GRAPH_EDGE_KINDS,
  type GraphBoundary,
  type GraphEdge,
  type GraphEdgeKind,
  type GraphPatch,
  type GraphPatchOperation,
  graphPatchSchema,
  type GraphStatusHistory,
  type GraphStatusPatch,
  type GraphNode,
  type GraphNodeKind,
  type GraphNodeReuse,
  type GraphTag,
  type HierarchyBoundaryGroup,
  type HierarchyBoundaryLabel,
  type HierarchyNode,
  IO_KINDS,
  type IoDetails,
  type IoKind,
  type LayoutPatch,
  LANGUAGE_TYPES,
  type LanguageType,
  type NodeDetail,
  type NodeMutation,
  type NodeReuseMutation,
  type NodeTypeStyle,
  type NodeTypeStyleUpdate,
  type NodeUpdate,
  nodeMutationSchema,
  nodeUpdateSchema,
  PROCESS_KINDS,
  type ProcessDetails,
  type ProcessKind,
  type Project,
  SCANNING_AGENT_MODES,
  type ScanningAgentConfig,
  type ScanningAgentConfigView,
  type ScanningAgentMode,
  type SettingsValidationResult,
  type TagAssignment,
  type TagMutation,
  type WorkspaceSettings,
  type WorkspaceSettingsMutation,
  blockExecutionMetadataSchema,
  codeProposalArtifactManifestSchema,
  isAttachmentNodeKind,
  isDomainNodeKind
} from "@graphcode/graph-model";
import type { ScanEdgeDraft, ScanNodeDraft, ScanPipelineResult } from "@graphcode/agent-runtime";
import { codeGraphId, type CodeGraphSnapshot, type CodeGraphSymbol, type CodeGraphWorkflowNode } from "@graphcode/parser";
import type { GraphDatabase } from "./connection";
import { layoutCanvasWithBoundaryGroups } from "../layout/elk";

const ROLE_AGENT_KINDS: AgentKind[] = ["planning", "review", "scanning"];

type ProjectRow = {
  id: string;
  name: string;
  root_path: string;
  description: string;
  scanning_instructions: string;
  created_at: string;
  updated_at: string;
};

type NodeRow = {
  id: string;
  project_id: string;
  kind: GraphNodeKind;
  name: string;
  summary: string;
  code_context: string;
  code_directory: string | null;
  code_start_line: number | null;
  code_end_line: number | null;
  language: LanguageType;
  parent_id: string | null;
  attached_to_id: string | null;
  custom_type_id: string | null;
  source_path: string | null;
  source_start_line: number | null;
  source_end_line: number | null;
  test_script_directory: string | null;
  virtual_environment: string | null;
  working_directory: string | null;
  setup_command: string | null;
  test_command: string | null;
  ui_x: number;
  ui_y: number;
  ui_width: number;
  ui_height: number;
  agent_status: AgentStatus;
  created_at: string;
  updated_at: string;
};

type CustomBlockTypeRow = {
  id: string;
  project_id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  created_at: string;
  updated_at: string;
};

type EdgeRow = {
  id: string;
  project_id: string;
  kind: GraphEdgeKind;
  source_node_id: string;
  target_node_id: string;
  label: string | null;
  code_context: string;
  source_path: string | null;
  source_start_line: number | null;
  source_end_line: number | null;
  color: string;
  animated: 0 | 1;
  pointing_enabled: 0 | 1;
  pointing_direction: EdgePointingDirection;
  agent_status: AgentStatus;
  created_at: string;
};

type WorkspaceSettingsRow = {
  project_id: string;
  theme: WorkspaceSettings["general"]["theme"];
  github_enabled: 0 | 1;
  github_repository: string;
  github_client_id: string;
  github_access_token: string;
  github_user_login: string;
  github_token_scopes: string;
  github_connected_at: string | null;
  github_last_validated_at: string | null;
  auto_review_after_coding: 0 | 1;
};

type AgentSettingsRow = {
  project_id: string;
  agent_kind: AgentKind;
  provider: AgentConfig["provider"];
  model: string;
  parallel_limit: number;
  api_key_source_type: AgentConfig["apiKeySource"]["type"];
  api_key_source_value: string;
  system_prompt_source_type: AgentConfig["systemPromptSource"]["type"];
  system_prompt_source_value: string;
};

type CodingAgentSettingsRow = {
  project_id: string;
  coding_mode: CodingAgentMode;
  provider: CodingAgentConfig["provider"];
  model: string;
  parallel_limit: number;
  api_key_source_type: CodingAgentConfig["apiKeySource"]["type"];
  api_key_source_value: string;
  system_prompt_source_type: CodingAgentConfig["systemPromptSource"]["type"];
  system_prompt_source_value: string;
};

type ScanningAgentSettingsRow = {
  project_id: string;
  scanning_mode: ScanningAgentMode;
  provider: ScanningAgentConfig["provider"];
  model: string;
  parallel_limit: number;
  api_key_source_type: ScanningAgentConfig["apiKeySource"]["type"];
  api_key_source_value: string;
  system_prompt_source_type: ScanningAgentConfig["systemPromptSource"]["type"];
  system_prompt_source_value: string;
};

export type ScanFileState = {
  projectId: string;
  filePath: string;
  contentHash: string;
  lastRunId: string | null;
  lastScannedAt: string;
};

type ScanFileStateRow = {
  project_id: string;
  file_path: string;
  content_hash: string;
  last_run_id: string | null;
  last_scanned_at: string;
};

type AgentRunRow = {
  id: string;
  project_id: string;
  agent_kind: AgentKind;
  coding_mode: CodingAgentMode | null;
  status: AgentRunStatus;
  base_graph_revision: number;
  applied_graph_revision: number | null;
  conflict_reason: string | null;
  target_node_id: string | null;
  prompt: string;
  response: string;
  diff: string;
  graph_patch_json: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

type GraphEntityVersionRow = {
  project_id: string;
  entity_type: GraphPatchOperation["entityType"];
  entity_id: string;
  revision: number;
  deleted: 0 | 1;
  updated_at: string;
};

type GraphEntityVersionInput = {
  entityType: GraphPatchOperation["entityType"];
  entityId: string;
  deleted: boolean;
};

type CodeProposalRow = {
  id: string;
  project_id: string;
  agent_run_id: string | null;
  target_node_id: string | null;
  diff: string;
  artifact_manifest_json: string | null;
  created_at: string;
};

type StoredCodeProposal = {
  id: string;
  projectId: string;
  agentRunId: string | null;
  targetNodeId: string | null;
  diff: string;
  artifactManifest: CodeProposalArtifactManifest | null;
  createdAt: string;
};

type CodingWorkflowRow = {
  id: string;
  project_id: string;
  scope_node_id: string;
  status: CodingWorkflow["status"];
  current_layer: number;
  summary: string;
  created_at: string;
  updated_at: string;
};

type CodingWorkflowItemRow = {
  id: string;
  workflow_id: string;
  project_id: string;
  node_id: string;
  node_name: string;
  node_kind: GraphNodeKind;
  layer_index: number;
  recommended_mode: CodingAgentMode;
  selected_mode: CodingAgentMode;
  mode_reason: string;
  status: CodingWorkflowItemStatus;
  conflict_group: string;
  agent_run_id: string | null;
  proposal_id: string | null;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
};


type AgentMessageRow = {
  id: string;
  run_id: string;
  role: AgentMessage["role"];
  content: string;
  created_at: string;
};

type GraphStatusHistoryRow = {
  id: string;
  project_id: string;
  entity_type: GraphStatusPatch["entityType"];
  entity_id: string;
  status: AgentStatus;
  note: string;
  agent_run_id: string | null;
  created_at: string;
};

type BoundaryRow = {
  id: string;
  project_id: string;
  scope_node_id: string;
  name: string;
  summary: string;
  code_context: string;
  color: string;
  ui_x: number;
  ui_y: number;
  ui_width: number;
  ui_height: number;
  created_at: string;
  updated_at: string;
};

type NodeTypeStyleRow = {
  project_id: string;
  node_kind: GraphNodeKind;
  color: string;
  created_at: string;
  updated_at: string;
};

type TagRow = {
  id: string;
  project_id: string;
  name: string;
  normalized_name: string;
  color: string;
  created_at: string;
  updated_at: string;
};

type NodeReuseRow = {
  id: string;
  project_id: string;
  scope_node_id: string;
  node_id: string;
  label: string;
  context: string;
  created_at: string;
  updated_at: string;
};

type DependencyRow = {
  node_id: string;
  dependency_kind: DependencyKind;
  spec: string;
  version: string | null;
  required: 0 | 1;
  notes: string;
};

type IoRow = {
  node_id: string;
  io_kind: IoKind;
  channel: string;
  schema_hint: string | null;
  notes: string;
};

type ProcessRow = {
  node_id: string;
  process_kind: ProcessKind;
  trigger: string | null;
  notes: string;
};

type FormatRow = {
  node_id: string;
  format_kind: FormatKind;
  spec: string;
  example: string | null;
  notes: string;
};

type BasicBlockRow = {
  node_id: string;
  basic_kind: BasicDetailNodeKind;
  key: string;
  value_hint: string | null;
  required: 0 | 1;
  notes: string;
};

type LayoutRow = {
  node_id: string;
  ui_x: number;
  ui_y: number;
  ui_width: number;
  ui_height: number;
};

export type NewGraphNode = {
  id: string;
  projectId: string;
  kind: GraphNodeKind;
  name: string;
  summary?: string;
  codeContext?: string;
  codeDirectory?: string | null;
  codeStartLine?: number | null;
  codeEndLine?: number | null;
  language?: LanguageType;
  parentId?: string | null;
  attachedToId?: string | null;
  customTypeId?: string | null;
  sourcePath?: string | null;
  sourceStartLine?: number | null;
  sourceEndLine?: number | null;
  execution?: Partial<BlockExecutionMetadata>;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  agentStatus?: AgentStatus;
};

type NewGraphEdge = {
  id: string;
  projectId: string;
  kind: GraphEdgeKind;
  sourceNodeId: string;
  targetNodeId: string;
  label?: string | null;
  codeContext?: string;
  sourcePath?: string | null;
  sourceStartLine?: number | null;
  sourceEndLine?: number | null;
  color?: string;
  animated?: boolean;
  pointingEnabled?: boolean;
  pointingDirection?: EdgePointingDirection;
  agentStatus?: AgentStatus;
};

type NewGraphBoundary = {
  id: string;
  projectId: string;
  scopeNodeId: string;
  name: string;
  summary?: string;
  codeContext?: string;
  color?: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
};

type NewDependencyDetails = {
  nodeId: string;
  dependencyKind: DependencyKind;
  spec: string;
  version?: string | null;
  required?: boolean;
  notes?: string;
};

type NewIoDetails = {
  nodeId: string;
  ioKind: IoKind;
  channel: string;
  schemaHint?: string | null;
  notes?: string;
};

type NewProcessDetails = {
  nodeId: string;
  processKind: ProcessKind;
  trigger?: string | null;
  notes?: string;
};

type NewFormatDetails = {
  nodeId: string;
  formatKind: FormatKind;
  spec: string;
  example?: string | null;
  notes?: string;
};

type NewBasicBlockDetails = {
  nodeId: string;
  basicKind: BasicDetailNodeKind;
  key?: string;
  valueHint?: string | null;
  required?: boolean;
  notes?: string;
};

export type CodeGraphRefreshResult = {
  nodeCount: number;
  edgeCount: number;
  fileCount: number;
  symbolCount: number;
  workflowNodeCount: number;
};

export class GraphRepository {
  private suppressGraphVersionBumps = false;

  constructor(private readonly db: GraphDatabase) {}

  currentGraphRevision(projectId: string): number {
    this.getProject(projectId);
    const row = this.db
      .prepare("SELECT COALESCE(MAX(revision), 0) AS revision FROM graph_revisions WHERE project_id = ?")
      .get(projectId) as { revision: number } | undefined;
    return row?.revision ?? 0;
  }

  listProjects(): Project[] {
    const rows = this.db.prepare("SELECT * FROM projects ORDER BY created_at ASC").all() as ProjectRow[];
    return rows.map(mapProject);
  }

  listScanFileStates(projectId: string): ScanFileState[] {
    this.getProject(projectId);
    const rows = this.db
      .prepare("SELECT * FROM scan_file_state WHERE project_id = ? ORDER BY file_path ASC")
      .all(projectId) as ScanFileStateRow[];
    return rows.map(mapScanFileState);
  }

  replaceScanFileStates(projectId: string, states: Array<{ filePath: string; contentHash: string }>, runId?: string | null): void {
    this.getProject(projectId);
    const write = this.db.transaction(() => {
      this.db.prepare("DELETE FROM scan_file_state WHERE project_id = ?").run(projectId);
      const insert = this.db.prepare(
        `
        INSERT INTO scan_file_state (project_id, file_path, content_hash, last_run_id, last_scanned_at)
        VALUES (@projectId, @filePath, @contentHash, @lastRunId, datetime('now'))
      `
      );
      for (const state of states) {
        insert.run({
          projectId,
          filePath: state.filePath,
          contentHash: state.contentHash,
          lastRunId: runId ?? null
        });
      }
    });
    write();
  }

  getWorkspaceSettings(projectId: string): WorkspaceSettings {
    this.ensureDefaultSettings(projectId);
    const row = this.db.prepare("SELECT * FROM workspace_settings WHERE project_id = ?").get(projectId) as WorkspaceSettingsRow;
    const agentRows = this.db
      .prepare("SELECT * FROM agent_settings WHERE project_id = ? AND agent_kind != 'coding' ORDER BY agent_kind ASC")
      .all(projectId) as AgentSettingsRow[];
    const codingAgentRows = this.db
      .prepare("SELECT * FROM coding_agent_settings WHERE project_id = ? ORDER BY CASE coding_mode WHEN 'small' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END")
      .all(projectId) as CodingAgentSettingsRow[];
    const scanningAgentRows = this.db
      .prepare(
        "SELECT * FROM scanning_agent_settings WHERE project_id = ? ORDER BY CASE scanning_mode WHEN 'local' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END"
      )
      .all(projectId) as ScanningAgentSettingsRow[];
    return {
      general: {
        theme: row.theme
      },
      github: {
        enabled: row.github_enabled === 1,
        repository: row.github_repository,
        clientId: row.github_client_id ?? "",
        auth: {
          connected: Boolean((row.github_access_token ?? "").trim() && (row.github_user_login ?? "").trim()),
          username: row.github_user_login || null,
          tokenConfigured: Boolean((row.github_access_token ?? "").trim()),
          scopes: parseScopes(row.github_token_scopes ?? ""),
          connectedAt: row.github_connected_at ?? null,
          lastValidatedAt: row.github_last_validated_at ?? null
        }
      },
      automation: {
        autoReviewAfterCoding: row.auto_review_after_coding !== 0
      },
      agents: agentRows.map(mapAgentSettingsView),
      codingAgents: codingAgentRows.map(mapCodingAgentSettingsView),
      scanningAgents: scanningAgentRows.map(mapScanningAgentSettingsView)
    };
  }

  getAgentConfig(projectId: string, agentKind: AgentKind): AgentConfig {
    this.ensureDefaultSettings(projectId);
    const row = this.db
      .prepare("SELECT * FROM agent_settings WHERE project_id = ? AND agent_kind = ?")
      .get(projectId, agentKind) as AgentSettingsRow | undefined;
    if (!row) {
      return defaultAgentConfig(agentKind);
    }
    return mapAgentSettings(row);
  }

  getCodingAgentConfig(projectId: string, mode: CodingAgentMode): CodingAgentConfig {
    this.ensureDefaultSettings(projectId);
    const row = this.db
      .prepare("SELECT * FROM coding_agent_settings WHERE project_id = ? AND coding_mode = ?")
      .get(projectId, mode) as CodingAgentSettingsRow | undefined;
    if (!row) {
      return defaultCodingAgentConfig(mode);
    }
    return mapCodingAgentSettings(row);
  }

  getScanningAgentConfig(projectId: string, mode: ScanningAgentMode): ScanningAgentConfig {
    this.ensureDefaultSettings(projectId);
    const row = this.db
      .prepare("SELECT * FROM scanning_agent_settings WHERE project_id = ? AND scanning_mode = ?")
      .get(projectId, mode) as ScanningAgentSettingsRow | undefined;
    if (!row) {
      return defaultScanningAgentConfig(mode);
    }
    return mapScanningAgentSettings(row);
  }

  saveWorkspaceSettings(projectId: string, input: WorkspaceSettingsMutation): WorkspaceSettings {
    this.getProject(projectId);
    const codingAgents = input.codingAgents ?? [];
    const scanningAgents = input.scanningAgents ?? [];
    const write = this.db.transaction(() => {
      this.db
        .prepare(
          `
          INSERT INTO workspace_settings (project_id, theme, github_enabled, github_repository, github_client_id, auto_review_after_coding, created_at, updated_at)
          VALUES (@projectId, @theme, @githubEnabled, @githubRepository, @githubClientId, @autoReviewAfterCoding, datetime('now'), datetime('now'))
          ON CONFLICT(project_id)
          DO UPDATE SET
            theme = excluded.theme,
            github_enabled = excluded.github_enabled,
            github_repository = excluded.github_repository,
            github_client_id = excluded.github_client_id,
            auto_review_after_coding = excluded.auto_review_after_coding,
            updated_at = datetime('now')
        `
        )
        .run({
          projectId,
          theme: input.general.theme,
          githubEnabled: input.github.enabled ? 1 : 0,
          githubRepository: input.github.repository.trim(),
          githubClientId: input.github.clientId.trim(),
          autoReviewAfterCoding: input.automation.autoReviewAfterCoding ? 1 : 0
        });

      let legacyCodingAgent: AgentConfig | null = null;
      for (const agent of input.agents) {
        if (agent.agentKind === "coding") {
          const existing = this.getAgentConfig(projectId, agent.agentKind);
          const apiKeyValue = agent.apiKeySource.value?.trim()
            ? agent.apiKeySource.value
            : agent.apiKeySource.type === existing.apiKeySource.type
              ? existing.apiKeySource.value
              : "";
          const systemPromptValue = agent.systemPromptSource.value?.trim()
            ? agent.systemPromptSource.value
            : agent.systemPromptSource.type === existing.systemPromptSource.type
              ? existing.systemPromptSource.value
              : "";
          legacyCodingAgent = {
            ...agent,
            apiKeySource: {
              ...agent.apiKeySource,
              value: apiKeyValue
            },
            systemPromptSource: {
              ...agent.systemPromptSource,
              value: systemPromptValue
            }
          };
          this.upsertAgentSettings(projectId, legacyCodingAgent);
          continue;
        }
        const existing = this.getAgentConfig(projectId, agent.agentKind);
        const apiKeyValue = agent.apiKeySource.value?.trim()
          ? agent.apiKeySource.value
          : agent.apiKeySource.type === existing.apiKeySource.type
            ? existing.apiKeySource.value
            : "";
        const systemPromptValue = agent.systemPromptSource.value?.trim()
          ? agent.systemPromptSource.value
          : agent.systemPromptSource.type === existing.systemPromptSource.type
            ? existing.systemPromptSource.value
            : "";
        this.upsertAgentSettings(projectId, {
          ...agent,
          apiKeySource: {
            ...agent.apiKeySource,
            value: apiKeyValue
          },
          systemPromptSource: {
            ...agent.systemPromptSource,
            value: systemPromptValue
          }
        });
      }
      for (const agentKind of ROLE_AGENT_KINDS) {
        if (!input.agents.some((agent) => agent.agentKind === agentKind)) {
          this.upsertAgentSettings(projectId, defaultAgentConfig(agentKind));
        }
      }
      if (codingAgents.length > 0) {
        for (const codingAgent of codingAgents) {
          const existing = this.getCodingAgentConfig(projectId, codingAgent.mode);
          const apiKeyValue = codingAgent.apiKeySource.value?.trim()
            ? codingAgent.apiKeySource.value
            : codingAgent.apiKeySource.type === existing.apiKeySource.type
              ? existing.apiKeySource.value
              : "";
          const systemPromptValue = codingAgent.systemPromptSource.value?.trim()
            ? codingAgent.systemPromptSource.value
            : codingAgent.systemPromptSource.type === existing.systemPromptSource.type
              ? existing.systemPromptSource.value
              : "";
          this.upsertCodingAgentSettings(projectId, {
            ...codingAgent,
            apiKeySource: {
              ...codingAgent.apiKeySource,
              value: apiKeyValue
            },
            systemPromptSource: {
              ...codingAgent.systemPromptSource,
              value: systemPromptValue
            }
          });
        }
      } else if (legacyCodingAgent) {
        for (const mode of CODING_AGENT_MODES) {
          this.upsertCodingAgentSettings(projectId, {
            mode,
            provider: legacyCodingAgent.provider,
            model: legacyCodingAgent.model,
            parallelLimit: legacyCodingAgent.parallelLimit,
            apiKeySource: legacyCodingAgent.apiKeySource,
            systemPromptSource: legacyCodingAgent.systemPromptSource
          });
        }
      }
      for (const mode of CODING_AGENT_MODES) {
        if (!this.hasCodingAgentSettings(projectId, mode)) {
          this.upsertCodingAgentSettings(projectId, defaultCodingAgentConfig(mode));
        }
      }
      if (scanningAgents.length > 0) {
        for (const scanningAgent of scanningAgents) {
          const existing = this.getScanningAgentConfig(projectId, scanningAgent.mode);
          const apiKeyValue = scanningAgent.apiKeySource.value?.trim()
            ? scanningAgent.apiKeySource.value
            : scanningAgent.apiKeySource.type === existing.apiKeySource.type
              ? existing.apiKeySource.value
              : "";
          const systemPromptValue = scanningAgent.systemPromptSource.value?.trim()
            ? scanningAgent.systemPromptSource.value
            : scanningAgent.systemPromptSource.type === existing.systemPromptSource.type
              ? existing.systemPromptSource.value
              : "";
          this.upsertScanningAgentSettings(projectId, {
            ...scanningAgent,
            apiKeySource: {
              ...scanningAgent.apiKeySource,
              value: apiKeyValue
            },
            systemPromptSource: {
              ...scanningAgent.systemPromptSource,
              value: systemPromptValue
            }
          });
        }
      }
      for (const mode of SCANNING_AGENT_MODES) {
        if (!this.hasScanningAgentSettings(projectId, mode)) {
          this.upsertScanningAgentSettings(projectId, defaultScanningAgentConfig(mode));
        }
      }
    });
    write();
    return this.getWorkspaceSettings(projectId);
  }

  getGithubAccessToken(projectId: string): string | null {
    this.ensureDefaultSettings(projectId);
    const row = this.db.prepare("SELECT github_access_token FROM workspace_settings WHERE project_id = ?").get(projectId) as
      | { github_access_token: string }
      | undefined;
    return row?.github_access_token?.trim() || null;
  }

  saveGithubAuth(input: { projectId: string; accessToken: string; username: string; scopes: string[] }): WorkspaceSettings {
    this.ensureDefaultSettings(input.projectId);
    this.db
      .prepare(
        `
        UPDATE workspace_settings
        SET
          github_access_token = @accessToken,
          github_user_login = @username,
          github_token_scopes = @scopes,
          github_connected_at = COALESCE(github_connected_at, datetime('now')),
          github_last_validated_at = datetime('now'),
          updated_at = datetime('now')
        WHERE project_id = @projectId
      `
      )
      .run({
        projectId: input.projectId,
        accessToken: input.accessToken,
        username: input.username,
        scopes: input.scopes.join(",")
      });
    return this.getWorkspaceSettings(input.projectId);
  }

  disconnectGithub(projectId: string): WorkspaceSettings {
    this.ensureDefaultSettings(projectId);
    this.db
      .prepare(
        `
        UPDATE workspace_settings
        SET
          github_access_token = '',
          github_user_login = '',
          github_token_scopes = '',
          github_connected_at = NULL,
          github_last_validated_at = NULL,
          updated_at = datetime('now')
        WHERE project_id = ?
      `
      )
      .run(projectId);
    return this.getWorkspaceSettings(projectId);
  }

  validateWorkspaceSettings(projectId: string, input: WorkspaceSettingsMutation): SettingsValidationResult {
    this.getProject(projectId);
    const fieldErrors: Record<string, string> = {};
    const seen = new Set<AgentKind>();
    const codingAgents = input.codingAgents ?? [];
    const scanningAgents = input.scanningAgents ?? [];
    if (input.github.enabled) {
      if (!input.github.repository.trim()) {
        fieldErrors["github.repository"] = "Repository is required when GitHub integration is enabled.";
      }
      if (!input.github.clientId.trim() && !process.env.GRAPHCODE_GITHUB_CLIENT_ID?.trim()) {
        fieldErrors["github.clientId"] = "GitHub OAuth client ID is required to connect.";
      }
    }
    input.agents.forEach((agent, index) => {
      const existing = this.getAgentConfig(projectId, agent.agentKind);
      const effectiveApiKeyValue =
        agent.apiKeySource.value?.trim() || (agent.apiKeySource.type === existing.apiKeySource.type ? (existing.apiKeySource.value ?? "").trim() : "");
      const effectiveSystemPromptValue =
        agent.systemPromptSource.value?.trim() ||
        (agent.systemPromptSource.type === existing.systemPromptSource.type ? (existing.systemPromptSource.value ?? "").trim() : "");
      if (seen.has(agent.agentKind)) {
        fieldErrors[`agents.${index}.agentKind`] = "Each agent can only be configured once.";
      }
      seen.add(agent.agentKind);
      if (!agent.model.trim()) {
        fieldErrors[`agents.${index}.model`] = "Model is required.";
      }
      if (agent.provider !== "fake" && agent.provider !== "claudecode") {
        if (!effectiveApiKeyValue) {
          fieldErrors[`agents.${index}.apiKeySource.value`] = "API key source is required for hosted providers.";
        } else if (agent.apiKeySource.type === "env" && !process.env[effectiveApiKeyValue]?.trim()) {
          fieldErrors[`agents.${index}.apiKeySource.value`] = `Environment variable ${effectiveApiKeyValue} is not set.`;
        }
      }
      if (agent.provider === "claudecode" && !agent.model.trim()) {
        fieldErrors[`agents.${index}.model`] = "Claude Code command or model label is required.";
      }
      if (agent.systemPromptSource.type === "file" && !effectiveSystemPromptValue) {
        fieldErrors[`agents.${index}.systemPromptSource.value`] = "System prompt file content is required.";
      }
    });
    const seenCodingModes = new Set<CodingAgentMode>();
    codingAgents.forEach((agent, index) => {
      const existing = this.getCodingAgentConfig(projectId, agent.mode);
      const effectiveApiKeyValue =
        agent.apiKeySource.value?.trim() || (agent.apiKeySource.type === existing.apiKeySource.type ? (existing.apiKeySource.value ?? "").trim() : "");
      const effectiveSystemPromptValue =
        agent.systemPromptSource.value?.trim() ||
        (agent.systemPromptSource.type === existing.systemPromptSource.type ? (existing.systemPromptSource.value ?? "").trim() : "");
      if (seenCodingModes.has(agent.mode)) {
        fieldErrors[`codingAgents.${index}.mode`] = "Each coding mode can only be configured once.";
      }
      seenCodingModes.add(agent.mode);
      if (!agent.model.trim()) {
        fieldErrors[`codingAgents.${index}.model`] = "Model is required.";
      }
      if (agent.provider !== "fake" && agent.provider !== "claudecode") {
        if (!effectiveApiKeyValue) {
          fieldErrors[`codingAgents.${index}.apiKeySource.value`] = "API key source is required for hosted providers.";
        } else if (agent.apiKeySource.type === "env" && !process.env[effectiveApiKeyValue]?.trim()) {
          fieldErrors[`codingAgents.${index}.apiKeySource.value`] = `Environment variable ${effectiveApiKeyValue} is not set.`;
        }
      }
      if (agent.provider === "claudecode" && !agent.model.trim()) {
        fieldErrors[`codingAgents.${index}.model`] = "Claude Code command or model label is required.";
      }
      if (agent.systemPromptSource.type === "file" && !effectiveSystemPromptValue) {
        fieldErrors[`codingAgents.${index}.systemPromptSource.value`] = "System prompt file content is required.";
      }
    });
    const seenScanningModes = new Set<ScanningAgentMode>();
    scanningAgents.forEach((agent, index) => {
      const existing = this.getScanningAgentConfig(projectId, agent.mode);
      const effectiveApiKeyValue =
        agent.apiKeySource.value?.trim() || (agent.apiKeySource.type === existing.apiKeySource.type ? (existing.apiKeySource.value ?? "").trim() : "");
      const effectiveSystemPromptValue =
        agent.systemPromptSource.value?.trim() ||
        (agent.systemPromptSource.type === existing.systemPromptSource.type ? (existing.systemPromptSource.value ?? "").trim() : "");
      if (seenScanningModes.has(agent.mode)) {
        fieldErrors[`scanningAgents.${index}.mode`] = "Each scanning mode can only be configured once.";
      }
      seenScanningModes.add(agent.mode);
      if (!agent.model.trim()) {
        fieldErrors[`scanningAgents.${index}.model`] = "Model is required.";
      }
      if (agent.provider !== "fake" && agent.provider !== "claudecode") {
        if (!effectiveApiKeyValue) {
          fieldErrors[`scanningAgents.${index}.apiKeySource.value`] = "API key source is required for hosted providers.";
        } else if (agent.apiKeySource.type === "env" && !process.env[effectiveApiKeyValue]?.trim()) {
          fieldErrors[`scanningAgents.${index}.apiKeySource.value`] = `Environment variable ${effectiveApiKeyValue} is not set.`;
        }
      }
      if (agent.provider === "claudecode" && !agent.model.trim()) {
        fieldErrors[`scanningAgents.${index}.model`] = "Claude Code command or model label is required.";
      }
      if (agent.systemPromptSource.type === "file" && !effectiveSystemPromptValue) {
        fieldErrors[`scanningAgents.${index}.systemPromptSource.value`] = "System prompt file content is required.";
      }
    });

    return {
      ok: Object.keys(fieldErrors).length === 0,
      testedAt: new Date().toISOString(),
      fieldErrors
    };
  }

  listAgentRuns(projectId: string, limit = 24): AgentRun[] {
    this.getProject(projectId);
    const rows = this.db
      .prepare("SELECT * FROM agent_runs WHERE project_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(projectId, limit) as AgentRunRow[];
    return rows.map(mapAgentRun);
  }

  getAgentRun(runId: string): AgentRun {
    const row = this.db.prepare("SELECT * FROM agent_runs WHERE id = ?").get(runId) as AgentRunRow | undefined;
    if (!row) {
      throw notFound(`Agent run not found: ${runId}`);
    }
    return mapAgentRun(row);
  }

  createAgentRun(input: {
    projectId: string;
    agentKind: AgentKind;
    codingMode?: CodingAgentMode | null;
    targetNodeId?: string | null;
    prompt?: string;
    status?: AgentRunStatus;
    response?: string;
    diff?: string;
    graphPatch?: GraphPatch | null;
    error?: string | null;
  }): AgentRun {
    this.getProject(input.projectId);
    if (input.targetNodeId) {
      this.getNode(input.targetNodeId);
    }
    const id = `run-${crypto.randomUUID()}`;
    this.db
      .prepare(
        `
        INSERT INTO agent_runs (
          id, project_id, agent_kind, coding_mode, status,
          base_graph_revision, applied_graph_revision, conflict_reason, target_node_id,
          prompt, response, diff, graph_patch_json, error
        )
        VALUES (
          @id, @projectId, @agentKind, @codingMode, @status,
          @baseGraphRevision, @appliedGraphRevision, @conflictReason, @targetNodeId,
          @prompt, @response, @diff, @graphPatchJson, @error
        )
      `
      )
      .run({
        id,
        projectId: input.projectId,
        agentKind: input.agentKind,
        codingMode: input.agentKind === "coding" ? (input.codingMode ?? "medium") : null,
        status: input.status ?? "queued",
        baseGraphRevision: this.currentGraphRevision(input.projectId),
        appliedGraphRevision: null,
        conflictReason: null,
        targetNodeId: input.targetNodeId ?? null,
        prompt: input.prompt ?? "",
        response: input.response ?? "",
        diff: input.diff ?? "",
        graphPatchJson: input.graphPatch ? JSON.stringify(input.graphPatch) : null,
        error: input.error ?? null
      });
    return this.getAgentRun(id);
  }

  updateAgentRun(
    runId: string,
    input: Partial<Pick<AgentRun, "status" | "response" | "diff" | "error" | "appliedGraphRevision" | "conflictReason">> & { graphPatch?: GraphPatch | null }
  ): AgentRun {
    const existing = this.getAgentRun(runId);
    this.db
      .prepare(
        `
        UPDATE agent_runs
        SET
          status = @status,
          response = @response,
          diff = @diff,
          graph_patch_json = @graphPatchJson,
          error = @error,
          applied_graph_revision = @appliedGraphRevision,
          conflict_reason = @conflictReason,
          updated_at = datetime('now')
        WHERE id = @id
      `
      )
      .run({
        id: runId,
        status: input.status ?? existing.status,
        response: input.response ?? existing.response,
        diff: input.diff ?? existing.diff,
        graphPatchJson: input.graphPatch === undefined ? (existing.graphPatch ? JSON.stringify(existing.graphPatch) : null) : input.graphPatch ? JSON.stringify(input.graphPatch) : null,
        error: input.error === undefined ? existing.error : input.error,
        appliedGraphRevision: input.appliedGraphRevision === undefined ? existing.appliedGraphRevision : input.appliedGraphRevision,
        conflictReason: input.conflictReason === undefined ? existing.conflictReason : input.conflictReason
      });
    return this.getAgentRun(runId);
  }

  addAgentMessage(input: { runId: string; role: AgentMessage["role"]; content: string }): AgentMessage {
    this.getAgentRun(input.runId);
    const id = `msg-${crypto.randomUUID()}`;
    this.db
      .prepare("INSERT INTO agent_messages (id, run_id, role, content) VALUES (?, ?, ?, ?)")
      .run(id, input.runId, input.role, input.content);
    const row = this.db.prepare("SELECT * FROM agent_messages WHERE id = ?").get(id) as AgentMessageRow;
    return mapAgentMessage(row);
  }

  listAgentMessages(runId: string): AgentMessage[] {
    this.getAgentRun(runId);
    const rows = this.db.prepare("SELECT * FROM agent_messages WHERE run_id = ? ORDER BY created_at ASC").all(runId) as AgentMessageRow[];
    return rows.map(mapAgentMessage);
  }

  setGraphStatuses(projectId: string, patches: GraphStatusPatch[]): GraphStatusHistory[] {
    this.getProject(projectId);
    const saved: GraphStatusHistory[] = [];
    const write = this.db.transaction(() => {
      for (const patch of patches) {
        if (patch.entityType === "node") {
          this.getNode(patch.entityId);
          this.db.prepare("UPDATE graph_nodes SET agent_status = ?, updated_at = datetime('now') WHERE id = ?").run(patch.status, patch.entityId);
        } else if (patch.entityType === "edge") {
          this.getEdge(patch.entityId);
          this.db.prepare("UPDATE graph_edges SET agent_status = ? WHERE id = ?").run(patch.status, patch.entityId);
        } else {
          this.getBoundary(patch.entityId);
        }
        saved.push(this.recordGraphStatusHistory(projectId, patch));
      }
    });
    write();
    return saved;
  }

  private recordGraphStatusHistory(projectId: string, patch: GraphStatusPatch): GraphStatusHistory {
    const id = `status-${crypto.randomUUID()}`;
    this.db
      .prepare(
        `
        INSERT INTO graph_status_history (id, project_id, entity_type, entity_id, status, note, agent_run_id)
        VALUES (@id, @projectId, @entityType, @entityId, @status, @note, @agentRunId)
      `
      )
      .run({
        id,
        projectId,
        entityType: patch.entityType,
        entityId: patch.entityId,
        status: patch.status,
        note: patch.note ?? "",
        agentRunId: patch.agentRunId ?? null
      });
    const row = this.db.prepare("SELECT * FROM graph_status_history WHERE id = ?").get(id) as GraphStatusHistoryRow;
    return mapGraphStatusHistory(row);
  }

  private statusAfterSemanticEdit(input: {
    projectId: string;
    entityType: GraphStatusPatch["entityType"];
    entityId: string;
    currentStatus?: AgentStatus;
    changed: boolean;
    note: string;
  }): AgentStatus | null {
    if (!input.changed) {
      return input.currentStatus ?? null;
    }
    if (input.currentStatus && input.currentStatus !== "planning") {
      this.recordGraphStatusHistory(input.projectId, {
        entityType: input.entityType,
        entityId: input.entityId,
        status: "planning",
        note: `${input.note} Previous status: ${input.currentStatus}.`,
        agentRunId: null
      });
    } else if (!input.currentStatus) {
      this.recordGraphStatusHistory(input.projectId, {
        entityType: input.entityType,
        entityId: input.entityId,
        status: "planning",
        note: input.note,
        agentRunId: null
      });
    }
    return "planning";
  }

  applyAgentGraphPatch(projectId: string, runId: string): AgentRun {
    const run = this.getAgentRun(runId);
    if (run.projectId !== projectId) {
      throw validationError("Agent run does not belong to the selected project.");
    }
    if (run.agentKind !== "planning") {
      throw validationError("Only planning agent graph patches can be applied.");
    }
    if (run.status !== "succeeded") {
      throw validationError("Only succeeded planning runs can be applied.");
    }
    if (run.appliedGraphRevision !== null) {
      return run;
    }
    const operations = run.graphPatch?.operations ?? [];
    if (operations.length === 0) {
      return this.updateAgentRun(run.id, {
        appliedGraphRevision: this.currentGraphRevision(projectId),
        conflictReason: null
      });
    }

    const apply = this.db.transaction(() => {
      const conflictReason = this.findGraphPatchConflict(projectId, run, operations);
      if (conflictReason) {
        return this.updateAgentRun(run.id, {
          status: "conflicted",
          conflictReason
        });
      }

      const touched: GraphEntityVersionInput[] = [];
      this.suppressGraphVersionBumps = true;
      try {
        for (const operation of operations) {
          this.applyGraphPatchOperation(projectId, operation);
          touched.push({
            entityType: operation.entityType,
            entityId: operation.entityId,
            deleted: false
          });
        }
      } finally {
        this.suppressGraphVersionBumps = false;
      }

      const revision = this.bumpGraphEntities(projectId, touched, `Applied planning graph patch from ${run.id}.`);
      return this.updateAgentRun(run.id, {
        appliedGraphRevision: revision,
        conflictReason: null
      });
    });

    return apply();
  }

  private findGraphPatchConflict(projectId: string, run: AgentRun, operations: GraphPatchOperation[]): string | null {
    for (const operation of operations) {
      const exists = this.graphEntityExists(operation.entityType, operation.entityId);
      const version = this.getGraphEntityVersion(projectId, operation.entityType, operation.entityId);
      if (operation.action === "create") {
        if (exists || (version && version.deleted === 0)) {
          return `${operation.entityType} ${operation.entityId} already exists.`;
        }
        continue;
      }
      if (!exists || version?.deleted === 1) {
        return `${operation.entityType} ${operation.entityId} no longer exists.`;
      }
      if ((version?.revision ?? 0) > run.baseGraphRevision) {
        return `${operation.entityType} ${operation.entityId} changed after this ticket started.`;
      }
    }
    return null;
  }

  private applyGraphPatchOperation(projectId: string, operation: GraphPatchOperation): void {
    if (operation.entityType === "node") {
      if (operation.action === "create") {
        const input = nodeMutationSchema.parse(operation.fields);
        this.createNode({
          id: operation.entityId,
          projectId,
          kind: input.kind,
          name: input.name,
          summary: input.summary ?? "",
          codeContext: input.codeContext ?? input.summary ?? "",
          codeDirectory: input.codeDirectory ?? null,
          codeStartLine: input.codeStartLine ?? null,
          codeEndLine: input.codeEndLine ?? null,
          language: input.language ?? "unknown",
          parentId: input.parentId ?? null,
          attachedToId: input.attachedToId ?? null,
          customTypeId: input.customTypeId ?? null,
          sourcePath: input.codeDirectory ?? null,
          sourceStartLine: input.codeStartLine ?? null,
          sourceEndLine: input.codeEndLine ?? null,
          execution: input.execution,
          position: input.position,
          size: input.size,
          agentStatus: "implemented"
        });
      } else {
        this.updateNode(operation.entityId, nodeUpdateSchema.parse(operation.fields));
      }
      return;
    }

    if (operation.entityType === "edge") {
      if (operation.action === "create") {
        const input = edgeMutationSchema.parse(operation.fields);
        this.createEdge({
          id: operation.entityId,
          projectId,
          kind: input.kind,
          sourceNodeId: input.sourceNodeId,
          targetNodeId: input.targetNodeId,
          label: input.label ?? null,
          codeContext: input.codeContext ?? "",
          sourcePath: input.source?.path ?? null,
          sourceStartLine: input.source?.startLine ?? null,
          sourceEndLine: input.source?.endLine ?? null,
          color: input.color,
          animated: input.animated,
          pointingEnabled: input.pointingEnabled,
          pointingDirection: input.pointingDirection,
          agentStatus: "implemented"
        });
      } else {
        this.updateEdge(operation.entityId, edgeUpdateSchema.parse(operation.fields));
      }
      return;
    }

    if (operation.action === "create") {
      const input = boundaryMutationSchema.parse(operation.fields);
      this.createBoundaryRow({
        id: operation.entityId,
        projectId,
        scopeNodeId: input.scopeNodeId,
        name: input.name,
        summary: input.summary ?? "",
        codeContext: input.codeContext ?? "",
        color: input.color,
        position: input.position,
        size: input.size
      });
    } else {
      this.updateBoundary(operation.entityId, boundaryUpdateSchema.parse(operation.fields));
    }
  }

  private getGraphEntityVersion(
    projectId: string,
    entityType: GraphPatchOperation["entityType"],
    entityId: string
  ): GraphEntityVersionRow | null {
    const row = this.db
      .prepare("SELECT * FROM graph_entity_versions WHERE project_id = ? AND entity_type = ? AND entity_id = ?")
      .get(projectId, entityType, entityId) as GraphEntityVersionRow | undefined;
    return row ?? null;
  }

  private graphEntityExists(entityType: GraphPatchOperation["entityType"], entityId: string): boolean {
    const tableName = entityType === "node" ? "graph_nodes" : entityType === "edge" ? "graph_edges" : "graph_boundaries";
    const row = this.db.prepare(`SELECT id FROM ${tableName} WHERE id = ?`).get(entityId) as { id: string } | undefined;
    return Boolean(row);
  }

  private bumpGraphEntities(projectId: string, entities: GraphEntityVersionInput[], note: string): number {
    if (this.suppressGraphVersionBumps || entities.length === 0) {
      return this.currentGraphRevision(projectId);
    }
    const revision = this.recordGraphRevision(projectId, note);
    const upsert = this.db.prepare(
      `
      INSERT INTO graph_entity_versions (project_id, entity_type, entity_id, revision, deleted, updated_at)
      VALUES (@projectId, @entityType, @entityId, @revision, @deleted, datetime('now'))
      ON CONFLICT(project_id, entity_type, entity_id)
      DO UPDATE SET
        revision = excluded.revision,
        deleted = excluded.deleted,
        updated_at = datetime('now')
    `
    );
    const seen = new Set<string>();
    for (const entity of entities) {
      const key = `${entity.entityType}:${entity.entityId}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      upsert.run({
        projectId,
        entityType: entity.entityType,
        entityId: entity.entityId,
        revision,
        deleted: entity.deleted ? 1 : 0
      });
    }
    return revision;
  }

  private recordGraphRevision(projectId: string, note: string): number {
    const revision = this.currentGraphRevision(projectId) + 1;
    this.db
      .prepare("INSERT INTO graph_revisions (id, project_id, revision, note) VALUES (?, ?, ?, ?)")
      .run(`revision-${crypto.randomUUID()}`, projectId, revision, note);
    return revision;
  }

  storeCodeProposal(input: { projectId: string; agentRunId?: string | null; targetNodeId?: string | null; diff: string; artifactManifest?: CodeProposalArtifactManifest | null }): string {
    const project = this.getProject(input.projectId);
    if (input.targetNodeId) {
      this.getNode(input.targetNodeId);
    }
    const id = `proposal-${crypto.randomUUID()}`;
    const artifactManifest = this.writeProposalArtifacts(project, id, input.artifactManifest ?? null);
    this.db
      .prepare("INSERT INTO code_proposals (id, project_id, agent_run_id, target_node_id, diff, artifact_manifest_json) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, input.projectId, input.agentRunId ?? null, input.targetNodeId ?? null, input.diff, artifactManifest ? JSON.stringify(artifactManifest) : null);
    return id;
  }

  getLatestCodeProposalForRun(runId: string): { id: string; artifactManifest: CodeProposalArtifactManifest | null } | null {
    this.getAgentRun(runId);
    const row = this.db
      .prepare("SELECT * FROM code_proposals WHERE agent_run_id = ? ORDER BY created_at DESC LIMIT 1")
      .get(runId) as CodeProposalRow | undefined;
    return row ? { id: row.id, artifactManifest: parseCodeProposalArtifactManifest(row.artifact_manifest_json) } : null;
  }

  getCodeProposal(proposalId: string): StoredCodeProposal {
    const row = this.db.prepare("SELECT * FROM code_proposals WHERE id = ?").get(proposalId) as CodeProposalRow | undefined;
    if (!row) {
      throw notFound(`Code proposal not found: ${proposalId}`);
    }
    return mapCodeProposal(row);
  }

  previewCodingWorkflow(projectId: string, scopeNodeId: string, modeOverrides: CodingWorkflowModeOverride[] = []): CodingWorkflow {
    return this.createCodingWorkflow(projectId, scopeNodeId, modeOverrides, "preview");
  }

  createCodingWorkflow(projectId: string, scopeNodeId: string, modeOverrides: CodingWorkflowModeOverride[] = [], status: CodingWorkflow["status"] = "running"): CodingWorkflow {
    const project = this.getProject(projectId);
    const scope = this.getNode(scopeNodeId);
    const planItems = this.planCodingWorkflowItems(project.id, scope, modeOverrides);
    const id = `workflow-${crypto.randomUUID()}`;
    const summary = planItems.length > 0 ? `${planItems.length} coding item${planItems.length === 1 ? "" : "s"} planned under ${scope.name}.` : `No planning blocks found under ${scope.name}.`;
    const save = this.db.transaction(() => {
      this.db
        .prepare("INSERT INTO coding_workflows (id, project_id, scope_node_id, status, current_layer, summary) VALUES (?, ?, ?, ?, 0, ?)")
        .run(id, project.id, scope.id, status, summary);
      for (const item of planItems) {
        this.db
          .prepare(
            `
            INSERT INTO coding_workflow_items (
              id, workflow_id, project_id, node_id, layer_index,
              recommended_mode, selected_mode, mode_reason, status, conflict_group
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
          )
          .run(
            `workflow-item-${crypto.randomUUID()}`,
            id,
            project.id,
            item.nodeId,
            item.layerIndex,
            item.recommendedMode,
            item.selectedMode,
            item.modeReason,
            status === "preview" ? "pending" : item.layerIndex === 0 ? "pending" : "blocked",
            item.conflictGroup
          );
      }
    });
    save();
    return this.getCodingWorkflow(id);
  }

  getCodingWorkflow(workflowId: string): CodingWorkflow {
    const row = this.db.prepare("SELECT * FROM coding_workflows WHERE id = ?").get(workflowId) as CodingWorkflowRow | undefined;
    if (!row) {
      throw notFound(`Coding workflow not found: ${workflowId}`);
    }
    return mapCodingWorkflow(row, this.listCodingWorkflowItems(workflowId), this.getNode(row.scope_node_id));
  }

  getReadyCodingWorkflowItems(workflowId: string): CodingWorkflowItem[] {
    const workflow = this.getCodingWorkflow(workflowId);
    return workflow.items.filter((item) => item.layerIndex === workflow.currentLayer && item.status === "pending");
  }

  updateCodingWorkflowStatus(workflowId: string, status: CodingWorkflow["status"], currentLayer?: number): CodingWorkflow {
    const workflow = this.getCodingWorkflow(workflowId);
    this.db
      .prepare("UPDATE coding_workflows SET status = ?, current_layer = ?, updated_at = datetime('now') WHERE id = ?")
      .run(status, currentLayer ?? workflow.currentLayer, workflowId);
    return this.getCodingWorkflow(workflowId);
  }

  updateCodingWorkflowItem(input: { itemId: string; status?: CodingWorkflowItemStatus; agentRunId?: string | null; proposalId?: string | null; appliedAt?: string | null }): CodingWorkflowItem {
    this.db
      .prepare(
        `
        UPDATE coding_workflow_items
        SET
          status = COALESCE(@status, status),
          agent_run_id = CASE WHEN @agentRunIdSet = 1 THEN @agentRunId ELSE agent_run_id END,
          proposal_id = CASE WHEN @proposalIdSet = 1 THEN @proposalId ELSE proposal_id END,
          applied_at = CASE WHEN @appliedAtSet = 1 THEN @appliedAt ELSE applied_at END,
          updated_at = datetime('now')
        WHERE id = @itemId
      `
      )
      .run({
        itemId: input.itemId,
        status: input.status ?? null,
        agentRunIdSet: input.agentRunId === undefined ? 0 : 1,
        agentRunId: input.agentRunId ?? null,
        proposalIdSet: input.proposalId === undefined ? 0 : 1,
        proposalId: input.proposalId ?? null,
        appliedAtSet: input.appliedAt === undefined ? 0 : 1,
        appliedAt: input.appliedAt ?? null
      });
    const row = this.db
      .prepare(
        `
        SELECT item.*, node.name AS node_name, node.kind AS node_kind
        FROM coding_workflow_items item
        JOIN graph_nodes node ON node.id = item.node_id
        WHERE item.id = ?
      `
      )
      .get(input.itemId) as CodingWorkflowItemRow | undefined;
    if (!row) {
      throw notFound(`Coding workflow item not found: ${input.itemId}`);
    }
    return mapCodingWorkflowItem(row);
  }

  applyCodingWorkflowLayer(projectId: string, workflowId: string, layerIndex: number): CodingWorkflow {
    const workflow = this.getCodingWorkflow(workflowId);
    if (workflow.projectId !== projectId) {
      throw validationError("Coding workflow does not belong to this project.");
    }
    const layerItems = workflow.items.filter((item) => item.layerIndex === layerIndex);
    if (layerItems.length === 0) {
      throw validationError(`Coding workflow layer ${layerIndex} does not exist.`);
    }
    const incomplete = layerItems.filter((item) => item.status !== "proposed" && item.status !== "applied" && item.status !== "skipped" && item.status !== "failed");
    if (incomplete.length > 0) {
      throw validationError("Coding workflow layer is not ready to apply.");
    }
    const nextLayer = Math.min(...workflow.items.filter((item) => item.layerIndex > layerIndex).map((item) => item.layerIndex), Number.POSITIVE_INFINITY);
    const done = !Number.isFinite(nextLayer);
    const appliedAt = new Date().toISOString();
    const apply = this.db.transaction(() => {
      for (const item of layerItems.filter((candidate) => candidate.status === "proposed")) {
        if (!item.proposalId) {
          throw validationError(`Coding workflow item ${item.id} does not have a code proposal.`);
        }
        this.applyCodeProposalArtifacts(projectId, item.proposalId, item.nodeId);
        this.updateCodingWorkflowItem({ itemId: item.id, status: "applied", appliedAt });
      }
      if (!done) {
        this.db
          .prepare("UPDATE coding_workflow_items SET status = 'pending', updated_at = datetime('now') WHERE workflow_id = ? AND layer_index = ? AND status = 'blocked'")
          .run(workflow.id, nextLayer);
      }
      this.updateCodingWorkflowStatus(workflow.id, done ? "succeeded" : "blocked", done ? workflow.currentLayer : nextLayer);
    });
    apply();
    return this.getCodingWorkflow(workflow.id);
  }

  private applyCodeProposalArtifacts(projectId: string, proposalId: string, targetNodeId: string): void {
    const project = this.getProject(projectId);
    const proposal = this.getCodeProposal(proposalId);
    if (proposal.projectId !== project.id) {
      throw validationError("Code proposal does not belong to this project.");
    }
    const manifest = proposal.artifactManifest;
    if (!manifest || manifest.scripts.length === 0) {
      return;
    }
    const metadata = this.resolveExecutionMetadata(targetNodeId);
    const targetDirectory = blankToNull(metadata.testScriptDirectory);
    if (!targetDirectory) {
      throw validationError(`Cannot apply test artifacts for ${targetNodeId}: testScriptDirectory is not configured.`);
    }
    if (!manifest.testScriptDirectory) {
      throw validationError(`Cannot apply test artifacts for ${proposalId}: artifact directory is missing.`);
    }
    const artifactDirectory = path.resolve(project.rootPath, manifest.testScriptDirectory);
    const targetRoot = path.resolve(project.rootPath, sanitizeArtifactPath(targetDirectory));
    if (!isPathInside(project.rootPath, artifactDirectory) || !isPathInside(project.rootPath, targetRoot)) {
      throw validationError("Code proposal artifact paths must stay inside the workspace.");
    }
    for (const script of manifest.scripts) {
      const safeRelativePath = sanitizeArtifactPath(script.relativePath);
      const sourcePath = path.join(artifactDirectory, safeRelativePath);
      const targetPath = path.join(targetRoot, safeRelativePath);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, targetPath);
      } else {
        fs.writeFileSync(targetPath, script.content, "utf8");
      }
    }
  }

  resolveExecutionMetadata(nodeId: string): BlockExecutionMetadata {
    const nodes = this.listNodes(this.getNode(nodeId).projectId);
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const ordered: GraphNode[] = [];
    let current = byId.get(nodeId);
    const seen = new Set<string>();
    let parentAnchor = current;
    if (current && !seen.has(current.id)) {
      ordered.push(current);
      seen.add(current.id);
    }
    current = parentAnchor?.attachedToId ? byId.get(parentAnchor.attachedToId) : undefined;
    while (current && !seen.has(current.id)) {
      ordered.push(current);
      seen.add(current.id);
      parentAnchor = current;
      current = current.attachedToId ? byId.get(current.attachedToId) : undefined;
    }
    current = parentAnchor?.parentId ? byId.get(parentAnchor.parentId) : undefined;
    while (current && !seen.has(current.id)) {
      ordered.push(current);
      seen.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    const resolved = blockExecutionMetadataSchema.parse({});
    for (const node of ordered) {
      resolved.testScriptDirectory ??= blankToNull(node.execution.testScriptDirectory);
      resolved.virtualEnvironment ??= blankToNull(node.execution.virtualEnvironment);
      resolved.workingDirectory ??= blankToNull(node.execution.workingDirectory);
      resolved.setupCommand ??= blankToNull(node.execution.setupCommand);
      resolved.testCommand ??= blankToNull(node.execution.testCommand);
    }
    return resolved;
  }

  private writeProposalArtifacts(project: Project, proposalId: string, manifest: CodeProposalArtifactManifest | null): CodeProposalArtifactManifest | null {
    const parsed = manifest ? codeProposalArtifactManifestSchema.parse(manifest) : null;
    if (!parsed || parsed.scripts.length === 0) {
      return parsed;
    }
    const artifactRelativeDir = path.join(".graphcode", "artifacts", "code-proposals", proposalId);
    const artifactDir = path.join(project.rootPath, artifactRelativeDir);
    fs.mkdirSync(artifactDir, { recursive: true });
    for (const script of parsed.scripts) {
      const safeRelativePath = sanitizeArtifactPath(script.relativePath);
      const targetPath = path.join(artifactDir, safeRelativePath);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, script.content, "utf8");
    }
    return {
      ...parsed,
      testScriptDirectory: artifactRelativeDir
    };
  }

  private listCodingWorkflowItems(workflowId: string): CodingWorkflowItem[] {
    const rows = this.db
      .prepare(
        `
        SELECT item.*, node.name AS node_name, node.kind AS node_kind
        FROM coding_workflow_items item
        JOIN graph_nodes node ON node.id = item.node_id
        WHERE item.workflow_id = ?
        ORDER BY item.layer_index ASC, item.conflict_group ASC, node.name ASC
      `
      )
      .all(workflowId) as CodingWorkflowItemRow[];
    return rows.map(mapCodingWorkflowItem);
  }

  private planCodingWorkflowItems(projectId: string, scope: GraphNode, modeOverrides: CodingWorkflowModeOverride[]): Array<{
    nodeId: string;
    layerIndex: number;
    recommendedMode: CodingAgentMode;
    selectedMode: CodingAgentMode;
    modeReason: string;
    conflictGroup: string;
  }> {
    const nodes = this.listNodes(projectId);
    const edges = this.listEdges(projectId);
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const scopeIds = collectCodingScopeNodeIds(scope, nodeById);
    let candidates = nodes.filter((node) => scopeIds.has(node.id) && node.agentStatus === "planning");
    if (candidates.length === 0) {
      candidates = [scope];
    }
    const candidateIds = new Set(candidates.map((node) => node.id));
    const childrenByCandidate = new Map<string, string[]>();
    for (const node of candidates) {
      const parentId = nearestCandidateOwner(node, nodeById, candidateIds);
      if (!parentId) {
        continue;
      }
      const children = childrenByCandidate.get(parentId) ?? [];
      children.push(node.id);
      childrenByCandidate.set(parentId, children);
    }
    const layerMemo = new Map<string, number>();
    const layerFor = (nodeId: string): number => {
      const cached = layerMemo.get(nodeId);
      if (cached !== undefined) {
        return cached;
      }
      const childLayers = (childrenByCandidate.get(nodeId) ?? []).map(layerFor);
      const layer = childLayers.length > 0 ? Math.max(...childLayers) + 1 : 0;
      layerMemo.set(nodeId, layer);
      return layer;
    };
    const overrides = new Map(modeOverrides.map((override) => [override.nodeId, override.mode]));
    return candidates
      .map((node) => {
        const recommendation = recommendCodingMode(node, nodes, edges, scopeIds);
        return {
          nodeId: node.id,
          layerIndex: layerFor(node.id),
          recommendedMode: recommendation.mode,
          selectedMode: overrides.get(node.id) ?? recommendation.mode,
          modeReason: recommendation.reason,
          conflictGroup: codingConflictGroup(node, nodeById)
        };
      })
      .sort((left, right) => left.layerIndex - right.layerIndex || left.conflictGroup.localeCompare(right.conflictGroup) || left.nodeId.localeCompare(right.nodeId));
  }

  clearAllGraphData(): void {
    this.db.exec("DELETE FROM projects;");
  }

  listCustomBlockTypes(projectId: string): CustomBlockType[] {
    this.getProject(projectId);
    const rows = this.db
      .prepare("SELECT * FROM custom_block_types WHERE project_id = ? ORDER BY name ASC")
      .all(projectId) as CustomBlockTypeRow[];
    return rows.map(mapCustomBlockType);
  }

  createCustomBlockType(projectId: string, input: CreateCustomBlockType): CustomBlockType {
    this.getProject(projectId);
    const id = `custom-type-${crypto.randomUUID()}`;
    this.db
      .prepare(
        `
        INSERT INTO custom_block_types (id, project_id, name, description, color, icon)
        VALUES (@id, @projectId, @name, @description, @color, @icon)
      `
      )
      .run({
        id,
        projectId,
        name: input.name,
        description: input.description ?? "",
        color: input.color ?? "#475569",
        icon: input.icon ?? "square"
      });
    return mapCustomBlockType(this.db.prepare("SELECT * FROM custom_block_types WHERE id = ?").get(id) as CustomBlockTypeRow);
  }

  updateCustomBlockType(customTypeId: string, input: CustomBlockTypeUpdate): CustomBlockType {
    const existing = this.getCustomBlockType(customTypeId);
    this.db
      .prepare(
        `
        UPDATE custom_block_types
        SET
          name = @name,
          description = @description,
          color = @color,
          icon = @icon,
          updated_at = datetime('now')
        WHERE id = @id
      `
      )
      .run({
        id: customTypeId,
        name: input.name ?? existing.name,
        description: input.description ?? existing.description,
        color: input.color ?? existing.color,
        icon: input.icon ?? existing.icon
      });
    return this.getCustomBlockType(customTypeId);
  }

  getCustomBlockType(customTypeId: string): CustomBlockType {
    const row = this.db.prepare("SELECT * FROM custom_block_types WHERE id = ?").get(customTypeId) as CustomBlockTypeRow | undefined;
    if (!row) {
      throw notFound(`Custom block type not found: ${customTypeId}`);
    }
    return mapCustomBlockType(row);
  }

  listNodeTypeStyles(projectId: string): NodeTypeStyle[] {
    this.getProject(projectId);
    const rows = this.db
      .prepare("SELECT * FROM graph_node_type_styles WHERE project_id = ? ORDER BY node_kind ASC")
      .all(projectId) as NodeTypeStyleRow[];
    return rows.map(mapNodeTypeStyle);
  }

  updateNodeTypeStyle(projectId: string, nodeKind: GraphNodeKind, input: NodeTypeStyleUpdate): NodeTypeStyle {
    this.getProject(projectId);
    if (!DOMAIN_NODE_KINDS.includes(nodeKind as never) && !isAttachmentNodeKind(nodeKind)) {
      throw validationError(`Invalid node kind: ${nodeKind}`);
    }
    this.db
      .prepare(
        `
        INSERT INTO graph_node_type_styles (project_id, node_kind, color, created_at, updated_at)
        VALUES (@projectId, @nodeKind, @color, datetime('now'), datetime('now'))
        ON CONFLICT(project_id, node_kind)
        DO UPDATE SET color = excluded.color, updated_at = datetime('now')
      `
      )
      .run({
        projectId,
        nodeKind,
        color: input.color
      });
    const row = this.db
      .prepare("SELECT * FROM graph_node_type_styles WHERE project_id = ? AND node_kind = ?")
      .get(projectId, nodeKind) as NodeTypeStyleRow;
    return mapNodeTypeStyle(row);
  }

  setNodeTags(nodeId: string, input: TagAssignment): GraphNode {
    const node = this.getNode(nodeId);
    const tags = this.upsertTags(node.projectId, input.tags);
    this.replaceTagLinks("node", node.id, tags.map((tag) => tag.id));
    this.bumpGraphEntities(node.projectId, [{ entityType: "node", entityId: node.id, deleted: false }], "Updated node tags.");
    return this.getNode(node.id);
  }

  setEdgeTags(edgeId: string, input: TagAssignment): GraphEdge {
    const edge = this.getEdge(edgeId);
    const tags = this.upsertTags(edge.projectId, input.tags);
    this.replaceTagLinks("edge", edge.id, tags.map((tag) => tag.id));
    this.bumpGraphEntities(edge.projectId, [{ entityType: "edge", entityId: edge.id, deleted: false }], "Updated edge tags.");
    return this.getEdge(edge.id);
  }

  setBoundaryTags(boundaryId: string, input: TagAssignment): GraphBoundary {
    const boundary = this.getBoundary(boundaryId);
    const tags = this.upsertTags(boundary.projectId, input.tags);
    this.replaceTagLinks("boundary", boundary.id, tags.map((tag) => tag.id));
    this.bumpGraphEntities(boundary.projectId, [{ entityType: "boundary", entityId: boundary.id, deleted: false }], "Updated boundary tags.");
    return this.getBoundary(boundary.id);
  }

  createNodeReuse(projectId: string, input: NodeReuseMutation): GraphNodeReuse {
    this.getProject(projectId);
    const scopeNode = this.getNode(input.scopeNodeId);
    const node = this.getNode(input.nodeId);
    if (scopeNode.projectId !== projectId || node.projectId !== projectId) {
      throw validationError("Reuse scope and node must belong to the same project.");
    }
    if (!isDomainNodeKind(scopeNode.kind) || !isDomainNodeKind(node.kind) || node.kind === "framework") {
      throw validationError("Reusable placements must place a domain node inside a domain scope.");
    }
    if (scopeNode.id === node.id) {
      throw validationError("A node cannot be reused inside itself.");
    }

    const id = `reuse-${hashId(`${projectId}:${scopeNode.id}:${node.id}`)}`;
    this.db
      .prepare(
        `
        INSERT INTO graph_node_reuses (id, project_id, scope_node_id, node_id, label, context, created_at, updated_at)
        VALUES (@id, @projectId, @scopeNodeId, @nodeId, @label, @context, datetime('now'), datetime('now'))
        ON CONFLICT(project_id, scope_node_id, node_id)
        DO UPDATE SET
          label = excluded.label,
          context = excluded.context,
          updated_at = datetime('now')
      `
      )
      .run({
        id,
        projectId,
        scopeNodeId: scopeNode.id,
        nodeId: node.id,
        label: input.label ?? "",
        context: input.context ?? ""
      });
    this.bumpGraphEntities(
      projectId,
      [
        { entityType: "node", entityId: scopeNode.id, deleted: false },
        { entityType: "node", entityId: node.id, deleted: false }
      ],
      "Updated reusable graph placement."
    );
    return this.getNodeReuse(id);
  }

  deleteNodeReuse(reuseId: string): void {
    const reuse = this.getNodeReuse(reuseId);
    this.db.prepare("DELETE FROM graph_node_reuses WHERE id = ?").run(reuseId);
    this.bumpGraphEntities(
      reuse.projectId,
      [
        { entityType: "node", entityId: reuse.scopeNodeId, deleted: false },
        { entityType: "node", entityId: reuse.nodeId, deleted: false }
      ],
      "Deleted reusable graph placement."
    );
  }

  getNodeReuse(reuseId: string): GraphNodeReuse {
    const row = this.db.prepare("SELECT * FROM graph_node_reuses WHERE id = ?").get(reuseId) as NodeReuseRow | undefined;
    if (!row) {
      throw notFound(`Reusable placement not found: ${reuseId}`);
    }
    return mapNodeReuse(row);
  }

  createProject(input: { id: string; name: string; rootPath: string; description?: string; scanningInstructions?: string }): Project {
    this.db
      .prepare(
        `
        INSERT INTO projects (id, name, root_path, description, scanning_instructions)
        VALUES (@id, @name, @rootPath, @description, @scanningInstructions)
      `
      )
      .run({
        ...input,
        description: input.description ?? "",
        scanningInstructions: input.scanningInstructions ?? ""
      });
    return this.getProject(input.id);
  }

  createBlankProject(input: { name: string; rootPath: string }): Project {
    return this.createProject({
      id: `workspace-${hashId(input.rootPath)}`,
      name: input.name,
      rootPath: input.rootPath
    });
  }

  getProject(projectId: string): Project {
    const row = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as ProjectRow | undefined;
    if (!row) {
      throw notFound(`Project not found: ${projectId}`);
    }
    return mapProject(row);
  }

	  createNode(input: NewGraphNode): GraphNode {
	    this.assertValidNode(input);
	    const codeDirectory = input.codeDirectory ?? input.sourcePath ?? null;
	    const codeStartLine = input.codeStartLine ?? input.sourceStartLine ?? null;
	    const codeEndLine = input.codeEndLine ?? input.sourceEndLine ?? null;
	    const execution = blockExecutionMetadataSchema.parse(input.execution ?? {});
	    this.db
	      .prepare(
	        `
	        INSERT INTO graph_nodes (
	          id, project_id, kind, name, summary,
	          code_context, code_directory, code_start_line, code_end_line, language,
	          parent_id, attached_to_id, custom_type_id,
	          source_path, source_start_line, source_end_line,
	          test_script_directory, virtual_environment, working_directory, setup_command, test_command,
	          ui_x, ui_y,
	          ui_width, ui_height, agent_status
	        )
	        VALUES (
	          @id, @projectId, @kind, @name, @summary,
	          @codeContext, @codeDirectory, @codeStartLine, @codeEndLine, @language,
	          @parentId, @attachedToId, @customTypeId,
	          @sourcePath, @sourceStartLine, @sourceEndLine,
	          @testScriptDirectory, @virtualEnvironment, @workingDirectory, @setupCommand, @testCommand,
	          @uiX, @uiY,
	          @uiWidth, @uiHeight, @agentStatus
	        )
      `
      )
      .run({
        id: input.id,
        projectId: input.projectId,
        kind: input.kind,
        name: input.name,
        summary: input.summary ?? "",
        codeContext: input.codeContext ?? input.summary ?? "",
        codeDirectory,
        codeStartLine,
        codeEndLine,
        language: input.language ?? "unknown",
        parentId: input.parentId ?? null,
        attachedToId: input.attachedToId ?? null,
        customTypeId: input.customTypeId ?? null,
	        sourcePath: input.sourcePath ?? codeDirectory,
	        sourceStartLine: input.sourceStartLine ?? codeStartLine,
	        sourceEndLine: input.sourceEndLine ?? codeEndLine,
	        testScriptDirectory: blankToNull(execution.testScriptDirectory),
	        virtualEnvironment: blankToNull(execution.virtualEnvironment),
	        workingDirectory: blankToNull(execution.workingDirectory),
	        setupCommand: blankToNull(execution.setupCommand),
	        testCommand: blankToNull(execution.testCommand),
	        uiX: input.position?.x ?? 0,
        uiY: input.position?.y ?? 0,
        uiWidth: input.size?.width ?? defaultSizeForKind(input.kind).width,
        uiHeight: input.size?.height ?? defaultSizeForKind(input.kind).height,
        agentStatus: input.agentStatus ?? "none"
      });
    return this.getNode(input.id);
  }

  createNodeFromMutation(projectId: string, input: NodeMutation): GraphNode {
    const node = this.createNode({
      id: `node-${crypto.randomUUID()}`,
      projectId,
      kind: input.kind,
      name: input.name,
      summary: input.summary ?? "",
      codeContext: input.codeContext ?? input.summary ?? "",
      codeDirectory: input.codeDirectory ?? null,
      codeStartLine: input.codeStartLine ?? null,
      codeEndLine: input.codeEndLine ?? null,
      language: input.language ?? "unknown",
      parentId: input.parentId ?? null,
      attachedToId: input.attachedToId ?? null,
      customTypeId: input.customTypeId ?? null,
	      sourcePath: input.codeDirectory ?? null,
	      sourceStartLine: input.codeStartLine ?? null,
	      sourceEndLine: input.codeEndLine ?? null,
	      execution: input.execution,
	      position: input.position,
      size: input.size,
      agentStatus: "implemented"
    });
    this.bumpGraphEntities(projectId, [{ entityType: "node", entityId: node.id, deleted: false }], "Created graph node.");
    return node;
  }

  updateNode(nodeId: string, input: NodeUpdate): GraphNode {
    const existing = this.getNode(nodeId);
    const next: NewGraphNode = {
      id: existing.id,
      projectId: existing.projectId,
      kind: input.kind ?? existing.kind,
      name: input.name ?? existing.name,
      summary: input.summary ?? existing.summary,
      codeContext: input.codeContext ?? existing.code.context,
      codeDirectory: input.codeDirectory === undefined ? existing.code.directory : input.codeDirectory,
      codeStartLine: input.codeStartLine === undefined ? existing.code.startLine : input.codeStartLine,
      codeEndLine: input.codeEndLine === undefined ? existing.code.endLine : input.codeEndLine,
      language: input.language ?? existing.code.language,
      parentId: input.parentId === undefined ? existing.parentId : input.parentId,
	      attachedToId: input.attachedToId === undefined ? existing.attachedToId : input.attachedToId,
	      customTypeId: input.customTypeId === undefined ? existing.customTypeId : input.customTypeId,
	      execution: {
	        ...existing.execution,
	        ...(input.execution ?? {})
	      },
	      position: input.position ?? existing.position,
      size: input.size ?? existing.size,
      agentStatus: existing.agentStatus
    };
    this.assertValidNode(next, nodeId);
    const semanticChanged =
      next.kind !== existing.kind ||
      next.name !== existing.name ||
      (next.summary ?? "") !== existing.summary ||
      (next.codeContext ?? "") !== existing.code.context ||
      (next.codeDirectory ?? null) !== existing.code.directory ||
      (next.codeStartLine ?? null) !== existing.code.startLine ||
      (next.codeEndLine ?? null) !== existing.code.endLine ||
	      (next.language ?? "unknown") !== existing.code.language ||
	      (next.parentId ?? null) !== existing.parentId ||
	      (next.attachedToId ?? null) !== existing.attachedToId ||
	      (next.customTypeId ?? null) !== existing.customTypeId ||
	      !sameExecutionMetadata(blockExecutionMetadataSchema.parse(next.execution ?? {}), existing.execution);
    const agentStatus =
      this.statusAfterSemanticEdit({
        projectId: existing.projectId,
        entityType: "node",
        entityId: existing.id,
        currentStatus: existing.agentStatus,
        changed: semanticChanged,
        note: "Semantic node edit moved this block back to planning."
      }) ?? existing.agentStatus;

    this.db
      .prepare(
        `
        UPDATE graph_nodes
        SET
          kind = @kind,
          name = @name,
          summary = @summary,
          code_context = @codeContext,
          code_directory = @codeDirectory,
          code_start_line = @codeStartLine,
          code_end_line = @codeEndLine,
          language = @language,
          parent_id = @parentId,
          attached_to_id = @attachedToId,
	          custom_type_id = @customTypeId,
	          source_path = @codeDirectory,
	          source_start_line = @codeStartLine,
	          source_end_line = @codeEndLine,
	          test_script_directory = @testScriptDirectory,
	          virtual_environment = @virtualEnvironment,
	          working_directory = @workingDirectory,
	          setup_command = @setupCommand,
	          test_command = @testCommand,
	          ui_x = @uiX,
          ui_y = @uiY,
          ui_width = @uiWidth,
          ui_height = @uiHeight,
          agent_status = @agentStatus,
          updated_at = datetime('now')
        WHERE id = @id
      `
      )
      .run({
        id: next.id,
        kind: next.kind,
        name: next.name,
        summary: next.summary ?? "",
        codeContext: next.codeContext ?? "",
        codeDirectory: next.codeDirectory ?? null,
        codeStartLine: next.codeStartLine ?? null,
        codeEndLine: next.codeEndLine ?? null,
        language: next.language ?? "unknown",
        parentId: next.parentId ?? null,
        attachedToId: next.attachedToId ?? null,
	        customTypeId: next.customTypeId ?? null,
	        testScriptDirectory: blankToNull(next.execution?.testScriptDirectory ?? null),
	        virtualEnvironment: blankToNull(next.execution?.virtualEnvironment ?? null),
	        workingDirectory: blankToNull(next.execution?.workingDirectory ?? null),
	        setupCommand: blankToNull(next.execution?.setupCommand ?? null),
	        testCommand: blankToNull(next.execution?.testCommand ?? null),
	        uiX: next.position?.x ?? existing.position.x,
        uiY: next.position?.y ?? existing.position.y,
        uiWidth: next.size?.width ?? existing.size.width,
        uiHeight: next.size?.height ?? existing.size.height,
        agentStatus
      });

    if (semanticChanged) {
      this.bumpGraphEntities(existing.projectId, [{ entityType: "node", entityId: existing.id, deleted: false }], "Updated graph node.");
    }
    return this.getNode(nodeId);
  }

  createEdge(input: NewGraphEdge): GraphEdge {
    if (!GRAPH_EDGE_KINDS.includes(input.kind)) {
      throw validationError(`Unsupported edge kind: ${input.kind}`);
    }

    const source = this.getNode(input.sourceNodeId);
    const target = this.getNode(input.targetNodeId);
    if (source.projectId !== input.projectId || target.projectId !== input.projectId) {
      throw validationError("Edges must connect nodes within the same project.");
    }

    this.db
      .prepare(
        `
        INSERT INTO graph_edges (
          id, project_id, kind, source_node_id, target_node_id, label, code_context,
          source_path, source_start_line, source_end_line,
          color, animated, pointing_enabled, pointing_direction, agent_status
        )
        VALUES (
          @id, @projectId, @kind, @sourceNodeId, @targetNodeId, @label, @codeContext,
          @sourcePath, @sourceStartLine, @sourceEndLine,
          @color, @animated, @pointingEnabled, @pointingDirection, @agentStatus
        )
      `
      )
      .run({
        ...input,
        label: input.label ?? null,
        codeContext: input.codeContext ?? "",
        sourcePath: input.sourcePath ?? null,
        sourceStartLine: input.sourceStartLine ?? null,
        sourceEndLine: input.sourceEndLine ?? null,
        color: input.color ?? defaultEdgeColor(input.kind),
        animated: input.animated === true ? 1 : 0,
        pointingEnabled: input.pointingEnabled === false ? 0 : 1,
        pointingDirection: input.pointingDirection ?? "source_to_target",
        agentStatus: input.agentStatus ?? "none"
      });
    return this.getEdge(input.id);
  }

  createEdgeFromMutation(projectId: string, input: EdgeMutation): GraphEdge {
    const edge = this.createEdge({
      id: `edge-${crypto.randomUUID()}`,
      projectId,
      kind: input.kind,
      sourceNodeId: input.sourceNodeId,
      targetNodeId: input.targetNodeId,
      label: input.label ?? null,
      codeContext: input.codeContext ?? "",
      sourcePath: input.source?.path ?? null,
      sourceStartLine: input.source?.startLine ?? null,
      sourceEndLine: input.source?.endLine ?? null,
      color: input.color,
      animated: input.animated,
      pointingEnabled: input.pointingEnabled,
      pointingDirection: input.pointingDirection,
      agentStatus: "implemented"
    });
    this.bumpGraphEntities(projectId, [{ entityType: "edge", entityId: edge.id, deleted: false }], "Created graph edge.");
    return edge;
  }

  getEdge(edgeId: string): GraphEdge {
    const row = this.db.prepare("SELECT * FROM graph_edges WHERE id = ?").get(edgeId) as EdgeRow | undefined;
    if (!row) {
      throw notFound(`Edge not found: ${edgeId}`);
    }
    return mapEdge(row, this.getTagsForEntity("edge", row.id));
  }

  updateEdge(edgeId: string, input: EdgeUpdate): GraphEdge {
    const existing = this.getEdge(edgeId);
    const next = {
      id: existing.id,
      projectId: existing.projectId,
      kind: input.kind ?? existing.kind,
      sourceNodeId: input.sourceNodeId ?? existing.sourceNodeId,
      targetNodeId: input.targetNodeId ?? existing.targetNodeId,
      label: input.label === undefined ? existing.label : input.label,
      codeContext: input.codeContext ?? existing.codeContext,
      sourcePath: input.source === undefined ? existing.source.path : input.source.path,
      sourceStartLine: input.source === undefined ? existing.source.startLine : input.source.startLine,
      sourceEndLine: input.source === undefined ? existing.source.endLine : input.source.endLine,
      color: input.color ?? existing.color,
      animated: input.animated ?? existing.animated,
      pointingEnabled: input.pointingEnabled ?? existing.pointingEnabled,
      pointingDirection: input.pointingDirection ?? existing.pointingDirection
    };

    if (!GRAPH_EDGE_KINDS.includes(next.kind)) {
      throw validationError(`Unsupported edge kind: ${next.kind}`);
    }
    const source = this.getNode(next.sourceNodeId);
    const target = this.getNode(next.targetNodeId);
    if (source.projectId !== next.projectId || target.projectId !== next.projectId) {
      throw validationError("Edges must connect nodes within the same project.");
    }
    const semanticChanged =
      next.kind !== existing.kind ||
      next.sourceNodeId !== existing.sourceNodeId ||
      next.targetNodeId !== existing.targetNodeId ||
      (next.label ?? null) !== existing.label ||
      (next.codeContext ?? "") !== existing.codeContext ||
      (next.sourcePath ?? null) !== existing.source.path ||
      (next.sourceStartLine ?? null) !== existing.source.startLine ||
      (next.sourceEndLine ?? null) !== existing.source.endLine ||
      next.pointingEnabled !== existing.pointingEnabled ||
      next.pointingDirection !== existing.pointingDirection;
    const agentStatus =
      this.statusAfterSemanticEdit({
        projectId: existing.projectId,
        entityType: "edge",
        entityId: existing.id,
        currentStatus: existing.agentStatus,
        changed: semanticChanged,
        note: "Semantic edge edit moved this edge back to planning."
      }) ?? existing.agentStatus;

    this.db
      .prepare(
        `
        UPDATE graph_edges
        SET
          kind = @kind,
          source_node_id = @sourceNodeId,
          target_node_id = @targetNodeId,
          label = @label,
          code_context = @codeContext,
          source_path = @sourcePath,
          source_start_line = @sourceStartLine,
          source_end_line = @sourceEndLine,
          color = @color,
          animated = @animated,
          pointing_enabled = @pointingEnabled,
          pointing_direction = @pointingDirection,
          agent_status = @agentStatus
        WHERE id = @id
      `
      )
      .run({
        id: next.id,
        kind: next.kind,
        sourceNodeId: next.sourceNodeId,
        targetNodeId: next.targetNodeId,
        label: next.label ?? null,
        codeContext: next.codeContext ?? "",
        sourcePath: next.sourcePath ?? null,
        sourceStartLine: next.sourceStartLine ?? null,
        sourceEndLine: next.sourceEndLine ?? null,
        color: next.color,
        animated: next.animated ? 1 : 0,
        pointingEnabled: next.pointingEnabled ? 1 : 0,
        pointingDirection: next.pointingDirection,
        agentStatus
      });

    if (semanticChanged) {
      this.bumpGraphEntities(existing.projectId, [{ entityType: "edge", entityId: existing.id, deleted: false }], "Updated graph edge.");
    }
    return this.getEdge(edgeId);
  }

  deleteEdge(edgeId: string): void {
    const edge = this.getEdge(edgeId);
    this.db.prepare("DELETE FROM graph_edges WHERE id = ?").run(edgeId);
    this.bumpGraphEntities(edge.projectId, [{ entityType: "edge", entityId: edge.id, deleted: true }], "Deleted graph edge.");
  }

  createBoundary(projectId: string, input: BoundaryMutation): GraphBoundary {
    const boundary = this.createBoundaryRow({
      id: `boundary-${crypto.randomUUID()}`,
      projectId,
      scopeNodeId: input.scopeNodeId,
      name: input.name,
      summary: input.summary ?? "",
      codeContext: input.codeContext ?? "",
      color: input.color,
      position: input.position,
      size: input.size
    });
    this.bumpGraphEntities(projectId, [{ entityType: "boundary", entityId: boundary.id, deleted: false }], "Created graph boundary.");
    return boundary;
  }

  getBoundary(boundaryId: string): GraphBoundary {
    const row = this.db.prepare("SELECT * FROM graph_boundaries WHERE id = ?").get(boundaryId) as BoundaryRow | undefined;
    if (!row) {
      throw notFound(`Boundary not found: ${boundaryId}`);
    }
    return this.mapBoundary(row);
  }

  updateBoundary(boundaryId: string, input: BoundaryUpdate): GraphBoundary {
    const existing = this.getBoundary(boundaryId);
    const next = {
      id: existing.id,
      projectId: existing.projectId,
      scopeNodeId: input.scopeNodeId ?? existing.scopeNodeId,
      name: input.name ?? existing.name,
      summary: input.summary ?? existing.summary,
      codeContext: input.codeContext ?? existing.codeContext,
      color: input.color ?? existing.color,
      position: input.position ?? existing.position,
      size: input.size ?? existing.size
    };
    this.assertValidBoundary(next);
    const semanticChanged =
      next.scopeNodeId !== existing.scopeNodeId ||
      next.name !== existing.name ||
      next.summary !== existing.summary ||
      next.codeContext !== existing.codeContext;
    this.statusAfterSemanticEdit({
      projectId: existing.projectId,
      entityType: "boundary",
      entityId: existing.id,
      changed: semanticChanged,
      note: "Semantic boundary edit moved this boundary back to planning."
    });

    this.db
      .prepare(
        `
        UPDATE graph_boundaries
        SET
          scope_node_id = @scopeNodeId,
          name = @name,
          summary = @summary,
          code_context = @codeContext,
          color = @color,
          ui_x = @uiX,
          ui_y = @uiY,
          ui_width = @uiWidth,
          ui_height = @uiHeight,
          updated_at = datetime('now')
        WHERE id = @id
      `
      )
      .run({
        id: next.id,
        scopeNodeId: next.scopeNodeId,
        name: next.name,
        summary: next.summary,
        codeContext: next.codeContext,
        color: next.color,
        uiX: next.position.x,
        uiY: next.position.y,
        uiWidth: next.size.width,
        uiHeight: next.size.height
      });
    this.recomputeBoundaryMembership(boundaryId);
    if (semanticChanged) {
      this.bumpGraphEntities(existing.projectId, [{ entityType: "boundary", entityId: existing.id, deleted: false }], "Updated graph boundary.");
    }
    return this.getBoundary(boundaryId);
  }

  deleteBoundary(boundaryId: string): void {
    const boundary = this.getBoundary(boundaryId);
    this.db.prepare("DELETE FROM graph_boundaries WHERE id = ?").run(boundaryId);
    this.bumpGraphEntities(boundary.projectId, [{ entityType: "boundary", entityId: boundary.id, deleted: true }], "Deleted graph boundary.");
  }

  private createBoundaryRow(input: NewGraphBoundary): GraphBoundary {
    this.assertValidBoundary(input);
    this.db
      .prepare(
        `
        INSERT INTO graph_boundaries (
          id, project_id, scope_node_id, name, summary,
          code_context, color, ui_x, ui_y, ui_width, ui_height
        )
        VALUES (
          @id, @projectId, @scopeNodeId, @name, @summary,
          @codeContext, @color, @uiX, @uiY, @uiWidth, @uiHeight
        )
      `
      )
      .run({
        id: input.id,
        projectId: input.projectId,
        scopeNodeId: input.scopeNodeId,
        name: input.name,
        summary: input.summary ?? "",
        codeContext: input.codeContext ?? "",
        color: input.color ?? defaultBoundaryColor(input.id),
        uiX: input.position.x,
        uiY: input.position.y,
        uiWidth: input.size.width,
        uiHeight: input.size.height
      });
    this.recomputeBoundaryMembership(input.id);
    return this.getBoundary(input.id);
  }

  createDependencyDetails(input: NewDependencyDetails): DependencyDetails {
    if (!DEPENDENCY_KINDS.includes(input.dependencyKind)) {
      throw validationError(`Unsupported dependency kind: ${input.dependencyKind}`);
    }

    const node = this.getNode(input.nodeId);
    if (node.kind !== "dependency") {
      throw validationError("Dependency details can only be attached to dependency nodes.");
    }

    this.db
      .prepare(
        `
        INSERT INTO dependency_details (node_id, dependency_kind, spec, version, required, notes)
        VALUES (@nodeId, @dependencyKind, @spec, @version, @required, @notes)
      `
      )
      .run({
        nodeId: input.nodeId,
        dependencyKind: input.dependencyKind,
        spec: input.spec,
        version: input.version ?? null,
        required: input.required === false ? 0 : 1,
        notes: input.notes ?? ""
      });
    return this.getDependencyDetail(input.nodeId);
  }

  createIoDetails(input: NewIoDetails): IoDetails {
    if (!IO_KINDS.includes(input.ioKind)) {
      throw validationError(`Unsupported I/O kind: ${input.ioKind}`);
    }

    const node = this.getNode(input.nodeId);
    if (node.kind !== "input" && node.kind !== "output") {
      throw validationError("I/O details can only be attached to input or output nodes.");
    }

    this.db
      .prepare(
        `
        INSERT INTO io_details (node_id, io_kind, channel, schema_hint, notes)
        VALUES (@nodeId, @ioKind, @channel, @schemaHint, @notes)
      `
      )
      .run({
        nodeId: input.nodeId,
        ioKind: input.ioKind,
        channel: input.channel,
        schemaHint: input.schemaHint ?? null,
        notes: input.notes ?? ""
      });
    return this.getIoDetail(input.nodeId);
  }

  createProcessDetails(input: NewProcessDetails): ProcessDetails {
    if (!PROCESS_KINDS.includes(input.processKind)) {
      throw validationError(`Unsupported process kind: ${input.processKind}`);
    }

    const node = this.getNode(input.nodeId);
    if (node.kind !== "process") {
      throw validationError("Process details can only be attached to process nodes.");
    }

    this.db
      .prepare(
        `
        INSERT INTO process_details (node_id, process_kind, trigger, notes)
        VALUES (@nodeId, @processKind, @trigger, @notes)
      `
      )
      .run({
        nodeId: input.nodeId,
        processKind: input.processKind,
        trigger: input.trigger ?? null,
        notes: input.notes ?? ""
      });
    return this.getProcessDetail(input.nodeId);
  }

  createFormatDetails(input: NewFormatDetails): FormatDetails {
    if (!FORMAT_KINDS.includes(input.formatKind)) {
      throw validationError(`Unsupported format kind: ${input.formatKind}`);
    }

    const node = this.getNode(input.nodeId);
    if (node.kind !== "format") {
      throw validationError("Format details can only be attached to format nodes.");
    }

    this.db
      .prepare(
        `
        INSERT INTO format_details (node_id, format_kind, spec, example, notes)
        VALUES (@nodeId, @formatKind, @spec, @example, @notes)
      `
      )
      .run({
        nodeId: input.nodeId,
        formatKind: input.formatKind,
        spec: input.spec,
        example: input.example ?? null,
        notes: input.notes ?? ""
    });
    return this.getFormatDetail(input.nodeId);
  }

  createBasicBlockDetails(input: NewBasicBlockDetails): BasicBlockDetails {
    if (!BASIC_DETAIL_NODE_KINDS.includes(input.basicKind)) {
      throw validationError(`Unsupported basic block kind: ${input.basicKind}`);
    }

    const node = this.getNode(input.nodeId);
    if (node.kind !== input.basicKind) {
      throw validationError("Basic block details must match the node kind.");
    }

    this.db
      .prepare(
        `
        INSERT INTO basic_block_details (node_id, basic_kind, key, value_hint, required, notes)
        VALUES (@nodeId, @basicKind, @key, @valueHint, @required, @notes)
      `
      )
      .run({
        nodeId: input.nodeId,
        basicKind: input.basicKind,
        key: input.key ?? node.name,
        valueHint: input.valueHint ?? null,
        required: input.required === true ? 1 : 0,
        notes: input.notes ?? ""
      });
    return this.getBasicBlockDetail(input.nodeId);
  }

  getNode(nodeId: string): GraphNode {
    const row = this.db.prepare("SELECT * FROM graph_nodes WHERE id = ?").get(nodeId) as NodeRow | undefined;
    if (!row) {
      throw notFound(`Node not found: ${nodeId}`);
    }
    return mapNode(row, this.getChildCount(row.id), this.getTagsForEntity("node", row.id));
  }

  listProjectNodes(projectId: string): GraphNode[] {
    this.getProject(projectId);
    return this.listNodes(projectId);
  }

  listProjectEdges(projectId: string): GraphEdge[] {
    this.getProject(projectId);
    return this.listEdges(projectId);
  }

  upsertScannedFileNode(input: {
    projectId: string;
    id: string;
    name: string;
    summary: string;
    sourcePath: string;
    language: LanguageType;
    parentId?: string | null;
  }): GraphNode {
    const parentId = input.parentId ?? this.findDefaultScanParentId(input.projectId);
    const existing = this.db.prepare("SELECT id FROM graph_nodes WHERE id = ?").get(input.id) as { id: string } | undefined;
    if (existing) {
      const existingNode = this.getNode(input.id);
      const updated = this.updateNode(input.id, {
        kind: "module",
        name: input.name,
        summary: input.summary,
        codeContext: `Scanned file: ${input.sourcePath}`,
        codeDirectory: input.sourcePath,
        language: input.language,
        parentId
      });
      if (existingNode.agentStatus === "none") {
        this.db.prepare("UPDATE graph_nodes SET agent_status = 'implemented', updated_at = datetime('now') WHERE id = ?").run(input.id);
        return this.getNode(input.id);
      }
      return updated;
    }
    return this.createNode({
      id: input.id,
      projectId: input.projectId,
      kind: "module",
      name: input.name,
      summary: input.summary,
      codeContext: `Scanned file: ${input.sourcePath}`,
      codeDirectory: input.sourcePath,
      sourcePath: input.sourcePath,
      language: input.language,
      parentId,
      agentStatus: "implemented"
    });
  }

  replaceScannedCodeGraph(projectId: string, snapshot: CodeGraphSnapshot): CodeGraphRefreshResult {
    const project = this.getProject(projectId);
    const save = this.db.transaction(() => {
      const previousGeneratedEntities = this.listGeneratedGraphEntities(projectId, true);
      this.deleteGeneratedCodeGraph(projectId);
      const frameworkId = this.findOrCreateScanFramework(projectId);
      const directoryIdByPath = new Map(snapshot.directories.map((directory) => [directory.path, directory.id]));
      const fileIdByPath = new Map(snapshot.files.map((file) => [file.path, file.id]));
      let workflowNodeCount = 0;

      for (const directory of snapshot.directories) {
        const isRoot = directory.parentPath === null;
        const parentId = isRoot ? frameworkId : directoryIdByPath.get(directory.parentPath ?? ".");
        if (!parentId) {
          throw validationError(`Missing parent directory for ${directory.path}.`);
        }
        this.createNode({
          id: directory.id,
          projectId,
          kind: "module",
          name: isRoot && project.name ? `${project.name} Code Graph` : directory.name,
          summary: isRoot ? "Generated bottom-up code graph" : `Directory ${directory.path}`,
          codeContext: isRoot
            ? this.scanRootContext(projectId, "Generated scanner root that decomposes repository code from directories into file modules and symbols.")
            : `Generated directory module for ${directory.path}.`,
          codeDirectory: directory.path,
          sourcePath: directory.path,
          language: "typescript",
          parentId,
          position: { x: 80 + pathDepth(directory.path) * 260, y: 100 },
          agentStatus: "implemented"
        });
      }

      for (const file of snapshot.files) {
        const parentId = directoryIdByPath.get(file.directoryPath);
        if (!parentId) {
          throw validationError(`Missing directory node for ${file.path}.`);
        }
        const symbolCount = snapshot.symbols.filter((symbol) => symbol.filePath === file.path).length;
        this.createNode({
          id: file.id,
          projectId,
          kind: "module",
          name: file.name,
          summary: `${file.language} file module with ${symbolCount} symbols`,
          codeContext: `Generated file module for ${file.path}. Imports: ${file.imports.map((item) => item.moduleSpecifier).join(", ") || "none"}. Exports: ${file.exports.join(", ") || "none"}.`,
          codeDirectory: file.path,
          codeStartLine: file.startLine,
          codeEndLine: file.endLine,
          sourcePath: file.path,
          sourceStartLine: file.startLine,
          sourceEndLine: file.endLine,
          language: file.language,
          parentId,
          agentStatus: "implemented"
        });
      }

      const symbolById = new Map(snapshot.symbols.map((symbol) => [symbol.id, symbol]));
      const orderedSymbols = [...snapshot.symbols].sort(
        (a, b) => symbolHierarchyDepth(a, symbolById) - symbolHierarchyDepth(b, symbolById) || a.startLine - b.startLine || a.name.localeCompare(b.name)
      );

      for (const symbol of orderedSymbols) {
        const parentId = symbol.parentSymbolId ?? fileIdByPath.get(symbol.filePath);
        if (!parentId) {
          throw validationError(`Missing file node for ${symbol.filePath}.`);
        }
        this.createNode({
          id: symbol.id,
          projectId,
          kind: symbol.kind,
          name: symbol.name,
          summary: symbol.summary,
          codeContext: `${symbol.signature}\n${symbol.summary}`,
          codeDirectory: symbol.filePath,
          codeStartLine: symbol.startLine,
          codeEndLine: symbol.endLine,
          sourcePath: symbol.filePath,
          sourceStartLine: symbol.startLine,
          sourceEndLine: symbol.endLine,
          language: symbol.filePath.endsWith(".js") || symbol.filePath.endsWith(".jsx") ? "javascript" : "typescript",
          parentId,
          agentStatus: "implemented"
        });
      }

      for (const symbol of orderedSymbols.filter((item) => item.kind === "function")) {
        workflowNodeCount += this.createFunctionWorkflow(projectId, symbol);
      }

      for (const edge of snapshot.edges) {
        if (!this.nodeExists(edge.sourceId) || !this.nodeExists(edge.targetId)) {
          continue;
        }
        this.createEdge({
          id: edge.id,
          projectId,
          kind: edge.kind,
          sourceNodeId: edge.sourceId,
          targetNodeId: edge.targetId,
          label: edge.label,
          codeContext: edge.codeContext,
          agentStatus: "implemented"
        });
      }

      this.db
        .prepare("INSERT OR REPLACE INTO graph_revisions (id, project_id, revision, note) VALUES (?, ?, ?, ?)")
        .run(
          `code-graph-revision-${hashId(`${projectId}:${snapshot.files.length}:${snapshot.symbols.length}:${snapshot.edges.length}`)}`,
          projectId,
          100 + snapshot.files.length,
          `Refreshed generated Code Graph from ${snapshot.files.length} files and ${snapshot.symbols.length} symbols`
        );
      this.bumpGraphEntities(
        projectId,
        [...this.listGeneratedGraphEntities(projectId, false), ...previousGeneratedEntities],
        `Refreshed generated Code Graph from ${snapshot.files.length} files and ${snapshot.symbols.length} symbols.`
      );

      return {
        nodeCount: snapshot.directories.length + snapshot.files.length + snapshot.symbols.length + workflowNodeCount,
        edgeCount: snapshot.edges.length + this.countGeneratedWorkflowEdges(projectId),
        fileCount: snapshot.files.length,
        symbolCount: snapshot.symbols.length,
        workflowNodeCount
      };
    });

    return save();
  }

  applyScanPipelineResult(projectId: string, result: ScanPipelineResult, runId?: string | null): CodeGraphRefreshResult {
    this.getProject(projectId);
    const save = this.db.transaction(() => {
      const previousGeneratedEntities = this.listGeneratedGraphEntities(projectId, true);
      if (result.initial) {
        this.deleteGeneratedCodeGraph(projectId);
        this.db.prepare("DELETE FROM scan_file_state WHERE project_id = ?").run(projectId);
      } else {
        this.deleteGeneratedCodeGraphForFiles(projectId, [
          ...result.changedFiles.map((file) => file.path),
          ...result.deletedFiles.map((file) => file.filePath)
        ]);
      }

      const nodeDrafts = uniqueScanNodes([
        ...result.globalOutput.nodes,
        ...result.mediumOutputs.flatMap((output) => output.nodes),
        ...result.localOutputs.flatMap((output) => output.nodes)
      ]);
      const stableIdByKey = new Map(nodeDrafts.map((node) => [node.stableKey, this.scanStableNodeId(projectId, node.stableKey)]));
      const pending = [...nodeDrafts];
      let progressed = true;
      while (pending.length > 0 && progressed) {
        progressed = false;
        for (let index = pending.length - 1; index >= 0; index -= 1) {
          const node = pending[index];
          const parentId = node.parentStableKey ? stableIdByKey.get(node.parentStableKey) ?? null : null;
          const attachedToId = node.attachedToStableKey ? stableIdByKey.get(node.attachedToStableKey) ?? null : null;
          if ((parentId && !this.nodeExists(parentId)) || (attachedToId && !this.nodeExists(attachedToId))) {
            continue;
          }
          this.upsertScanNode(projectId, node, stableIdByKey.get(node.stableKey)!, parentId, attachedToId);
          pending.splice(index, 1);
          progressed = true;
        }
      }
      if (pending.length > 0) {
        throw validationError(`Scanner emitted nodes with unresolved parents: ${pending.map((node) => node.stableKey).join(", ")}`);
      }

      const edgeDrafts = uniqueScanEdges([
        ...result.globalOutput.edges,
        ...result.mediumOutputs.flatMap((output) => output.edges),
        ...result.localOutputs.flatMap((output) => output.edges)
      ]);
      for (const edge of edgeDrafts) {
        const sourceId = stableIdByKey.get(edge.sourceStableKey);
        const targetId = stableIdByKey.get(edge.targetStableKey);
        if (!sourceId || !targetId || !this.nodeExists(sourceId) || !this.nodeExists(targetId)) {
          continue;
        }
        this.upsertScanEdge(projectId, edge, this.scanStableEdgeId(edge), sourceId, targetId);
      }

      this.db.prepare("DELETE FROM scan_file_state WHERE project_id = ?").run(projectId);
      const stateInsert = this.db.prepare(
        "INSERT INTO scan_file_state (project_id, file_path, content_hash, last_run_id, last_scanned_at) VALUES (?, ?, ?, ?, datetime('now'))"
      );
      for (const file of result.inventory) {
        stateInsert.run(projectId, file.path, file.contentHash, runId ?? null);
      }

      this.bumpGraphEntities(
        projectId,
        [...this.listGeneratedGraphEntities(projectId, false), ...previousGeneratedEntities],
        `Applied ${result.initial ? "initial" : "incremental"} three-mode scanner output.`
      );

      return this.generatedCodeGraphCounts(projectId, result.inventory.length);
    });

    return save();
  }

  private deleteGeneratedCodeGraph(projectId: string): void {
    this.db.prepare("DELETE FROM graph_nodes WHERE project_id = ? AND (id LIKE 'scan-%' OR id LIKE 'code-%')").run(projectId);
    this.db.prepare("DELETE FROM graph_revisions WHERE project_id = ? AND id LIKE 'code-graph-revision-%'").run(projectId);
  }

  private deleteGeneratedCodeGraphForFiles(projectId: string, filePaths: string[]): void {
    const paths = [...new Set(filePaths.filter(Boolean))];
    if (paths.length === 0) {
      return;
    }
    const placeholders = paths.map(() => "?").join(", ");
    this.db
      .prepare(
        `
        DELETE FROM graph_nodes
        WHERE project_id = ?
          AND (id LIKE 'scan-%' OR id LIKE 'code-%')
          AND (source_path IN (${placeholders}) OR code_directory IN (${placeholders}))
      `
      )
      .run(projectId, ...paths, ...paths);
    this.db
      .prepare(
        `
        DELETE FROM graph_edges
        WHERE project_id = ?
          AND (id LIKE 'scan-%' OR id LIKE 'code-%')
          AND source_path IN (${placeholders})
      `
      )
      .run(projectId, ...paths);
  }

  private scanStableNodeId(projectId: string, stableKey: string): string {
    if (stableKey === "root") {
      return `scan-framework-${hashId(projectId)}`;
    }
    if (stableKey.startsWith("dir:")) {
      return codeGraphId("code-dir", stableKey.slice("dir:".length) || ".");
    }
    if (stableKey.startsWith("file:")) {
      return codeGraphId("code-file", stableKey.slice("file:".length));
    }
    if (stableKey.startsWith("symbol:")) {
      return codeGraphId("code-symbol", stableKey.slice("symbol:".length));
    }
    if (stableKey.startsWith("code-") || stableKey.startsWith("scan-")) {
      return stableKey;
    }
    return `code-node-${hashId(stableKey)}`;
  }

  private scanStableEdgeId(edge: ScanEdgeDraft): string {
    if (edge.stableKey.startsWith("code-") || edge.stableKey.startsWith("scan-")) {
      return edge.stableKey;
    }
    return `code-edge-${hashId(`${edge.stableKey}:${edge.kind}:${edge.sourceStableKey}:${edge.targetStableKey}`)}`;
  }

  private upsertScanNode(projectId: string, draft: ScanNodeDraft, id: string, parentId: string | null, attachedToId: string | null): void {
    const input: NewGraphNode = {
      id,
      projectId,
      kind: draft.kind,
      name: draft.name,
      summary: draft.summary,
      codeContext: draft.codeContext || draft.summary,
      codeDirectory: draft.source.path,
      codeStartLine: draft.source.startLine,
      codeEndLine: draft.source.endLine,
      sourcePath: draft.source.path,
      sourceStartLine: draft.source.startLine,
      sourceEndLine: draft.source.endLine,
      language: draft.language,
      parentId,
      attachedToId,
      agentStatus: "implemented"
    };
    this.assertValidNode(input, this.nodeExists(id) ? id : undefined);
    const size = defaultSizeForKind(draft.kind);
    if (this.nodeExists(id)) {
      this.db
        .prepare(
          `
          UPDATE graph_nodes
          SET
            kind = @kind,
            name = @name,
            summary = @summary,
            code_context = @codeContext,
            code_directory = @codeDirectory,
            code_start_line = @codeStartLine,
            code_end_line = @codeEndLine,
            language = @language,
            parent_id = @parentId,
            attached_to_id = @attachedToId,
            source_path = @sourcePath,
            source_start_line = @sourceStartLine,
            source_end_line = @sourceEndLine,
            ui_width = @uiWidth,
            ui_height = @uiHeight,
            agent_status = 'implemented',
            updated_at = datetime('now')
          WHERE id = @id
        `
        )
        .run({
          ...input,
          uiWidth: size.width,
          uiHeight: size.height
        });
    } else {
      this.createNode({
        ...input,
        size
      });
    }
    this.replaceGeneratedDetails(id, draft);
  }

  private replaceGeneratedDetails(nodeId: string, draft: ScanNodeDraft): void {
    this.db.prepare("DELETE FROM dependency_details WHERE node_id = ?").run(nodeId);
    this.db.prepare("DELETE FROM io_details WHERE node_id = ?").run(nodeId);
    this.db.prepare("DELETE FROM process_details WHERE node_id = ?").run(nodeId);
    this.db.prepare("DELETE FROM format_details WHERE node_id = ?").run(nodeId);
    this.db.prepare("DELETE FROM basic_block_details WHERE node_id = ?").run(nodeId);
    const detail = draft.detail;
    if ((draft.kind === "input" || draft.kind === "output") && detail) {
      this.createIoDetails({
        nodeId,
        ioKind: detail.ioKind ?? "artifact",
        channel: detail.channel ?? draft.name,
        schemaHint: detail.schemaHint ?? null,
        notes: detail.notes ?? draft.codeContext
      });
    }
    if (draft.kind === "process" && detail) {
      this.createProcessDetails({
        nodeId,
        processKind: detail.processKind ?? "analyze",
        trigger: detail.trigger ?? null,
        notes: detail.notes ?? draft.codeContext
      });
    }
    if (draft.kind === "format" && detail) {
      this.createFormatDetails({
        nodeId,
        formatKind: detail.formatKind ?? "type",
        spec: detail.spec ?? draft.name,
        notes: detail.notes ?? draft.codeContext
      });
    }
  }

  private upsertScanEdge(projectId: string, draft: ScanEdgeDraft, id: string, sourceNodeId: string, targetNodeId: string): void {
    const input: NewGraphEdge = {
      id,
      projectId,
      kind: draft.kind,
      sourceNodeId,
      targetNodeId,
      label: draft.label ?? null,
      codeContext: draft.codeContext,
      sourcePath: draft.source.path,
      sourceStartLine: draft.source.startLine,
      sourceEndLine: draft.source.endLine,
      animated: draft.animated ?? (draft.kind === "flows"),
      agentStatus: "implemented"
    };
    this.getNode(sourceNodeId);
    this.getNode(targetNodeId);
    if (this.edgeExists(id)) {
      this.db
        .prepare(
          `
          UPDATE graph_edges
          SET
            kind = @kind,
            source_node_id = @sourceNodeId,
            target_node_id = @targetNodeId,
            label = @label,
            code_context = @codeContext,
            source_path = @sourcePath,
            source_start_line = @sourceStartLine,
            source_end_line = @sourceEndLine,
            animated = @animated,
            agent_status = 'implemented'
          WHERE id = @id
        `
        )
        .run({
          ...input,
          animated: input.animated === true ? 1 : 0
        });
    } else {
      this.createEdge(input);
    }
  }

  private edgeExists(edgeId: string): boolean {
    return Boolean(this.db.prepare("SELECT id FROM graph_edges WHERE id = ?").get(edgeId));
  }

  private generatedCodeGraphCounts(projectId: string, fileCount: number): CodeGraphRefreshResult {
    const generatedNodeWhere = "project_id = ? AND (id LIKE 'scan-%' OR id LIKE 'code-%')";
    const nodeCount = (this.db.prepare(`SELECT COUNT(*) AS count FROM graph_nodes WHERE ${generatedNodeWhere}`).get(projectId) as { count: number }).count;
    const symbolCount = (
      this.db
        .prepare(`SELECT COUNT(*) AS count FROM graph_nodes WHERE ${generatedNodeWhere} AND kind IN ('function', 'object')`)
        .get(projectId) as { count: number }
    ).count;
    const workflowNodeCount = (
      this.db
        .prepare(`SELECT COUNT(*) AS count FROM graph_nodes WHERE ${generatedNodeWhere} AND kind IN ('input', 'process', 'output', 'format')`)
        .get(projectId) as { count: number }
    ).count;
    const edgeCount = (
      this.db
        .prepare("SELECT COUNT(*) AS count FROM graph_edges WHERE project_id = ? AND (id LIKE 'scan-%' OR id LIKE 'code-%')")
        .get(projectId) as { count: number }
    ).count;
    return { nodeCount, edgeCount, fileCount, symbolCount, workflowNodeCount };
  }

  private listGeneratedGraphEntities(projectId: string, deleted: boolean): GraphEntityVersionInput[] {
    const nodes = this.db
      .prepare("SELECT id FROM graph_nodes WHERE project_id = ? AND (id LIKE 'scan-%' OR id LIKE 'code-%')")
      .all(projectId) as Array<{ id: string }>;
    const edges = this.db
      .prepare(
        `
        SELECT edge.id
        FROM graph_edges edge
        LEFT JOIN graph_nodes source ON source.id = edge.source_node_id
        LEFT JOIN graph_nodes target ON target.id = edge.target_node_id
        WHERE edge.project_id = ?
          AND (
            edge.id LIKE 'scan-%'
            OR edge.id LIKE 'code-%'
            OR source.id LIKE 'scan-%'
            OR source.id LIKE 'code-%'
            OR target.id LIKE 'scan-%'
            OR target.id LIKE 'code-%'
          )
      `
      )
      .all(projectId) as Array<{ id: string }>;
    return [
      ...nodes.map((node) => ({ entityType: "node" as const, entityId: node.id, deleted })),
      ...edges.map((edge) => ({ entityType: "edge" as const, entityId: edge.id, deleted }))
    ];
  }

  private createFunctionWorkflow(projectId: string, symbol: CodeGraphSymbol): number {
    const sourcePath = symbol.filePath;
    const workflowInputs = symbol.parameters.length > 0 ? symbol.parameters : [{ name: "Invocation", typeHint: "function call" }];
    const outputId = `${symbol.id}-output`;
    const outputFormatId = `${outputId}-format`;
    const workflow = symbol.workflow ?? {
      nodes: [
        {
          id: `${symbol.id}-process`,
          kind: "entry" as const,
          name: `Entry ${symbol.name}`,
          summary: `Function entry for ${symbol.name}`,
          codeContext: symbol.signature,
          startLine: symbol.startLine,
          endLine: symbol.endLine
        }
      ],
      edges: []
    };
    const entryNode = workflow.nodes.find((node) => node.kind === "entry") ?? workflow.nodes[0];
    const hasThrowPath = workflow.nodes.some((node) => node.kind === "throw");
    const throwOutputId = `${symbol.id}-throw-output`;
    const throwOutputFormatId = `${throwOutputId}-format`;
    let nodeCount = 0;

    for (const workflowNode of workflow.nodes) {
      const processKind = processKindForWorkflowNode(symbol, workflowNode);
      this.createNode({
        id: workflowNode.id,
        projectId,
        kind: "process",
        name: workflowNode.kind === "entry" ? `${processKindLabel(processKind)} ${symbol.name}` : workflowNode.name,
        summary: workflowNode.summary,
        codeContext: workflowNode.codeContext || `Generated ${workflowNode.kind} workflow block for ${symbol.name}.`,
        codeDirectory: sourcePath,
        codeStartLine: workflowNode.startLine,
        codeEndLine: workflowNode.endLine,
        sourcePath,
        sourceStartLine: workflowNode.startLine,
        sourceEndLine: workflowNode.endLine,
        language: sourceLanguage(sourcePath),
        attachedToId: symbol.id,
        agentStatus: "implemented"
      });
      this.createProcessDetails({
        nodeId: workflowNode.id,
        processKind,
        trigger: workflowNode.kind === "entry" ? (symbol.symbolKind === "component" ? "render" : "function call") : workflowNode.kind,
        notes: workflowNode.codeContext || symbol.signature
      });
      nodeCount += 1;
    }

    this.createNode({
      id: outputId,
      projectId,
      kind: "output",
      name: symbol.returnHint ? `Returns ${symbol.returnHint}` : "Return value",
      summary: `Output produced by ${symbol.name}`,
      codeContext: `Generated output boundary for ${symbol.name}.`,
      codeDirectory: sourcePath,
      codeStartLine: symbol.startLine,
      codeEndLine: symbol.endLine,
      sourcePath,
      sourceStartLine: symbol.startLine,
      sourceEndLine: symbol.endLine,
      language: sourceLanguage(sourcePath),
      attachedToId: symbol.id,
      agentStatus: "implemented"
    });
    this.createIoDetails({
      nodeId: outputId,
      ioKind: "artifact",
      channel: `${symbol.name} return`,
      schemaHint: symbol.returnHint ?? "unknown",
      notes: `Generated return boundary for ${symbol.name}.`
    });
    nodeCount += 1;

    this.createNode({
      id: outputFormatId,
      projectId,
      kind: "format",
      name: symbol.returnHint ?? "return type",
      summary: "Return format",
      codeContext: `Generated return format for ${symbol.name}.`,
      codeDirectory: sourcePath,
      sourcePath,
      attachedToId: outputId,
      agentStatus: "implemented"
    });
    this.createFormatDetails({
      nodeId: outputFormatId,
      formatKind: "type",
      spec: symbol.returnHint ?? "unknown",
      notes: `Return type hint for ${symbol.name}.`
    });
    nodeCount += 1;

    this.createEdge({
      id: workflowEdgeId(outputId, "describes_format", outputFormatId),
      projectId,
      kind: "describes_format",
      sourceNodeId: outputId,
      targetNodeId: outputFormatId,
      label: "format",
      codeContext: `${outputFormatId} describes the return type of ${symbol.name}.`,
      agentStatus: "implemented"
    });

    if (hasThrowPath) {
      this.createNode({
        id: throwOutputId,
        projectId,
        kind: "output",
        name: "Throws error",
        summary: `Exceptional output produced by ${symbol.name}`,
        codeContext: `Generated throw boundary for ${symbol.name}.`,
        codeDirectory: sourcePath,
        codeStartLine: symbol.startLine,
        codeEndLine: symbol.endLine,
        sourcePath,
        sourceStartLine: symbol.startLine,
        sourceEndLine: symbol.endLine,
        language: sourceLanguage(sourcePath),
        attachedToId: symbol.id,
        agentStatus: "implemented"
      });
      this.createIoDetails({
        nodeId: throwOutputId,
        ioKind: "artifact",
        channel: `${symbol.name} throw`,
        schemaHint: "Error",
        notes: `Generated exceptional output boundary for ${symbol.name}.`
      });
      nodeCount += 1;

      this.createNode({
        id: throwOutputFormatId,
        projectId,
        kind: "format",
        name: "Error",
        summary: "Throw format",
        codeContext: `Generated throw format for ${symbol.name}.`,
        codeDirectory: sourcePath,
        sourcePath,
        attachedToId: throwOutputId,
        agentStatus: "implemented"
      });
      this.createFormatDetails({
        nodeId: throwOutputFormatId,
        formatKind: "type",
        spec: "Error",
        notes: `Throw type hint for ${symbol.name}.`
      });
      nodeCount += 1;

      this.createEdge({
        id: workflowEdgeId(throwOutputId, "describes_format", throwOutputFormatId),
        projectId,
        kind: "describes_format",
        sourceNodeId: throwOutputId,
        targetNodeId: throwOutputFormatId,
        label: "format",
        codeContext: `${throwOutputFormatId} describes the throw output type of ${symbol.name}.`,
        agentStatus: "implemented"
      });
    }

    workflowInputs.forEach((parameter, index) => {
      const inputId = `${symbol.id}-input-${hashId(`${parameter.name}:${index}`)}`;
      const inputFormatId = `${inputId}-format`;
      this.createNode({
        id: inputId,
        projectId,
        kind: "input",
        name: parameter.name,
        summary: `Input to ${symbol.name}`,
        codeContext: `Generated input boundary for ${symbol.name} parameter ${parameter.name}.`,
        codeDirectory: sourcePath,
        codeStartLine: symbol.startLine,
        codeEndLine: symbol.endLine,
        sourcePath,
        sourceStartLine: symbol.startLine,
        sourceEndLine: symbol.endLine,
        language: sourceLanguage(sourcePath),
        attachedToId: symbol.id,
        agentStatus: "implemented"
      });
      this.createIoDetails({
        nodeId: inputId,
        ioKind: "artifact",
        channel: `${symbol.name}.${parameter.name}`,
        schemaHint: parameter.typeHint ?? "unknown",
        notes: `Generated parameter boundary for ${symbol.signature}.`
      });
      nodeCount += 1;

      this.createNode({
        id: inputFormatId,
        projectId,
        kind: "format",
        name: parameter.typeHint ?? "input type",
        summary: "Input format",
        codeContext: `Generated input format for ${symbol.name}.${parameter.name}.`,
        codeDirectory: sourcePath,
        sourcePath,
        attachedToId: inputId,
        agentStatus: "implemented"
      });
      this.createFormatDetails({
        nodeId: inputFormatId,
        formatKind: "type",
        spec: parameter.typeHint ?? "unknown",
        notes: `Type hint for ${symbol.name}.${parameter.name}.`
      });
      nodeCount += 1;

      this.createEdge({
        id: workflowEdgeId(inputId, "flows", entryNode.id),
        projectId,
        kind: "flows",
        sourceNodeId: inputId,
        targetNodeId: entryNode.id,
        label: "parameter",
        codeContext: `${parameter.name} flows into ${symbol.name}.`,
        animated: true,
        agentStatus: "implemented"
      });
      this.createEdge({
        id: workflowEdgeId(inputId, "describes_format", inputFormatId),
        projectId,
        kind: "describes_format",
        sourceNodeId: inputId,
        targetNodeId: inputFormatId,
        label: "format",
        codeContext: `${inputFormatId} describes the ${parameter.name} input type.`,
        agentStatus: "implemented"
      });
    });

    for (const edge of workflow.edges) {
      this.createEdge({
        id: edge.id,
        projectId,
        kind: "flows",
        sourceNodeId: edge.sourceId,
        targetNodeId: edge.targetId,
        label: edge.label,
        codeContext: edge.codeContext,
        animated: true,
        agentStatus: "implemented"
      });
    }

    const workflowOutgoing = new Set(workflow.edges.map((edge) => edge.sourceId));
    for (const workflowNode of workflow.nodes) {
      if (workflowNode.kind === "return") {
        this.createEdge({
          id: workflowEdgeId(workflowNode.id, "flows", outputId),
          projectId,
          kind: "flows",
          sourceNodeId: workflowNode.id,
          targetNodeId: outputId,
          label: "return",
          codeContext: `${symbol.name} returns through ${workflowNode.name}.`,
          animated: true,
          agentStatus: "implemented"
        });
        continue;
      }

      if (workflowNode.kind === "throw" && hasThrowPath) {
        this.createEdge({
          id: workflowEdgeId(workflowNode.id, "flows", throwOutputId),
          projectId,
          kind: "flows",
          sourceNodeId: workflowNode.id,
          targetNodeId: throwOutputId,
          label: "throw",
          codeContext: `${symbol.name} throws through ${workflowNode.name}.`,
          animated: true,
          agentStatus: "implemented"
        });
        continue;
      }

      if (!workflowOutgoing.has(workflowNode.id) && workflowNode.id !== outputId) {
        this.createEdge({
          id: workflowEdgeId(workflowNode.id, "flows", outputId),
          projectId,
          kind: "flows",
          sourceNodeId: workflowNode.id,
          targetNodeId: outputId,
          label: "return",
          codeContext: `${symbol.name} falls through to its return output.`,
          animated: true,
          agentStatus: "implemented"
        });
      }
    }

    return nodeCount;
  }

  private countGeneratedWorkflowEdges(projectId: string): number {
    const row = this.db
      .prepare(
        "SELECT COUNT(*) AS count FROM graph_edges WHERE project_id = ? AND id LIKE 'code-edge-%' AND kind IN ('flows', 'describes_format')"
      )
      .get(projectId) as { count: number } | undefined;
    return row?.count ?? 0;
  }

  private nodeExists(nodeId: string): boolean {
    return Boolean(this.db.prepare("SELECT id FROM graph_nodes WHERE id = ?").get(nodeId));
  }

  getHierarchy(projectId: string): HierarchyNode[] {
    const nodes = this.listNodes(projectId).filter((node) => isDomainNodeKind(node.kind));
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const boundaryRows = this.db.prepare("SELECT * FROM graph_boundaries WHERE project_id = ? ORDER BY name ASC").all(projectId) as BoundaryRow[];
    const boundaries = boundaryRows.map((row) => this.mapBoundary(row));
    const boundaryLabelsByNodeId = new Map<string, HierarchyBoundaryLabel[]>();
    const boundaryGroupsByScopeId = new Map<string, HierarchyBoundaryGroup[]>();

    for (const boundary of boundaries) {
      const label = { id: boundary.id, name: boundary.name, color: boundary.color };
      for (const nodeId of boundary.memberNodeIds) {
        const labels = boundaryLabelsByNodeId.get(nodeId) ?? [];
        labels.push(label);
        boundaryLabelsByNodeId.set(nodeId, labels);
      }
      const groups = boundaryGroupsByScopeId.get(boundary.scopeNodeId) ?? [];
      groups.push({
        id: boundary.id,
        scopeNodeId: boundary.scopeNodeId,
        name: boundary.name,
        summary: boundary.summary,
        color: boundary.color,
        memberNodeIds: boundary.memberNodeIds,
        memberNames: boundary.memberNodeIds.map((nodeId) => nodeById.get(nodeId)?.name ?? nodeId)
      });
      boundaryGroupsByScopeId.set(boundary.scopeNodeId, groups);
    }

    const byParent = new Map<string | null, HierarchyNode[]>();
    for (const node of nodes) {
      const treeNode: HierarchyNode = {
        ...node,
        children: [],
        boundaryLabels: boundaryLabelsByNodeId.get(node.id) ?? [],
        boundaryGroups: boundaryGroupsByScopeId.get(node.id) ?? []
      };
      const siblings = byParent.get(node.parentId) ?? [];
      siblings.push(treeNode);
      byParent.set(node.parentId, siblings);
    }

    const attachChildren = (node: HierarchyNode, ancestorIds: Set<string> = new Set()): HierarchyNode => {
      const nextAncestorIds = new Set(ancestorIds);
      nextAncestorIds.add(node.id);
      return {
        ...node,
        children: (byParent.get(node.id) ?? [])
          .filter((child) => !nextAncestorIds.has(child.id))
          .sort(sortHierarchyNodes)
          .map((child) => attachChildren(child, nextAncestorIds))
      };
    };

    return (byParent.get(null) ?? []).sort(sortHierarchyNodes).map((node) => attachChildren(node));
  }

  async getCanvasGraph(input: {
    projectId: string;
    rootNodeId?: string | null;
    depth?: number | null;
    includeAttachments?: boolean;
  }): Promise<CanvasGraph> {
    const project = this.getProject(input.projectId);
    const allNodes = this.listNodes(project.id);
    const scopeNode = this.resolveScopeNode(project, allNodes, input.rootNodeId ?? null);
    let canvas = this.buildCanvasGraph(project, allNodes, scopeNode?.id ?? null, input.includeAttachments ?? true, true);

    if (scopeNode && canvas.nodes.length > 0 && this.countSavedLayouts(project.id, scopeNode.id, canvas.nodes.map((node) => node.id)) === 0) {
      canvas = await this.autoLayoutScope({ projectId: project.id, scopeNodeId: scopeNode.id, includeAttachments: input.includeAttachments ?? true });
    }

    return canvas;
  }

  async autoLayoutScope(input: { projectId: string; scopeNodeId?: string | null; includeAttachments?: boolean }): Promise<CanvasGraph> {
    const project = this.getProject(input.projectId);
    const allNodes = this.listNodes(project.id);
    const scopeNode = this.resolveScopeNode(project, allNodes, input.scopeNodeId ?? null);
    const canvas = this.buildCanvasGraph(project, allNodes, scopeNode?.id ?? null, input.includeAttachments ?? true, true);
    const layout = await layoutCanvasWithBoundaryGroups(canvas.nodes, canvas.edges, canvas.boundaries);

    const save = this.db.transaction(() => {
      for (const [nodeId, value] of layout.nodeLayouts.entries()) {
        this.upsertNodeLayout(nodeId, {
          scopeNodeId: canvas.scopeNodeId ?? nodeId,
          position: value.position,
          size: value.size
        });
      }
      for (const [boundaryId, value] of layout.boundaryLayouts.entries()) {
        this.updateBoundaryLayoutOnly(boundaryId, value);
      }
    });
    save();

    const refreshedNodes = this.listNodes(project.id);
    return this.buildCanvasGraph(project, refreshedNodes, scopeNode?.id ?? null, input.includeAttachments ?? true, true);
  }

  updateNodeLayout(nodeId: string, patch: LayoutPatch): GraphNode {
    this.upsertNodeLayout(nodeId, patch);
    return this.getNode(nodeId);
  }

  getNodeDetail(nodeId: string): NodeDetail {
    const node = this.getNode(nodeId);
    const attachmentRows = this.db
      .prepare("SELECT * FROM graph_nodes WHERE attached_to_id = ? ORDER BY kind ASC, name ASC")
      .all(node.id) as NodeRow[];
    const attachmentTags = this.getTagsForEntityIds("node", attachmentRows.map((row) => row.id));
    const attachments = attachmentRows.map((row) => mapNode(row, this.getChildCount(row.id), attachmentTags.get(row.id) ?? []));
    const detailNodes = [node, ...attachments];
    const detailNodeById = new Map(detailNodes.map((detailNode) => [detailNode.id, detailNode]));
    const detailNodeIds = detailNodes.map((detailNode) => detailNode.id);
    const dependencyRows = this.getDependencyDetailsForNodes(detailNodeIds);
    const ioRows = this.getIoDetailsForNodes(detailNodeIds);
    const processRows = this.getProcessDetailsForNodes(detailNodeIds);
    const formatRows = this.getFormatDetailsForNodes(detailNodeIds);
    const basicRows = this.getBasicBlockDetailsForNodes(detailNodeIds);

    const incomingEdges = this.db
      .prepare("SELECT * FROM graph_edges WHERE target_node_id = ? ORDER BY kind ASC")
      .all(node.id) as EdgeRow[];
    const outgoingEdges = this.db
      .prepare("SELECT * FROM graph_edges WHERE source_node_id = ? ORDER BY kind ASC")
      .all(node.id) as EdgeRow[];
    const edgeTags = this.getTagsForEntityIds("edge", [...incomingEdges, ...outgoingEdges].map((edge) => edge.id));
    const relatedIds = new Set<string>();
    for (const edge of incomingEdges) {
      relatedIds.add(edge.source_node_id);
    }
    for (const edge of outgoingEdges) {
      relatedIds.add(edge.target_node_id);
    }

    return {
      node,
      childCount: node.childCount,
      hasChildren: node.hasChildren,
      dependencies: dependencyRows.map((details) => ({ node: detailNodeById.get(details.nodeId)!, details })),
      inputs: ioRows.filter((details) => detailNodeById.get(details.nodeId)?.kind === "input").map((details) => ({ node: detailNodeById.get(details.nodeId)!, details })),
      outputs: ioRows.filter((details) => detailNodeById.get(details.nodeId)?.kind === "output").map((details) => ({ node: detailNodeById.get(details.nodeId)!, details })),
      processes: processRows.map((details) => ({ node: detailNodeById.get(details.nodeId)!, details })),
      formats: formatRows.map((details) => ({ node: detailNodeById.get(details.nodeId)!, details })),
      basicDetails: basicRows.map((details) => ({ node: detailNodeById.get(details.nodeId)!, details })),
      incomingEdges: incomingEdges.map((edge) => mapEdge(edge, edgeTags.get(edge.id) ?? [])),
      outgoingEdges: outgoingEdges.map((edge) => mapEdge(edge, edgeTags.get(edge.id) ?? [])),
      relatedNodes: [...relatedIds].map((id) => this.getNode(id)),
      reusedIn: this.listReusesForNode(node.projectId, node.id)
    };
  }

  seedSelfGraph(rootPath: string): Project {
    const seed = this.db.transaction(() => {
      const previousSuppression = this.suppressGraphVersionBumps;
      this.suppressGraphVersionBumps = true;
      try {
      this.clearAllGraphData();

      const project = this.createProject({
        id: "graphcode-self",
        name: "graph-code",
        rootPath
      });

      this.db
        .prepare(
          `
          INSERT INTO custom_block_types (id, project_id, name, description, color, icon)
          VALUES (
            'custom-type-test-scenario',
            @projectId,
            'Test Scenario',
            'Curated self-repo blocks used to exercise GraphCode workspace behavior.',
            '#0f766e',
            'flask-conical'
          )
        `
        )
        .run({ projectId: project.id });

      this.db
        .prepare(
          `
          INSERT INTO graph_node_type_styles (project_id, node_kind, color)
          VALUES
            (@projectId, 'website', '#0284c7'),
            (@projectId, 'ui_component', '#db2777'),
            (@projectId, 'module', '#059669')
          `
        )
        .run({ projectId: project.id });

      const nodes: NewGraphNode[] = [
        {
          id: "framework-graphcode-self",
          projectId: project.id,
          kind: "framework",
          name: "GraphCode Self Workspace",
          summary: "Curated graph of this repository, used as the primary local test workspace.",
          sourcePath: "README.md",
          language: "markdown",
          position: { x: 120, y: 80 },
          size: { width: 300, height: 144 }
        },
        {
          id: "module-web",
          projectId: project.id,
          kind: "module",
          name: "Web Workspace",
          summary: "React client for workspace loading, hierarchy navigation, canvas rendering, and block editing.",
          parentId: "framework-graphcode-self",
          sourcePath: "apps/web",
          language: "typescript",
          position: { x: 80, y: 320 }
        },
        {
          id: "module-local-server",
          projectId: project.id,
          kind: "module",
          name: "Local Server",
          summary: "Fastify service that owns workspace opening, SQLite persistence, seeding, routes, and layout APIs.",
          parentId: "framework-graphcode-self",
          sourcePath: "apps/local-server",
          language: "typescript",
          position: { x: 450, y: 320 }
        },
        {
          id: "module-model",
          projectId: project.id,
          kind: "module",
          name: "Graph Model",
          summary: "Shared TypeScript and Zod contract package for graph nodes, edges, canvas payloads, and details.",
          parentId: "framework-graphcode-self",
          sourcePath: "packages/graph-model",
          language: "typescript",
          position: { x: 820, y: 320 }
        },
        {
          id: "module-parser-planned",
          projectId: project.id,
          kind: "module",
          name: "Parser Package",
          summary: "Planned Tree-sitter extraction package reserved for future repository indexing work.",
          parentId: "framework-graphcode-self",
          sourcePath: "packages/parser",
          language: "markdown",
          position: { x: 1190, y: 320 }
        },
        {
          id: "module-agent-runtime-planned",
          projectId: project.id,
          kind: "module",
          name: "Agent Runtime",
          summary: "Planned local/global proposal orchestration package for review-first AI workflows.",
          parentId: "framework-graphcode-self",
          sourcePath: "packages/agent-runtime",
          language: "markdown",
          position: { x: 1560, y: 320 }
        },
        {
          id: "module-docs-research",
          projectId: project.id,
          kind: "module",
          name: "Docs and Research",
          summary: "Repository documentation, architecture notes, prior-art assessment, and product rationale.",
          parentId: "framework-graphcode-self",
          sourcePath: "docs",
          language: "markdown",
          position: { x: 1930, y: 320 }
        },
        {
          id: "module-dev-tooling",
          projectId: project.id,
          kind: "module",
          name: "Developer Tooling",
          summary: "Workspace scripts, tests, fixtures, package manager files, and generated artifacts.",
          parentId: "framework-graphcode-self",
          sourcePath: ".",
          language: "json",
          position: { x: 2300, y: 320 }
        },
        {
          id: "module-web-api",
          projectId: project.id,
          kind: "module",
          name: "Browser API Client",
          summary: "Typed fetch wrappers for projects, workspaces, canvas scopes, nodes, and dev reset.",
          parentId: "module-web",
          sourcePath: "apps/web/src/api.ts",
          sourceStartLine: 1,
          sourceEndLine: 124,
          language: "typescript",
          position: { x: 0, y: 560 }
        },
        {
          id: "website-web-workspace",
          projectId: project.id,
          kind: "website",
          name: "GraphCode Web App",
          summary: "Browser workspace for graph editing and inspection.",
          parentId: "module-web",
          sourcePath: "apps/web/index.html",
          language: "html",
          position: { x: 300, y: 520 },
          size: { width: 280, height: 144 }
        },
        {
          id: "module-app-state",
          projectId: project.id,
          kind: "module",
          name: "App State Orchestrator",
          summary: "Top-level React state machine for bootstrapping projects, loading scopes, and saving blocks.",
          parentId: "module-web",
          sourcePath: "apps/web/src/App.tsx",
          sourceStartLine: 20,
          sourceEndLine: 342,
          language: "typescript",
          position: { x: 300, y: 560 }
        },
        {
          id: "module-app-shell",
          projectId: project.id,
          kind: "module",
          name: "Application Shell",
          summary: "Three-pane UI chrome with hierarchy search, canvas actions, and node inspector wiring.",
          parentId: "module-web",
          sourcePath: "apps/web/src/components/AppShell.tsx",
          sourceStartLine: 1,
          sourceEndLine: 171,
          language: "typescript",
          position: { x: 600, y: 560 }
        },
        {
          id: "module-workspace-canvas",
          projectId: project.id,
          kind: "module",
          name: "Canvas Layer",
          summary: "React Flow rendering layer for pan, zoom, selection, dependency blocks, and I/O boundary blocks.",
          parentId: "module-web",
          sourcePath: "apps/web/src/components/WorkspaceCanvas.tsx",
          sourceStartLine: 1,
          sourceEndLine: 267,
          language: "typescript",
          position: { x: 900, y: 560 }
        },
        {
          id: "module-block-editor",
          projectId: project.id,
          kind: "module",
          name: "Block Editor Dialog",
          summary: "Modal editor for creating and updating domain, attachment, and custom graph blocks.",
          parentId: "module-web",
          sourcePath: "apps/web/src/components/BlockEditorDialog.tsx",
          sourceStartLine: 1,
          sourceEndLine: 273,
          language: "typescript",
          position: { x: 1200, y: 560 }
        },
        {
          id: "ui-app-shell",
          projectId: project.id,
          kind: "ui_component",
          name: "AppShell",
          summary: "Top navigation and three-pane workspace layout.",
          parentId: "website-web-workspace",
          sourcePath: "apps/web/src/components/AppShell.tsx",
          sourceStartLine: 1,
          language: "typescript",
          position: { x: 80, y: 120 }
        },
        {
          id: "ui-workspace-canvas",
          projectId: project.id,
          kind: "ui_component",
          name: "WorkspaceCanvas",
          summary: "Interactive graph canvas and draw modes.",
          parentId: "website-web-workspace",
          sourcePath: "apps/web/src/components/WorkspaceCanvas.tsx",
          sourceStartLine: 1,
          language: "typescript",
          position: { x: 360, y: 120 }
        },
        {
          id: "ui-hierarchy-tree",
          projectId: project.id,
          kind: "ui_component",
          name: "HierarchyTree",
          summary: "Left navigation tree with boundary labels.",
          parentId: "website-web-workspace",
          sourcePath: "apps/web/src/components/HierarchyTree.tsx",
          sourceStartLine: 1,
          language: "typescript",
          position: { x: 640, y: 120 }
        },
        {
          id: "ui-inspector",
          projectId: project.id,
          kind: "ui_component",
          name: "Inspector",
          summary: "Right details panel and style controls.",
          parentId: "website-web-workspace",
          sourcePath: "apps/web/src/components/Inspector.tsx",
          sourceStartLine: 1,
          language: "typescript",
          position: { x: 920, y: 120 }
        },
        {
          id: "ui-block-editor",
          projectId: project.id,
          kind: "ui_component",
          name: "BlockEditorDialog",
          summary: "Block creation and update dialog.",
          parentId: "website-web-workspace",
          sourcePath: "apps/web/src/components/BlockEditorDialog.tsx",
          sourceStartLine: 1,
          language: "typescript",
          position: { x: 80, y: 310 }
        },
        {
          id: "ui-edge-editor",
          projectId: project.id,
          kind: "ui_component",
          name: "EdgeEditorDialog",
          summary: "Edge description and context dialog.",
          parentId: "website-web-workspace",
          sourcePath: "apps/web/src/components/EdgeEditorDialog.tsx",
          sourceStartLine: 1,
          language: "typescript",
          position: { x: 360, y: 310 }
        },
        {
          id: "ui-boundary-editor",
          projectId: project.id,
          kind: "ui_component",
          name: "BoundaryEditorDialog",
          summary: "Boundary metadata and geometry dialog.",
          parentId: "website-web-workspace",
          sourcePath: "apps/web/src/components/BoundaryEditorDialog.tsx",
          sourceStartLine: 1,
          language: "typescript",
          position: { x: 640, y: 310 }
        },
        {
          id: "module-runtime",
          projectId: project.id,
          kind: "module",
          name: "Runtime Boundary",
          summary: "Server startup and workspace switching boundary that preserves local graph state.",
          parentId: "module-local-server",
          sourcePath: "apps/local-server/src",
          language: "typescript",
          position: { x: 360, y: 560 }
        },
        {
          id: "module-routes",
          projectId: project.id,
          kind: "module",
          name: "HTTP Routes",
          summary: "Fastify route registration for projects, workspaces, canvas scopes, nodes, layout, and seed reset.",
          parentId: "module-local-server",
          sourcePath: "apps/local-server/src/routes.ts",
          sourceStartLine: 1,
          sourceEndLine: 113,
          language: "typescript",
          position: { x: 660, y: 560 }
        },
        {
          id: "module-db-repository",
          projectId: project.id,
          kind: "module",
          name: "Graph Repository",
          summary: "SQLite-backed repository for graph CRUD, hierarchy, canvas composition, details, seeds, and layout persistence.",
          parentId: "module-local-server",
          sourcePath: "apps/local-server/src/db/repository.ts",
          language: "typescript",
          position: { x: 960, y: 560 }
        },
        {
          id: "module-db-schema",
          projectId: project.id,
          kind: "module",
          name: "SQLite Schema",
          summary: "Migration helpers and table definitions for graph nodes, edges, details, layouts, and revisions.",
          parentId: "module-local-server",
          sourcePath: "apps/local-server/src/db/schema.ts",
          sourceStartLine: 1,
          sourceEndLine: 244,
          language: "typescript",
          position: { x: 1260, y: 560 }
        },
        {
          id: "module-layout",
          projectId: project.id,
          kind: "module",
          name: "ELK Layout",
          summary: "Canvas auto-layout adapter that translates graph nodes and edges into ELK layout input.",
          parentId: "module-local-server",
          sourcePath: "apps/local-server/src/layout/elk.ts",
          sourceStartLine: 1,
          sourceEndLine: 67,
          language: "typescript",
          position: { x: 1560, y: 560 }
        },
        {
          id: "module-cli-seed",
          projectId: project.id,
          kind: "module",
          name: "Seed CLI",
          summary: "Command-line entrypoint that rebuilds the local self workspace database and workspace metadata.",
          parentId: "module-local-server",
          sourcePath: "apps/local-server/src/cli/seed.ts",
          sourceStartLine: 1,
          sourceEndLine: 31,
          language: "typescript",
          position: { x: 1860, y: 560 }
        },
        {
          id: "module-graph-contract",
          projectId: project.id,
          kind: "module",
          name: "Graph Contract",
          summary: "Node kind enums, Zod schemas, DTO types, and type guards shared across frontend and backend.",
          parentId: "module-model",
          sourcePath: "packages/graph-model/src/index.ts",
          sourceStartLine: 1,
          sourceEndLine: 304,
          language: "typescript",
          position: { x: 820, y: 560 }
        },
        {
          id: "module-research-notes",
          projectId: project.id,
          kind: "module",
          name: "Research Notes",
          summary: "Prior-art assessment and prototype proposal that frame the product and evaluation direction.",
          parentId: "module-docs-research",
          sourcePath: "docs/research/graphcode-assessment.md",
          language: "markdown",
          position: { x: 1930, y: 560 }
        },
        {
          id: "module-test-suite",
          projectId: project.id,
          kind: "module",
          name: "Test Suite",
          summary: "Vitest coverage for graph-model contracts, repository behavior, routes, and the web shell.",
          parentId: "module-dev-tooling",
          sourcePath: ".",
          language: "typescript",
          position: { x: 2300, y: 560 }
        },
        {
          id: "module-workspace-config",
          projectId: project.id,
          kind: "module",
          name: "Workspace Config",
          summary: "pnpm workspace, package scripts, lockfile, TypeScript config, git ignores, and build outputs.",
          parentId: "module-dev-tooling",
          sourcePath: ".",
          language: "json",
          position: { x: 2600, y: 560 }
        },
        { id: "function-app", projectId: project.id, kind: "function", name: "App", summary: "Bootstraps projects, loads hierarchy/canvas data, tracks selection, and routes user actions.", parentId: "module-app-state", sourcePath: "apps/web/src/App.tsx", sourceStartLine: 20, sourceEndLine: 340, language: "typescript", position: { x: 260, y: 820 } },
        { id: "function-load-project", projectId: project.id, kind: "function", name: "loadProject", summary: "Fetches hierarchy and canvas data for a project and selects an initial node detail.", parentId: "module-app-state", sourcePath: "apps/web/src/App.tsx", sourceStartLine: 42, sourceEndLine: 67, language: "typescript", position: { x: 540, y: 820 } },
        { id: "function-open-workspace-client", projectId: project.id, kind: "function", name: "openWorkspace", summary: "Posts a local root path to the server and handles missing workspace responses.", parentId: "module-web-api", sourcePath: "apps/web/src/api.ts", sourceStartLine: 37, sourceEndLine: 52, language: "typescript", position: { x: -20, y: 820 } },
        { id: "function-get-canvas-client", projectId: project.id, kind: "function", name: "getCanvasGraph", summary: "Builds canvas query parameters and fetches a CanvasGraph DTO from the local API.", parentId: "module-web-api", sourcePath: "apps/web/src/api.ts", sourceStartLine: 59, sourceEndLine: 72, language: "typescript", position: { x: 120, y: 820 } },
        { id: "function-app-shell", projectId: project.id, kind: "function", name: "AppShell", summary: "Renders the top bar, hierarchy panel, canvas panel, inspector, and workspace controls.", parentId: "module-app-shell", sourcePath: "apps/web/src/components/AppShell.tsx", sourceStartLine: 32, sourceEndLine: 156, language: "typescript", position: { x: 660, y: 820 } },
        { id: "function-workspace-canvas", projectId: project.id, kind: "function", name: "WorkspaceCanvas", summary: "Wraps the React Flow canvas provider and renders the active workspace scope.", parentId: "module-workspace-canvas", sourcePath: "apps/web/src/components/WorkspaceCanvas.tsx", sourceStartLine: 33, sourceEndLine: 39, language: "typescript", position: { x: 880, y: 820 } },
        { id: "function-to-flow-edges", projectId: project.id, kind: "function", name: "toFlowEdges", summary: "Converts semantic graph edges and attachment links into React Flow edge objects.", parentId: "module-workspace-canvas", sourcePath: "apps/web/src/components/WorkspaceCanvas.tsx", sourceStartLine: 200, sourceEndLine: 252, language: "typescript", position: { x: 1120, y: 820 } },
        { id: "function-block-editor", projectId: project.id, kind: "function", name: "BlockEditorDialog", summary: "Builds node mutation payloads for domain, attachment, and custom block editing.", parentId: "module-block-editor", sourcePath: "apps/web/src/components/BlockEditorDialog.tsx", sourceStartLine: 38, sourceEndLine: 248, language: "typescript", position: { x: 1320, y: 820 } },
        { id: "function-build-server", projectId: project.id, kind: "function", name: "buildServer", summary: "Constructs the Fastify app and preserves existing database content unless explicitly seeding.", parentId: "module-runtime", sourcePath: "apps/local-server/src/server.ts", sourceStartLine: 8, sourceEndLine: 37, language: "typescript", position: { x: 320, y: 820 } },
        { id: "object-workspace-runtime", projectId: project.id, kind: "object", name: "WorkspaceRuntime", summary: "Keeps the active SQLite connection and switches it when a repository workspace is opened.", parentId: "module-runtime", sourcePath: "apps/local-server/src/workspace.ts", sourceStartLine: 9, sourceEndLine: 83, language: "typescript", position: { x: 560, y: 820 } },
        { id: "function-open-workspace", projectId: project.id, kind: "function", name: "openWorkspace", summary: "Validates a repository path, opens or creates its .graphcode database, and writes workspace metadata.", parentId: "module-runtime", sourcePath: "apps/local-server/src/workspace.ts", sourceStartLine: 27, sourceEndLine: 75, language: "typescript", position: { x: 800, y: 820 } },
        { id: "function-register-routes", projectId: project.id, kind: "function", name: "registerApiRoutes", summary: "Registers health, project, workspace, canvas, layout, custom type, node, and dev seed routes.", parentId: "module-routes", sourcePath: "apps/local-server/src/routes.ts", sourceStartLine: 35, sourceEndLine: 112, language: "typescript", position: { x: 680, y: 820 } },
        { id: "object-graph-repository", projectId: project.id, kind: "object", name: "GraphRepository", summary: "Database repository class for projects, nodes, details, canvas scopes, layouts, and self seeding.", parentId: "module-db-repository", sourcePath: "apps/local-server/src/db/repository.ts", sourceStartLine: 215, sourceEndLine: 1643, language: "typescript", position: { x: 940, y: 820 } },
        { id: "function-seed-self-graph", projectId: project.id, kind: "function", name: "seedSelfGraph", summary: "Rebuilds .graphcode graph storage with this repository's curated self-test workspace.", parentId: "module-db-repository", sourcePath: "apps/local-server/src/db/repository.ts", sourceStartLine: 700, language: "typescript", position: { x: 1180, y: 820 } },
        { id: "function-get-canvas-graph", projectId: project.id, kind: "function", name: "getCanvasGraph", summary: "Resolves a scope, composes next-layer nodes and attachments, and applies saved layouts.", parentId: "module-db-repository", sourcePath: "apps/local-server/src/db/repository.ts", sourceStartLine: 568, sourceEndLine: 585, language: "typescript", position: { x: 1420, y: 820 } },
        { id: "function-migrate", projectId: project.id, kind: "function", name: "migrate", summary: "Creates and repairs SQLite graph tables, detail tables, indexes, layouts, and revisions.", parentId: "module-db-schema", sourcePath: "apps/local-server/src/db/schema.ts", sourceStartLine: 70, sourceEndLine: 163, language: "typescript", position: { x: 1260, y: 820 } },
        { id: "function-layout-elk", projectId: project.id, kind: "function", name: "layoutCanvasWithElk", summary: "Runs ELK layered layout and returns per-node canvas positions and dimensions.", parentId: "module-layout", sourcePath: "apps/local-server/src/layout/elk.ts", sourceStartLine: 9, sourceEndLine: 45, language: "typescript", position: { x: 1560, y: 820 } },
        { id: "function-seed-cli", projectId: project.id, kind: "function", name: "seed CLI", summary: "Resolves the repo root, opens .graphcode/graphcode.sqlite, seeds the self graph, and writes workspace.json.", parentId: "module-cli-seed", sourcePath: "apps/local-server/src/cli/seed.ts", sourceStartLine: 1, sourceEndLine: 31, language: "typescript", position: { x: 1860, y: 820 } },
        { id: "object-graph-node", projectId: project.id, kind: "object", name: "GraphNode", summary: "Shared node object with stable identity, kind, hierarchy, attachment, source range, and canvas metadata.", parentId: "module-graph-contract", sourcePath: "packages/graph-model/src/index.ts", sourceStartLine: 120, sourceEndLine: 137, language: "typescript", position: { x: 760, y: 820 } },
        { id: "object-canvas-graph", projectId: project.id, kind: "object", name: "CanvasGraph", summary: "Canvas payload containing the active project, scoped nodes, edges, detail rows, and custom types.", parentId: "module-graph-contract", sourcePath: "packages/graph-model/src/index.ts", sourceStartLine: 270, sourceEndLine: 283, language: "typescript", position: { x: 1000, y: 820 } },
        { id: "object-node-detail", projectId: project.id, kind: "object", name: "NodeDetail", summary: "Inspector payload that groups one selected node with attachments, relationships, and related nodes.", parentId: "module-graph-contract", sourcePath: "packages/graph-model/src/index.ts", sourceStartLine: 285, sourceEndLine: 298, language: "typescript", position: { x: 1240, y: 820 } },
        { id: "object-node-mutation", projectId: project.id, kind: "object", name: "NodeMutation", summary: "Mutation schema accepted by the create and update node routes and the block editor dialog.", parentId: "module-graph-contract", sourcePath: "packages/graph-model/src/index.ts", sourceStartLine: 214, sourceEndLine: 232, language: "typescript", position: { x: 1480, y: 820 } },
        { id: "object-graph-tag", projectId: project.id, kind: "object", name: "GraphTag", summary: "Reusable label metadata shared by blocks, edges, and boundaries.", parentId: "module-graph-contract", sourcePath: "packages/graph-model/src/index.ts", sourceStartLine: 102, language: "typescript", position: { x: 1720, y: 820 } },
        { id: "object-node-reuse", projectId: project.id, kind: "object", name: "GraphNodeReuse", summary: "Canonical node placement reused inside multiple canvas scopes.", parentId: "module-graph-contract", sourcePath: "packages/graph-model/src/index.ts", sourceStartLine: 122, language: "typescript", position: { x: 1960, y: 820 } },
        { id: "function-normalize-tag-name", projectId: project.id, kind: "function", name: "normalizeTagName", summary: "Normalizes user tags for stable lookup and dedupe.", parentId: "module-db-repository", sourcePath: "apps/local-server/src/db/repository.ts", sourceStartLine: 3110, language: "typescript", position: { x: 1660, y: 820 } },
        { id: "function-measure-node-layout", projectId: project.id, kind: "function", name: "measureNodeForLayout", summary: "Estimates card dimensions from block name and description.", parentId: "module-layout", sourcePath: "apps/local-server/src/layout/elk.ts", sourceStartLine: 119, language: "typescript", position: { x: 1800, y: 820 } },
        { id: "object-research-assessment", projectId: project.id, kind: "object", name: "GraphCode Assessment", summary: "Research note describing the product thesis, prior art, novelty limits, and prototype plan.", parentId: "module-research-notes", sourcePath: "docs/research/graphcode-assessment.md", language: "markdown", position: { x: 1930, y: 820 } },
        { id: "object-route-tests", projectId: project.id, kind: "object", name: "Route Tests", summary: "Fastify injection tests for project listing, hierarchy, canvas scopes, workspace opening, and self seed reset.", parentId: "module-test-suite", sourcePath: "apps/local-server/src/routes.test.ts", language: "typescript", position: { x: 2240, y: 820 } },
        { id: "object-web-tests", projectId: project.id, kind: "object", name: "Web Shell Tests", summary: "Mocked UI tests for loading, inspecting, opening subgraphs, layout edits, reset, and block creation.", parentId: "module-test-suite", sourcePath: "apps/web/src/App.test.tsx", language: "typescript", position: { x: 2480, y: 820 } },
        { id: "object-package-scripts", projectId: project.id, kind: "object", name: "package scripts", summary: "Root pnpm scripts for dev, build, typecheck, test, and deterministic self workspace seeding.", parentId: "module-workspace-config", sourcePath: "package.json", language: "json", position: { x: 2600, y: 820 } },
        {
          id: "process-web-render",
          projectId: project.id,
          kind: "process",
          name: "Render Workspace Scope",
          summary: "Turns selected graph scope data into hierarchy, canvas blocks, and inspector state.",
          attachedToId: "module-web",
          position: { x: 320, y: 400 },
          size: { width: 218, height: 104 }
        },
        {
          id: "process-canvas-flow",
          projectId: project.id,
          kind: "process",
          name: "Compose React Flow View",
          summary: "Maps canvas DTOs into draggable, resizable React Flow nodes and routed edges.",
          attachedToId: "module-workspace-canvas",
          position: { x: 920, y: 700 },
          size: { width: 218, height: 104 }
        },
        {
          id: "process-server-api",
          projectId: project.id,
          kind: "process",
          name: "Serve Graph Scope",
          summary: "Builds next-layer canvas payloads, applies saved layouts, and returns node details.",
          attachedToId: "module-local-server",
          position: { x: 620, y: 400 },
          size: { width: 218, height: 104 }
        },
        { id: "process-persist-graph", projectId: project.id, kind: "process", name: "Persist Graph State", summary: "Writes node edits, layout overrides, revisions, and self-seed rows into SQLite.", attachedToId: "module-db-repository", position: { x: 980, y: 700 }, size: { width: 218, height: 104 } },
        {
          id: "process-model-validate",
          projectId: project.id,
          kind: "process",
          name: "Validate Graph DTOs",
          summary: "Keeps frontend and backend contracts aligned around node kinds, sizes, and layout payloads.",
          attachedToId: "module-model",
          position: { x: 980, y: 400 },
          size: { width: 218, height: 104 }
        },
        { id: "process-test-runner", projectId: project.id, kind: "process", name: "Run Verification", summary: "Runs typecheck, repository tests, route tests, and web shell tests against the self graph.", attachedToId: "module-test-suite", position: { x: 2300, y: 700 }, size: { width: 218, height: 104 } },
        {
          id: "dep-web-heroui",
          projectId: project.id,
          kind: "dependency",
          name: "HeroUI",
          summary: "Primary visual component library for fresh, accessible app chrome.",
          attachedToId: "process-web-render",
          position: { x: 330, y: 290 }
        },
        {
          id: "dep-web-reactflow",
          projectId: project.id,
          kind: "dependency",
          name: "React Flow",
          summary: "Infinite canvas library for node, edge, drag, and resize interaction.",
          attachedToId: "process-canvas-flow",
          position: { x: 250, y: 560 }
        },
        {
          id: "dep-server-sqlite",
          projectId: project.id,
          kind: "dependency",
          name: "SQLite",
          summary: "Local-first graph storage with simple reset and inspection behavior.",
          attachedToId: "process-server-api",
          position: { x: 920, y: 470 }
        },
        {
          id: "dep-server-fastify",
          projectId: project.id,
          kind: "dependency",
          name: "Fastify",
          summary: "HTTP API runtime for projects, hierarchy, canvas, node detail, and self seed routes.",
          attachedToId: "process-server-api",
          position: { x: 920, y: 610 }
        },
        {
          id: "dep-server-elk",
          projectId: project.id,
          kind: "dependency",
          name: "ELK Layout",
          summary: "Layered dataflow placement engine for automatic graph layout.",
          attachedToId: "process-server-api",
          position: { x: 920, y: 750 }
        },
        { id: "dep-model-zod", projectId: project.id, kind: "dependency", name: "Zod", summary: "Runtime schema validation for DTOs and request payloads.", attachedToId: "process-model-validate", position: { x: 1110, y: 540 } },
        { id: "dep-tooling-vitest", projectId: project.id, kind: "dependency", name: "Vitest", summary: "Unit and integration test runner across workspace packages.", attachedToId: "process-test-runner", position: { x: 2310, y: 560 } },
        {
          id: "input-repo-root",
          projectId: project.id,
          kind: "input",
          name: "Repository Root",
          summary: "Local repository path represented by this self workspace graph.",
          attachedToId: "framework-graphcode-self",
          position: { x: -170, y: 110 }
        },
        {
          id: "input-user-select",
          projectId: project.id,
          kind: "input",
          name: "Hierarchy Selection",
          summary: "User selection from the left tree chooses the active graph scope.",
          attachedToId: "module-web",
          position: { x: -180, y: 410 }
        },
        {
          id: "input-canvas-api",
          projectId: project.id,
          kind: "input",
          name: "Canvas API Payload",
          summary: "Nodes, edges, details, and saved layout values returned by the local server.",
          attachedToId: "module-workspace-canvas",
          position: { x: -170, y: 700 }
        },
        {
          id: "input-http-request",
          projectId: project.id,
          kind: "input",
          name: "Browser API Request",
          summary: "Local browser request for hierarchy, canvas scope, node details, or layout updates.",
          attachedToId: "module-local-server",
          position: { x: 300, y: 560 }
        },
        { id: "input-workspace-root", projectId: project.id, kind: "input", name: "Workspace Root Path", summary: "Absolute repository path posted to the workspace-open endpoint.", attachedToId: "object-workspace-runtime", position: { x: 500, y: 700 } },
        {
          id: "input-schema-change",
          projectId: project.id,
          kind: "input",
          name: "Schema Intent",
          summary: "Shared graph-model edits that define the frontend and backend contract.",
          attachedToId: "module-model",
          position: { x: 760, y: 520 }
        },
        {
          id: "output-workspace-view",
          projectId: project.id,
          kind: "output",
          name: "Workspace State",
          summary: "Selected node details and active scope state used by the app shell.",
          attachedToId: "module-web",
          position: { x: 640, y: 430 }
        },
        {
          id: "output-canvas-view",
          projectId: project.id,
          kind: "output",
          name: "Canvas View",
          summary: "Visible graph scope rendered as React Flow nodes and edges.",
          attachedToId: "module-workspace-canvas",
          position: { x: 560, y: 700 }
        },
        {
          id: "output-sqlite-file",
          projectId: project.id,
          kind: "output",
          name: "graphcode.sqlite",
          summary: "Local SQLite database file containing graph state, revisions, and per-scope layouts.",
          attachedToId: "module-local-server",
          position: { x: 1080, y: 560 }
        },
        { id: "output-workspace-json", projectId: project.id, kind: "output", name: "workspace.json", summary: "Local workspace metadata written next to graphcode.sqlite.", attachedToId: "object-workspace-runtime", position: { x: 760, y: 700 } },
        {
          id: "output-typescript-types",
          projectId: project.id,
          kind: "output",
          name: "Shared Types",
          summary: "Zod schemas and TypeScript DTOs consumed by the local server and web app.",
          attachedToId: "module-model",
          position: { x: 1390, y: 520 }
        },
        {
          id: "format-selection-node-id",
          projectId: project.id,
          kind: "format",
          name: "node id",
          summary: "Selection payload format.",
          attachedToId: "input-user-select",
          position: { x: -150, y: 540 },
          size: { width: 132, height: 68 }
        },
        {
          id: "format-canvas-json",
          projectId: project.id,
          kind: "format",
          name: "CanvasGraph JSON",
          summary: "Canvas payload DTO shape.",
          attachedToId: "output-canvas-view",
          position: { x: 570, y: 830 },
          size: { width: 150, height: 68 }
        },
        {
          id: "format-http-json",
          projectId: project.id,
          kind: "format",
          name: "REST JSON",
          summary: "Local API request/response format.",
          attachedToId: "input-http-request",
          position: { x: 310, y: 690 },
          size: { width: 132, height: 68 }
        },
        {
          id: "format-sqlite-schema",
          projectId: project.id,
          kind: "format",
          name: "SQLite rows",
          summary: "Persisted table row format.",
          attachedToId: "output-sqlite-file",
          position: { x: 1100, y: 690 },
          size: { width: 132, height: 68 }
        },
        {
          id: "format-zod-types",
          projectId: project.id,
          kind: "format",
          name: "Zod DTOs",
          summary: "Validated shared schema format.",
          attachedToId: "output-typescript-types",
          position: { x: 1400, y: 650 },
          size: { width: 132, height: 68 }
        },
        { id: "format-open-workspace-result", projectId: project.id, kind: "format", name: "OpenWorkspaceResult", summary: "Workspace open/create/missing response union.", attachedToId: "output-workspace-json", position: { x: 780, y: 830 }, size: { width: 180, height: 76 } },
        { id: "database-graphcode-sqlite", projectId: project.id, kind: "database", name: ".graphcode SQLite", summary: "Generated local database that stores the self-repo graph.", attachedToId: "module-local-server", sourcePath: ".graphcode/graphcode.sqlite", position: { x: 1220, y: 420 } },
        { id: "api-local-http", projectId: project.id, kind: "api", name: "Local REST API", summary: "HTTP API consumed by the Vite web app.", attachedToId: "module-routes", sourcePath: "apps/local-server/src/routes.ts", position: { x: 710, y: 700 } },
        { id: "config-db-path", projectId: project.id, kind: "config", name: "GRAPHCODE_DB_PATH", summary: "Optional override for the SQLite database path.", attachedToId: "module-local-server", sourcePath: "apps/local-server/src/config.ts", position: { x: 1240, y: 560 } },
        { id: "environment-node", projectId: project.id, kind: "environment", name: "Node.js runtime", summary: "Local Node and pnpm workspace runtime used by all packages.", attachedToId: "module-dev-tooling", sourcePath: "package.json", position: { x: 2240, y: 420 } },
        { id: "command-seed-self", projectId: project.id, kind: "command", name: "pnpm seed", summary: "Rebuilds .graphcode/graphcode.sqlite from the curated self-repo seed.", attachedToId: "module-cli-seed", sourcePath: "package.json", position: { x: 1880, y: 700 } },
        { id: "command-test", projectId: project.id, kind: "command", name: "pnpm test", summary: "Runs all workspace Vitest suites.", attachedToId: "module-test-suite", sourcePath: "package.json", position: { x: 2240, y: 980 } },
        { id: "command-typecheck", projectId: project.id, kind: "command", name: "pnpm typecheck", summary: "Runs TypeScript no-emit checks across workspace packages.", attachedToId: "module-test-suite", sourcePath: "package.json", position: { x: 2500, y: 980 } },
        { id: "file-pnpm-workspace", projectId: project.id, kind: "file", name: "pnpm-workspace.yaml", summary: "Workspace package discovery file used to resolve the repo root.", attachedToId: "module-workspace-config", sourcePath: "pnpm-workspace.yaml", position: { x: 2620, y: 700 } },
        { id: "artifact-web-dist", projectId: project.id, kind: "artifact", name: "apps/web/dist", summary: "Generated Vite output kept out of source control.", attachedToId: "module-workspace-config", sourcePath: "apps/web/dist", position: { x: 2820, y: 700 } },
        { id: "event-seed-rebuild", projectId: project.id, kind: "event", name: "Self Seed Rebuild", summary: "Explicit developer action that refreshes the local self workspace graph.", attachedToId: "function-seed-cli", position: { x: 2040, y: 700 } },
        { id: "secret-placeholder", projectId: project.id, kind: "secret", name: "No Secrets Stored", summary: "Synthetic safety block proving secret styling without storing credentials.", attachedToId: "module-local-server", position: { x: 1250, y: 700 } },
        { id: "custom-self-fixture", projectId: project.id, kind: "custom", name: "Self Workspace Fixture", summary: "Custom test scenario block proving custom type support in the seeded database.", attachedToId: "module-dev-tooling", customTypeId: "custom-type-test-scenario", position: { x: 2440, y: 420 } }
      ];

      for (const node of nodes) {
        this.createNode(enrichSelfSeedNode(node));
      }

      const reuses: NodeReuseMutation[] = [
        {
          scopeNodeId: "module-web",
          nodeId: "object-graph-tag",
          label: "Reused tag DTO",
          context: "The frontend inspector consumes GraphTag payloads without owning the canonical schema node."
        },
        {
          scopeNodeId: "module-local-server",
          nodeId: "object-graph-tag",
          label: "Reused tag DTO",
          context: "The repository and routes persist GraphTag rows while sharing the canonical graph-model contract."
        },
        {
          scopeNodeId: "module-local-server",
          nodeId: "object-node-reuse",
          label: "Reuse placement DTO",
          context: "The backend stores reusable placements while the canonical schema remains in graph-model."
        },
        {
          scopeNodeId: "module-web",
          nodeId: "object-node-reuse",
          label: "Reuse placement DTO",
          context: "The web canvas can display reused canonical blocks in additional module scopes."
        },
        {
          scopeNodeId: "module-web",
          nodeId: "function-normalize-tag-name",
          label: "Shared tag utility",
          context: "The inspector uses the same normalized tag semantics as the repository even though the source implementation is backend-local for now."
        },
        {
          scopeNodeId: "module-workspace-canvas",
          nodeId: "function-measure-node-layout",
          label: "Layout sizing utility",
          context: "The canvas behavior depends on server-side measured sizes when auto-layout recomputes the scope."
        }
      ];
      for (const reuse of reuses) {
        this.createNodeReuse(project.id, reuse);
      }

      const dependencies: NewDependencyDetails[] = [
        {
          nodeId: "dep-web-heroui",
          dependencyKind: "package",
          spec: "@heroui/react",
          version: "^3",
          notes: "Used for top bar, controls, buttons, and app chrome."
        },
        {
          nodeId: "dep-web-reactflow",
          dependencyKind: "package",
          spec: "@xyflow/react",
          version: "^12",
          notes: "Owns the whiteboard interaction model."
        },
        {
          nodeId: "dep-server-sqlite",
          dependencyKind: "database",
          spec: "better-sqlite3",
          version: "^11",
          notes: "Local embedded database for the v1 backend."
        },
        {
          nodeId: "dep-server-fastify",
          dependencyKind: "runtime",
          spec: "fastify",
          version: "^5",
          notes: "HTTP API for the local browser frontend."
        },
        {
          nodeId: "dep-server-elk",
          dependencyKind: "package",
          spec: "elkjs",
          version: "0.11.1",
          notes: "Layered auto-layout engine for dataflow scopes."
        },
        {
          nodeId: "dep-model-zod",
          dependencyKind: "package",
          spec: "zod",
          version: "^3.25.67",
          notes: "Runtime validation for graph DTOs and route payloads."
        },
        {
          nodeId: "dep-tooling-vitest",
          dependencyKind: "tool",
          spec: "vitest",
          version: "^3.2.4",
          notes: "Workspace test runner used by package scripts."
        }
      ];
      for (const dependency of dependencies) {
        this.createDependencyDetails(dependency);
      }

      const io: NewIoDetails[] = [
        {
          nodeId: "input-repo-root",
          ioKind: "file",
          channel: rootPath,
          schemaHint: "absolute path",
          notes: "Concrete repository root for this self workspace."
        },
        {
          nodeId: "input-user-select",
          ioKind: "user",
          channel: "left hierarchy tree",
          schemaHint: "node id",
          notes: "Changes active canvas root."
        },
        {
          nodeId: "input-canvas-api",
          ioKind: "api",
          channel: "GET /api/projects/:projectId/canvas",
          schemaHint: "CanvasGraph",
          notes: "Backend canvas scope response."
        },
        {
          nodeId: "input-http-request",
          ioKind: "api",
          channel: "local HTTP",
          schemaHint: "REST JSON",
          notes: "Browser-to-server API boundary."
        },
        {
          nodeId: "input-schema-change",
          ioKind: "artifact",
          channel: "packages/graph-model",
          schemaHint: "Zod schema",
          notes: "Shared graph contract input."
        },
        {
          nodeId: "output-workspace-view",
          ioKind: "artifact",
          channel: "React state",
          schemaHint: "selected detail + scope id",
          notes: "Primary app shell state output."
        },
        {
          nodeId: "output-canvas-view",
          ioKind: "artifact",
          channel: "React Flow viewport",
          schemaHint: "nodes[] + edges[]",
          notes: "Primary visual output of the web app."
        },
        {
          nodeId: "output-sqlite-file",
          ioKind: "database",
          channel: ".graphcode/graphcode.sqlite",
          schemaHint: "SQLite",
          notes: "Local persistence boundary."
        },
        {
          nodeId: "input-workspace-root",
          ioKind: "file",
          channel: "POST /api/workspaces/open",
          schemaHint: "absolute path",
          notes: "Path supplied by the workspace dialog."
        },
        {
          nodeId: "output-workspace-json",
          ioKind: "artifact",
          channel: ".graphcode/workspace.json",
          schemaHint: "workspace metadata",
          notes: "Companion metadata for opened workspaces."
        },
        {
          nodeId: "output-typescript-types",
          ioKind: "artifact",
          channel: "TypeScript compiler",
          schemaHint: "types + DTOs",
          notes: "Validated shared output."
        }
      ];
      for (const ioDetail of io) {
        this.createIoDetails(ioDetail);
      }

      const processDetails: NewProcessDetails[] = [
        {
          nodeId: "process-web-render",
          processKind: "render",
          trigger: "selected scope changes",
          notes: "Coordinates the left tree, canvas, and inspector."
        },
        {
          nodeId: "process-canvas-flow",
          processKind: "render",
          trigger: "CanvasGraph response",
          notes: "Builds React Flow nodes, edges, resize handles, and drag handlers."
        },
        {
          nodeId: "process-server-api",
          processKind: "orchestrate",
          trigger: "HTTP request",
          notes: "Builds next-layer graph payloads and persists layout edits."
        },
        {
          nodeId: "process-persist-graph",
          processKind: "persist",
          trigger: "node, layout, or seed write",
          notes: "Uses better-sqlite3 statements under repository validation."
        },
        {
          nodeId: "process-model-validate",
          processKind: "validate",
          trigger: "schema change",
          notes: "Validates graph DTOs and enum changes across packages."
        },
        {
          nodeId: "process-test-runner",
          processKind: "validate",
          trigger: "developer command",
          notes: "Runs repository, route, graph-model, and web shell checks."
        }
      ];
      for (const process of processDetails) {
        this.createProcessDetails(process);
      }

      const formatDetails: NewFormatDetails[] = [
        {
          nodeId: "format-selection-node-id",
          formatKind: "type",
          spec: "string node id",
          example: "module-web",
          notes: "Identifier used for selection and scope changes."
        },
        {
          nodeId: "format-canvas-json",
          formatKind: "schema",
          spec: "CanvasGraph JSON",
          example: "{ nodes, edges, dependencies, io, processes, formats }",
          notes: "Frontend canvas DTO."
        },
        {
          nodeId: "format-http-json",
          formatKind: "protocol",
          spec: "REST JSON",
          example: "PATCH /api/nodes/:nodeId/layout",
          notes: "Browser/server transport format."
        },
        {
          nodeId: "format-sqlite-schema",
          formatKind: "schema",
          spec: "SQLite rows",
          example: "graph_node_layouts",
          notes: "Persisted storage format."
        },
        {
          nodeId: "format-zod-types",
          formatKind: "schema",
          spec: "Zod object schemas",
          example: "graphNodeSchema",
          notes: "Shared validation format."
        },
        {
          nodeId: "format-open-workspace-result",
          formatKind: "type",
          spec: "OpenWorkspaceResult union",
          example: "{ status: 'opened', project, graphcodePath }",
          notes: "Route response shape for workspace open/create/missing states."
        }
      ];
      for (const format of formatDetails) {
        this.createFormatDetails(format);
      }

      const basicDetails: NewBasicBlockDetails[] = [
        { nodeId: "database-graphcode-sqlite", basicKind: "database", key: ".graphcode/graphcode.sqlite", valueHint: "SQLite", required: true, notes: "Generated local database, ignored by git." },
        { nodeId: "api-local-http", basicKind: "api", key: "http://127.0.0.1:3010", valueHint: "Fastify", required: true, notes: "Local-only API for the browser workspace." },
        { nodeId: "config-db-path", basicKind: "config", key: "GRAPHCODE_DB_PATH", valueHint: ".graphcode/graphcode.sqlite", required: false, notes: "Optional override; default resolves from the repo root." },
        { nodeId: "environment-node", basicKind: "environment", key: "Node.js + pnpm", valueHint: "pnpm@10.33.0", required: true, notes: "Runtime declared in packageManager." },
        { nodeId: "command-seed-self", basicKind: "command", key: "pnpm seed", valueHint: "tsx src/cli/seed.ts", required: true, notes: "Rebuilds the self workspace graph." },
        { nodeId: "command-test", basicKind: "command", key: "pnpm test", valueHint: "vitest run", required: true, notes: "Runs workspace tests." },
        { nodeId: "command-typecheck", basicKind: "command", key: "pnpm typecheck", valueHint: "tsc --noEmit", required: true, notes: "Runs workspace type checks." },
        { nodeId: "file-pnpm-workspace", basicKind: "file", key: "pnpm-workspace.yaml", valueHint: "workspace root marker", required: true, notes: "Used by resolveRepoRoot." },
        { nodeId: "artifact-web-dist", basicKind: "artifact", key: "apps/web/dist", valueHint: "generated Vite output", required: false, notes: "Ignored generated artifact." },
        { nodeId: "event-seed-rebuild", basicKind: "event", key: "Self seed rebuild", valueHint: "manual dev action", required: false, notes: "Captures the reset behavior as a graph event." },
        { nodeId: "secret-placeholder", basicKind: "secret", key: "NO_SECRET_VALUE", valueHint: "synthetic placeholder", required: false, notes: "No credentials are stored in this seed." },
        { nodeId: "custom-self-fixture", basicKind: "custom", key: "self-workspace-fixture", valueHint: "curated graph", required: false, notes: "Exercises custom block types." }
      ];
      for (const basicDetail of basicDetails) {
        this.createBasicBlockDetails(basicDetail);
      }

      const edges: NewGraphEdge[] = [
        { id: "edge-web-imports-model", projectId: project.id, kind: "imports", sourceNodeId: "module-web", targetNodeId: "module-model", label: "shared DTOs" },
        { id: "edge-server-imports-model", projectId: project.id, kind: "imports", sourceNodeId: "module-local-server", targetNodeId: "module-model", label: "schemas and types" },
        { id: "edge-web-uses-server", projectId: project.id, kind: "uses", sourceNodeId: "module-web", targetNodeId: "module-local-server", label: "local REST API" },
        { id: "edge-server-uses-sqlite", projectId: project.id, kind: "uses", sourceNodeId: "module-local-server", targetNodeId: "database-graphcode-sqlite", label: "persistence" },
        { id: "edge-routes-call-repository", projectId: project.id, kind: "calls", sourceNodeId: "function-register-routes", targetNodeId: "object-graph-repository", label: "API handlers" },
        { id: "edge-app-calls-api", projectId: project.id, kind: "calls", sourceNodeId: "function-app", targetNodeId: "function-get-canvas-client", label: "load scope" },
        { id: "edge-seed-cli-calls-seed", projectId: project.id, kind: "calls", sourceNodeId: "function-seed-cli", targetNodeId: "function-seed-self-graph", label: "rebuild workspace" },
        { id: "edge-graph-node-impacts-detail", projectId: project.id, kind: "impacts", sourceNodeId: "object-graph-node", targetNodeId: "object-node-detail", label: "inspector contract" },
        { id: "edge-canvas-owns-flow", projectId: project.id, kind: "owns", sourceNodeId: "module-workspace-canvas", targetNodeId: "function-to-flow-edges", label: "edge rendering" },
        { id: "edge-repository-owns-seed", projectId: project.id, kind: "owns", sourceNodeId: "object-graph-repository", targetNodeId: "function-seed-self-graph", label: "seed method" },
        { id: "flow-web-input-process", projectId: project.id, kind: "flows", sourceNodeId: "input-user-select", targetNodeId: "process-web-render", label: "selection" },
        { id: "flow-web-process-child", projectId: project.id, kind: "flows", sourceNodeId: "process-web-render", targetNodeId: "module-workspace-canvas", label: "active scope" },
        { id: "flow-web-child-output", projectId: project.id, kind: "flows", sourceNodeId: "module-workspace-canvas", targetNodeId: "output-workspace-view", label: "view state" },
        { id: "flow-canvas-input-process", projectId: project.id, kind: "flows", sourceNodeId: "input-canvas-api", targetNodeId: "process-canvas-flow", label: "canvas DTO" },
        { id: "flow-canvas-process-function", projectId: project.id, kind: "flows", sourceNodeId: "process-canvas-flow", targetNodeId: "function-to-flow-edges", label: "render edges" },
        { id: "flow-canvas-function-output", projectId: project.id, kind: "flows", sourceNodeId: "function-to-flow-edges", targetNodeId: "output-canvas-view", label: "React Flow" },
        { id: "flow-server-input-process", projectId: project.id, kind: "flows", sourceNodeId: "input-http-request", targetNodeId: "process-server-api", label: "request" },
        { id: "flow-server-process-function", projectId: project.id, kind: "flows", sourceNodeId: "process-server-api", targetNodeId: "function-get-canvas-graph", label: "canvas response" },
        { id: "flow-server-process-output", projectId: project.id, kind: "flows", sourceNodeId: "process-server-api", targetNodeId: "output-sqlite-file", label: "layout rows" },
        { id: "flow-workspace-open-input", projectId: project.id, kind: "flows", sourceNodeId: "input-workspace-root", targetNodeId: "function-open-workspace", label: "open path" },
        { id: "flow-workspace-open-output", projectId: project.id, kind: "flows", sourceNodeId: "function-open-workspace", targetNodeId: "output-workspace-json", label: "metadata" },
        { id: "flow-seed-command-function", projectId: project.id, kind: "flows", sourceNodeId: "command-seed-self", targetNodeId: "function-seed-cli", label: "executes" },
        { id: "flow-seed-function-db", projectId: project.id, kind: "flows", sourceNodeId: "function-seed-self-graph", targetNodeId: "database-graphcode-sqlite", label: "writes rows" },
        { id: "flow-model-input-process", projectId: project.id, kind: "flows", sourceNodeId: "input-schema-change", targetNodeId: "process-model-validate", label: "schema" },
        { id: "flow-model-process-node", projectId: project.id, kind: "flows", sourceNodeId: "process-model-validate", targetNodeId: "object-graph-node", label: "node DTO" },
        { id: "flow-model-process-detail", projectId: project.id, kind: "flows", sourceNodeId: "process-model-validate", targetNodeId: "object-node-detail", label: "detail DTO" },
        { id: "flow-model-detail-output", projectId: project.id, kind: "flows", sourceNodeId: "object-node-detail", targetNodeId: "output-typescript-types", label: "types" },
        { id: "flow-test-command-process", projectId: project.id, kind: "flows", sourceNodeId: "command-test", targetNodeId: "process-test-runner", label: "tests" },
        { id: "format-selection-edge", projectId: project.id, kind: "describes_format", sourceNodeId: "input-user-select", targetNodeId: "format-selection-node-id", label: "format" },
        { id: "format-canvas-edge", projectId: project.id, kind: "describes_format", sourceNodeId: "output-canvas-view", targetNodeId: "format-canvas-json", label: "format" },
        { id: "format-http-edge", projectId: project.id, kind: "describes_format", sourceNodeId: "input-http-request", targetNodeId: "format-http-json", label: "format" },
        { id: "format-sqlite-edge", projectId: project.id, kind: "describes_format", sourceNodeId: "output-sqlite-file", targetNodeId: "format-sqlite-schema", label: "format" },
        { id: "format-zod-edge", projectId: project.id, kind: "describes_format", sourceNodeId: "output-typescript-types", targetNodeId: "format-zod-types", label: "format" },
        { id: "format-workspace-edge", projectId: project.id, kind: "describes_format", sourceNodeId: "output-workspace-json", targetNodeId: "format-open-workspace-result", label: "format" }
      ];
      for (const edge of edges) {
        this.createEdge(enrichSelfSeedEdge(edge));
      }

      const layouts: LayoutPatch[] = [
        { scopeNodeId: "framework-graphcode-self", position: { x: 40, y: 60 }, size: { width: 260, height: 136 } },
        { scopeNodeId: "framework-graphcode-self", position: { x: 360, y: 60 }, size: { width: 260, height: 136 } },
        { scopeNodeId: "framework-graphcode-self", position: { x: 680, y: 60 }, size: { width: 260, height: 136 } }
      ];
      const frameworkLayoutNodeIds = ["module-web", "module-local-server", "module-model"];
      for (const [index, nodeId] of frameworkLayoutNodeIds.entries()) {
        this.upsertNodeLayout(nodeId, {
          scopeNodeId: layouts[index].scopeNodeId,
          position: layouts[index].position,
          size: layouts[index].size
        });
      }

      for (const [index, nodeId] of ["module-runtime", "module-routes", "module-db-repository", "module-db-schema", "module-layout", "module-cli-seed"].entries()) {
        this.upsertNodeLayout(nodeId, {
          scopeNodeId: "module-local-server",
          position: { x: 80 + index * 260, y: 90 },
          size: { width: 250, height: 128 }
        });
      }

      for (const [index, nodeId] of ["process-server-api", "input-http-request", "output-sqlite-file", "database-graphcode-sqlite", "config-db-path", "command-seed-self"].entries()) {
        this.upsertNodeLayout(nodeId, {
          scopeNodeId: "module-local-server",
          position: { x: 80 + index * 240, y: 300 },
          size: { width: 224, height: 112 }
        });
      }

      for (const [index, nodeId] of ["ui-app-shell", "ui-workspace-canvas", "ui-hierarchy-tree", "ui-inspector", "ui-block-editor", "ui-edge-editor", "ui-boundary-editor"].entries()) {
        this.upsertNodeLayout(nodeId, {
          scopeNodeId: "website-web-workspace",
          position: { x: 70 + (index % 4) * 280, y: 100 + Math.floor(index / 4) * 190 },
          size: { width: 244, height: 124 }
        });
      }

      const boundaries: NewGraphBoundary[] = [
        {
          id: "boundary-frontend",
          projectId: project.id,
          scopeNodeId: "framework-graphcode-self",
          name: "Frontend",
          summary: "React workspace modules",
          color: "#2563eb",
          codeContext:
            "Boundary grouping for the user-facing web workspace. It should contain the React application surface that loads projects, renders hierarchy and canvas state, and sends edit requests to the local API.",
          position: { x: 20, y: 20 },
          size: { width: 300, height: 210 }
        },
        {
          id: "boundary-backend",
          projectId: project.id,
          scopeNodeId: "framework-graphcode-self",
          name: "Backend",
          summary: "Local API and persistence",
          color: "#059669",
          codeContext:
            "Boundary grouping for the local Fastify and SQLite backend. It marks the server-side modules that own workspace opening, route handling, graph persistence, layout, and deterministic self seeding.",
          position: { x: 330, y: 20 },
          size: { width: 330, height: 210 }
        },
        {
          id: "boundary-shared-model",
          projectId: project.id,
          scopeNodeId: "framework-graphcode-self",
          name: "Shared Model",
          summary: "Typed graph contract",
          color: "#7c3aed",
          codeContext:
            "Boundary grouping for the shared DTO and schema package. Edits here define the contract that both the local server and React client must agree on, so tests should cover parsing and serialized payload shape.",
          position: { x: 650, y: 20 },
          size: { width: 330, height: 210 }
        },
        {
          id: "boundary-tooling",
          projectId: project.id,
          scopeNodeId: "framework-graphcode-self",
          name: "Tooling",
          summary: "Scripts, tests, and outputs",
          color: "#ca8a04",
          codeContext:
            "Boundary grouping for scripts, tests, generated outputs, package configuration, and developer commands. It is intentionally separate from product runtime modules so repo hygiene and verification behavior can be tested.",
          position: { x: 2240, y: 260 },
          size: { width: 720, height: 260 }
        },
        {
          id: "boundary-backend-internals",
          projectId: project.id,
          scopeNodeId: "module-local-server",
          name: "Backend Internals",
          summary: "Server implementation layers",
          color: "#dc2626",
          codeContext:
            "Module-local boundary covering runtime, routes, repository, schema, layout, seed, and selected server attachments. Use it to test nested boundary persistence, membership after layout moves, and inspector context for backend work.",
          position: { x: 40, y: 40 },
          size: { width: 1540, height: 420 }
        },
        {
          id: "boundary-web-ui-components",
          projectId: project.id,
          scopeNodeId: "website-web-workspace",
          name: "Frontend UI Components",
          summary: "React component workbench",
          color: "#db2777",
          codeContext:
            "Website-scope boundary covering AppShell, WorkspaceCanvas, HierarchyTree, Inspector, and editor dialogs. Use it to test boundary groups in the left hierarchy and style controls for frontend UI modules.",
          position: { x: 35, y: 55 },
          size: { width: 1160, height: 410 }
        }
      ];
      for (const boundary of boundaries) {
        this.createBoundaryRow(boundary);
      }

      const nodeTags: Array<{ nodeId: string; tags: TagMutation[] }> = [
        { nodeId: "module-web", tags: [{ name: "frontend", color: "#2563eb" }, { name: "workspace" }] },
        { nodeId: "module-local-server", tags: [{ name: "backend", color: "#059669" }, { name: "persistence" }] },
        { nodeId: "module-model", tags: [{ name: "shared", color: "#7c3aed" }, { name: "contract" }] },
        { nodeId: "object-graph-tag", tags: [{ name: "taggable", color: "#be185d" }, { name: "shared" }] },
        { nodeId: "object-node-reuse", tags: [{ name: "reusable", color: "#0f766e" }, { name: "canvas" }] },
        { nodeId: "function-measure-node-layout", tags: [{ name: "layout", color: "#ca8a04" }, { name: "sizing" }] }
      ];
      for (const item of nodeTags) {
        this.setNodeTags(item.nodeId, { tags: item.tags });
      }

      const edgeTags: Array<{ edgeId: string; tags: TagMutation[] }> = [
        { edgeId: "edge-web-uses-server", tags: [{ name: "api", color: "#0891b2" }, { name: "critical" }] },
        { edgeId: "edge-server-imports-model", tags: [{ name: "shared" }, { name: "contract" }] },
        { edgeId: "flow-server-process-output", tags: [{ name: "persistence" }, { name: "layout" }] }
      ];
      for (const item of edgeTags) {
        this.setEdgeTags(item.edgeId, { tags: item.tags });
      }

      const boundaryTags: Array<{ boundaryId: string; tags: TagMutation[] }> = [
        { boundaryId: "boundary-frontend", tags: [{ name: "frontend", color: "#2563eb" }] },
        { boundaryId: "boundary-backend", tags: [{ name: "backend", color: "#059669" }] },
        { boundaryId: "boundary-shared-model", tags: [{ name: "shared", color: "#7c3aed" }] },
        { boundaryId: "boundary-web-ui-components", tags: [{ name: "ui", color: "#db2777" }, { name: "frontend" }] }
      ];
      for (const item of boundaryTags) {
        this.setBoundaryTags(item.boundaryId, { tags: item.tags });
      }

      this.db
        .prepare(
          `
          INSERT INTO graph_revisions (id, project_id, revision, note)
          VALUES
            ('self-revision-1', @projectId, 1, 'Created deterministic self-repo GraphCode workspace seed'),
            ('self-revision-2', @projectId, 2, 'Added full node/detail/edge coverage for local testing'),
            ('self-revision-3', @projectId, 3, 'Added edge context, boundary coverage, tags, reuse placements, and layout sizing examples')
        `
        )
        .run({ projectId: project.id });

      this.ensureDefaultSettings(project.id);

      return project;
      } finally {
        this.suppressGraphVersionBumps = previousSuppression;
      }
    });

    return seed();
  }

  private buildCanvasGraph(project: Project, allNodes: GraphNode[], scopeNodeId: string | null, includeAttachments: boolean, applySavedLayout: boolean): CanvasGraph {
    const scopeNode = scopeNodeId ? allNodes.find((node) => node.id === scopeNodeId) ?? null : null;
    const allEdges = this.listEdges(project.id);
    const includedIds = this.collectCanvasNodeIds(project.id, allNodes, scopeNode, includeAttachments);
    const scopeLabel = scopeNode?.name ?? project.name;
    const scopedNodes = allNodes.filter((node) => includedIds.has(node.id));
    const nodes = applySavedLayout && scopeNode ? this.applyScopeLayouts(project.id, scopeNode.id, scopedNodes) : scopedNodes;
    const edges = allEdges.filter((edge) => includedIds.has(edge.sourceNodeId) && includedIds.has(edge.targetNodeId));
    const nodeIds = nodes.map((node) => node.id);
    const reuses = scopeNode ? this.listReusesForScope(project.id, scopeNode.id).filter((reuse) => includedIds.has(reuse.nodeId)) : [];

    return {
      project,
      rootNodeId: scopeNode?.id ?? null,
      scopeNodeId: scopeNode?.id ?? null,
      scopeLabel,
      nodes,
      edges,
      boundaries: scopeNode ? this.listBoundariesForScope(project.id, scopeNode.id) : [],
      dependencies: this.getDependencyDetailsForNodes(nodeIds),
      io: this.getIoDetailsForNodes(nodeIds),
      processes: this.getProcessDetailsForNodes(nodeIds),
      formats: this.getFormatDetailsForNodes(nodeIds),
      basicDetails: this.getBasicBlockDetailsForNodes(nodeIds),
      customTypes: this.listCustomBlockTypes(project.id),
      nodeTypeStyles: this.listNodeTypeStyles(project.id),
      reuses
    };
  }

  private collectCanvasNodeIds(projectId: string, allNodes: GraphNode[], scopeNode: GraphNode | null, includeAttachments: boolean): Set<string> {
    if (!scopeNode) {
      return new Set(allNodes.filter((node) => isDomainNodeKind(node.kind) && !node.parentId).map((node) => node.id));
    }

    const included = new Set<string>();
    const directChildren = allNodes.filter((node) => isDomainNodeKind(node.kind) && node.parentId === scopeNode.id);
    const primaryNodes = directChildren.length > 0 ? directChildren : scopeNode.kind === "function" || scopeNode.kind === "object" ? [scopeNode] : [];

    for (const node of primaryNodes) {
      included.add(node.id);
    }

    for (const reuse of this.listReusesForScope(projectId, scopeNode.id)) {
      included.add(reuse.nodeId);
    }

    if (!includeAttachments || scopeNode.kind === "framework") {
      return included;
    }

    const expandableAttachmentIds = new Set<string>();
    for (const node of allNodes) {
      if (node.attachedToId === scopeNode.id && isAttachmentNodeKind(node.kind)) {
        included.add(node.id);
        expandableAttachmentIds.add(node.id);
      }
    }

    let changed = true;
    while (changed) {
      changed = false;
      for (const node of allNodes) {
        if (!node.attachedToId || included.has(node.id)) {
          continue;
        }
        if (isAttachmentNodeKind(node.kind) && expandableAttachmentIds.has(node.attachedToId)) {
          included.add(node.id);
          expandableAttachmentIds.add(node.id);
          changed = true;
        }
      }
    }

    return included;
  }

  private resolveScopeNode(project: Project, allNodes: GraphNode[], rootNodeId: string | null): GraphNode | null {
    if (rootNodeId) {
      const node = allNodes.find((candidate) => candidate.id === rootNodeId);
      if (!node) {
        throw notFound(`Root node not found: ${rootNodeId}`);
      }
      if (!isDomainNodeKind(node.kind)) {
        throw validationError("Canvas root must be a domain node.");
      }
      return node;
    }

    return (
      allNodes.find((node) => node.kind === "framework" && node.projectId === project.id) ??
      allNodes.find((node) => isDomainNodeKind(node.kind) && !node.parentId) ??
      null
    );
  }

  private listNodes(projectId: string): GraphNode[] {
    const rows = this.db.prepare("SELECT * FROM graph_nodes WHERE project_id = ? ORDER BY kind ASC, name ASC").all(projectId) as NodeRow[];
    const childCounts = buildChildCountMap(rows);
    const tagsByNodeId = this.getTagsForEntityIds("node", rows.map((row) => row.id));
    return rows.map((row) => mapNode(row, childCounts.get(row.id) ?? 0, tagsByNodeId.get(row.id) ?? []));
  }

  private listEdges(projectId: string): GraphEdge[] {
    const rows = this.db.prepare("SELECT * FROM graph_edges WHERE project_id = ? ORDER BY kind ASC, id ASC").all(projectId) as EdgeRow[];
    const tagsByEdgeId = this.getTagsForEntityIds("edge", rows.map((row) => row.id));
    return rows.map((row) => mapEdge(row, tagsByEdgeId.get(row.id) ?? []));
  }

  private listBoundariesForScope(projectId: string, scopeNodeId: string): GraphBoundary[] {
    const rows = this.db
      .prepare("SELECT * FROM graph_boundaries WHERE project_id = ? AND scope_node_id = ? ORDER BY name ASC")
      .all(projectId, scopeNodeId) as BoundaryRow[];
    return rows.map((row) => this.mapBoundary(row));
  }

  private findDefaultScanParentId(projectId: string): string {
    return this.findOrCreateScanRoot(projectId);
  }

  private findOrCreateScanRoot(projectId: string): string {
    const scanRootId = `scan-root-${hashId(projectId)}`;
    const existing = this.db.prepare("SELECT id FROM graph_nodes WHERE project_id = ? AND id = ?").get(projectId, scanRootId) as
      | { id: string }
      | undefined;
    if (existing) {
      return existing.id;
    }

    const frameworkId = this.findOrCreateScanFramework(projectId);
    return this.createNode({
      id: scanRootId,
      projectId,
      kind: "module",
      name: "Repository Scan",
      summary: "Scanner-generated file map",
      codeContext: this.scanRootContext(projectId, "Container for scanner-generated file blocks."),
      parentId: frameworkId,
      agentStatus: "implemented"
    }).id;
  }

  private findOrCreateScanFramework(projectId: string): string {
    const framework = this.db.prepare("SELECT id FROM graph_nodes WHERE project_id = ? AND kind = 'framework' ORDER BY name ASC LIMIT 1").get(projectId) as
      | { id: string }
      | undefined;
    if (framework) {
      return framework.id;
    }

    const project = this.getProject(projectId);
    const frameworkId = `scan-framework-${hashId(projectId)}`;
    const existing = this.db.prepare("SELECT id FROM graph_nodes WHERE project_id = ? AND id = ?").get(projectId, frameworkId) as
      | { id: string }
      | undefined;
    if (existing) {
      return existing.id;
    }

    return this.createNode({
      id: frameworkId,
      projectId,
      kind: "framework",
      name: project.name || "Scanned Workspace",
      summary: "Scanned repository workspace",
      codeContext: this.scanRootContext(projectId, "Root created by the scanner for a blank workspace."),
      agentStatus: "implemented"
    }).id;
  }

  private scanRootContext(projectId: string, fallback: string): string {
    const project = this.getProject(projectId);
    return [
      fallback,
      project.description ? `Project description: ${project.description}` : "",
      project.scanningInstructions ? `Scanning instructions: ${project.scanningInstructions}` : ""
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  private ensureDefaultSettings(projectId: string): void {
    this.getProject(projectId);
    const existing = this.db.prepare("SELECT project_id FROM workspace_settings WHERE project_id = ?").get(projectId);
    if (!existing) {
      this.db
        .prepare(
          "INSERT INTO workspace_settings (project_id, theme, github_enabled, github_repository, github_client_id, auto_review_after_coding) VALUES (?, 'system', 0, '', '', 1)"
        )
        .run(projectId);
    }
    for (const agentKind of AGENT_KINDS) {
      const row = this.db
        .prepare("SELECT agent_kind FROM agent_settings WHERE project_id = ? AND agent_kind = ?")
        .get(projectId, agentKind);
      if (!row) {
        this.upsertAgentSettings(projectId, defaultAgentConfig(agentKind));
      }
    }
    const legacyCodingRow = this.db
      .prepare("SELECT * FROM agent_settings WHERE project_id = ? AND agent_kind = 'coding'")
      .get(projectId) as AgentSettingsRow | undefined;
    const legacyCodingConfig = legacyCodingRow ? mapAgentSettings(legacyCodingRow) : defaultAgentConfig("coding");
    for (const mode of CODING_AGENT_MODES) {
      if (!this.hasCodingAgentSettings(projectId, mode)) {
        this.upsertCodingAgentSettings(projectId, {
          mode,
          provider: legacyCodingConfig.provider,
          model: legacyCodingConfig.model,
          parallelLimit: legacyCodingConfig.parallelLimit,
          apiKeySource: legacyCodingConfig.apiKeySource,
          systemPromptSource: legacyCodingConfig.systemPromptSource
        });
      }
    }
    for (const mode of SCANNING_AGENT_MODES) {
      if (!this.hasScanningAgentSettings(projectId, mode)) {
        this.upsertScanningAgentSettings(projectId, defaultScanningAgentConfig(mode));
      }
    }
  }

  private upsertAgentSettings(projectId: string, agent: AgentConfig): void {
    this.db
      .prepare(
        `
        INSERT INTO agent_settings (
          project_id, agent_kind, provider, model, parallel_limit,
          api_key_source_type, api_key_source_value,
          system_prompt_source_type, system_prompt_source_value,
          created_at, updated_at
        )
        VALUES (
          @projectId, @agentKind, @provider, @model, @parallelLimit,
          @apiKeySourceType, @apiKeySourceValue,
          @systemPromptSourceType, @systemPromptSourceValue,
          datetime('now'), datetime('now')
        )
        ON CONFLICT(project_id, agent_kind)
        DO UPDATE SET
          provider = excluded.provider,
          model = excluded.model,
          parallel_limit = excluded.parallel_limit,
          api_key_source_type = excluded.api_key_source_type,
          api_key_source_value = excluded.api_key_source_value,
          system_prompt_source_type = excluded.system_prompt_source_type,
          system_prompt_source_value = excluded.system_prompt_source_value,
          updated_at = datetime('now')
      `
      )
      .run({
        projectId,
        agentKind: agent.agentKind,
        provider: agent.provider,
        model: agent.model,
        parallelLimit: agent.parallelLimit,
        apiKeySourceType: agent.apiKeySource.type,
        apiKeySourceValue: agent.apiKeySource.value ?? "",
        systemPromptSourceType: agent.systemPromptSource.type,
        systemPromptSourceValue: agent.systemPromptSource.value ?? ""
      });
  }

  private hasCodingAgentSettings(projectId: string, mode: CodingAgentMode): boolean {
    return Boolean(
      this.db
        .prepare("SELECT coding_mode FROM coding_agent_settings WHERE project_id = ? AND coding_mode = ?")
        .get(projectId, mode)
    );
  }

  private upsertCodingAgentSettings(projectId: string, agent: CodingAgentConfig): void {
    this.db
      .prepare(
        `
        INSERT INTO coding_agent_settings (
          project_id, coding_mode, provider, model, parallel_limit,
          api_key_source_type, api_key_source_value,
          system_prompt_source_type, system_prompt_source_value,
          created_at, updated_at
        )
        VALUES (
          @projectId, @codingMode, @provider, @model, @parallelLimit,
          @apiKeySourceType, @apiKeySourceValue,
          @systemPromptSourceType, @systemPromptSourceValue,
          datetime('now'), datetime('now')
        )
        ON CONFLICT(project_id, coding_mode)
        DO UPDATE SET
          provider = excluded.provider,
          model = excluded.model,
          parallel_limit = excluded.parallel_limit,
          api_key_source_type = excluded.api_key_source_type,
          api_key_source_value = excluded.api_key_source_value,
          system_prompt_source_type = excluded.system_prompt_source_type,
          system_prompt_source_value = excluded.system_prompt_source_value,
          updated_at = datetime('now')
      `
      )
      .run({
        projectId,
        codingMode: agent.mode,
        provider: agent.provider,
        model: agent.model,
        parallelLimit: agent.parallelLimit,
        apiKeySourceType: agent.apiKeySource.type,
        apiKeySourceValue: agent.apiKeySource.value ?? "",
        systemPromptSourceType: agent.systemPromptSource.type,
        systemPromptSourceValue: agent.systemPromptSource.value ?? ""
      });
  }

  private hasScanningAgentSettings(projectId: string, mode: ScanningAgentMode): boolean {
    return Boolean(
      this.db
        .prepare("SELECT scanning_mode FROM scanning_agent_settings WHERE project_id = ? AND scanning_mode = ?")
        .get(projectId, mode)
    );
  }

  private upsertScanningAgentSettings(projectId: string, agent: ScanningAgentConfig): void {
    this.db
      .prepare(
        `
        INSERT INTO scanning_agent_settings (
          project_id, scanning_mode, provider, model, parallel_limit,
          api_key_source_type, api_key_source_value,
          system_prompt_source_type, system_prompt_source_value,
          created_at, updated_at
        )
        VALUES (
          @projectId, @scanningMode, @provider, @model, @parallelLimit,
          @apiKeySourceType, @apiKeySourceValue,
          @systemPromptSourceType, @systemPromptSourceValue,
          datetime('now'), datetime('now')
        )
        ON CONFLICT(project_id, scanning_mode)
        DO UPDATE SET
          provider = excluded.provider,
          model = excluded.model,
          parallel_limit = excluded.parallel_limit,
          api_key_source_type = excluded.api_key_source_type,
          api_key_source_value = excluded.api_key_source_value,
          system_prompt_source_type = excluded.system_prompt_source_type,
          system_prompt_source_value = excluded.system_prompt_source_value,
          updated_at = datetime('now')
      `
      )
      .run({
        projectId,
        scanningMode: agent.mode,
        provider: agent.provider,
        model: agent.model,
        parallelLimit: agent.parallelLimit,
        apiKeySourceType: agent.apiKeySource.type,
        apiKeySourceValue: agent.apiKeySource.value ?? "",
        systemPromptSourceType: agent.systemPromptSource.type,
        systemPromptSourceValue: agent.systemPromptSource.value ?? ""
      });
  }

  private listReusesForScope(projectId: string, scopeNodeId: string): GraphNodeReuse[] {
    const rows = this.db
      .prepare("SELECT * FROM graph_node_reuses WHERE project_id = ? AND scope_node_id = ? ORDER BY label ASC, node_id ASC")
      .all(projectId, scopeNodeId) as NodeReuseRow[];
    return rows.map(mapNodeReuse);
  }

  private listReusesForNode(projectId: string, nodeId: string): GraphNodeReuse[] {
    const rows = this.db
      .prepare("SELECT * FROM graph_node_reuses WHERE project_id = ? AND node_id = ? ORDER BY scope_node_id ASC")
      .all(projectId, nodeId) as NodeReuseRow[];
    return rows.map(mapNodeReuse);
  }

  private upsertTags(projectId: string, inputTags: TagMutation[]): GraphTag[] {
    this.getProject(projectId);
    const normalizedInputs = new Map<string, TagMutation>();
    for (const input of inputTags) {
      const name = input.name.trim();
      if (!name) {
        continue;
      }
      normalizedInputs.set(normalizeTagName(name), { name, color: input.color });
    }

    const tags: GraphTag[] = [];
    for (const [normalizedName, input] of normalizedInputs) {
      const id = `tag-${hashId(`${projectId}:${normalizedName}`)}`;
      this.db
        .prepare(
          `
          INSERT INTO graph_tags (id, project_id, name, normalized_name, color, created_at, updated_at)
          VALUES (@id, @projectId, @name, @normalizedName, @color, datetime('now'), datetime('now'))
          ON CONFLICT(project_id, normalized_name)
          DO UPDATE SET
            name = excluded.name,
            color = CASE WHEN @inputColor IS NULL THEN graph_tags.color ELSE excluded.color END,
            updated_at = datetime('now')
        `
        )
        .run({
          id,
          projectId,
          name: input.name,
          normalizedName,
          color: input.color ?? defaultTagColor(normalizedName),
          inputColor: input.color ?? null
        });
      const row = this.db
        .prepare("SELECT * FROM graph_tags WHERE project_id = ? AND normalized_name = ?")
        .get(projectId, normalizedName) as TagRow;
      tags.push(mapTag(row));
    }
    return tags;
  }

  private replaceTagLinks(kind: TagLinkKind, entityId: string, tagIds: string[]): void {
    const metadata = TAG_LINK_METADATA[kind];
    const save = this.db.transaction(() => {
      this.db.prepare(`DELETE FROM ${metadata.tableName} WHERE ${metadata.entityColumn} = ?`).run(entityId);
      const insert = this.db.prepare(`INSERT INTO ${metadata.tableName} (${metadata.entityColumn}, tag_id) VALUES (?, ?)`);
      for (const tagId of tagIds) {
        insert.run(entityId, tagId);
      }
    });
    save();
  }

  private getTagsForEntity(kind: TagLinkKind, entityId: string): GraphTag[] {
    return this.getTagsForEntityIds(kind, [entityId]).get(entityId) ?? [];
  }

  private getTagsForEntityIds(kind: TagLinkKind, entityIds: string[]): Map<string, GraphTag[]> {
    const uniqueEntityIds = [...new Set(entityIds)].filter(Boolean);
    if (uniqueEntityIds.length === 0) {
      return new Map();
    }

    const metadata = TAG_LINK_METADATA[kind];
    const placeholders = uniqueEntityIds.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `
        SELECT
          link.${metadata.entityColumn} AS entity_id,
          tag.id,
          tag.project_id,
          tag.name,
          tag.normalized_name,
          tag.color,
          tag.created_at,
          tag.updated_at
        FROM ${metadata.tableName} AS link
        JOIN graph_tags AS tag ON tag.id = link.tag_id
        WHERE link.${metadata.entityColumn} IN (${placeholders})
        ORDER BY tag.name COLLATE NOCASE ASC
      `
      )
      .all(...uniqueEntityIds) as Array<TagRow & { entity_id: string }>;

    const tagsByEntityId = new Map<string, GraphTag[]>();
    for (const row of rows) {
      const tags = tagsByEntityId.get(row.entity_id) ?? [];
      tags.push(mapTag(row));
      tagsByEntityId.set(row.entity_id, tags);
    }
    return tagsByEntityId;
  }

  private mapBoundary(row: BoundaryRow): GraphBoundary {
    const memberNodeIds = this.db
      .prepare("SELECT node_id FROM graph_boundary_nodes WHERE boundary_id = ? ORDER BY node_id ASC")
      .all(row.id)
      .map((member) => (member as { node_id: string }).node_id);
    return {
      id: row.id,
      projectId: row.project_id,
      scopeNodeId: row.scope_node_id,
      name: row.name,
      summary: row.summary,
      codeContext: row.code_context,
      color: row.color ?? defaultBoundaryColor(row.id),
      position: { x: row.ui_x, y: row.ui_y },
      size: { width: row.ui_width, height: row.ui_height },
      memberNodeIds,
      memberCount: memberNodeIds.length,
      tags: this.getTagsForEntity("boundary", row.id),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private recomputeBoundaryMembershipsForScope(projectId: string, scopeNodeId: string): void {
    const rows = this.db
      .prepare("SELECT id FROM graph_boundaries WHERE project_id = ? AND scope_node_id = ?")
      .all(projectId, scopeNodeId) as Array<{ id: string }>;
    for (const row of rows) {
      this.recomputeBoundaryMembership(row.id);
    }
  }

  private recomputeBoundaryMembership(boundaryId: string): void {
    const row = this.db.prepare("SELECT * FROM graph_boundaries WHERE id = ?").get(boundaryId) as BoundaryRow | undefined;
    if (!row) {
      throw notFound(`Boundary not found: ${boundaryId}`);
    }

    const project = this.getProject(row.project_id);
    const allNodes = this.listNodes(project.id);
    const scopeNode = this.resolveScopeNode(project, allNodes, row.scope_node_id);
    if (!scopeNode) {
      return;
    }

    const canvas = this.buildCanvasGraph(project, allNodes, scopeNode.id, true, true);
    const memberNodeIds = canvas.nodes.filter((node) => nodeCenterInsideBoundary(node, row)).map((node) => node.id);
    const saveMembership = this.db.transaction(() => {
      this.db.prepare("DELETE FROM graph_boundary_nodes WHERE boundary_id = ?").run(boundaryId);
      const insert = this.db.prepare("INSERT INTO graph_boundary_nodes (boundary_id, node_id) VALUES (?, ?)");
      for (const nodeId of memberNodeIds) {
        insert.run(boundaryId, nodeId);
      }
    });
    saveMembership();
  }

  private applyScopeLayouts(projectId: string, scopeNodeId: string, nodes: GraphNode[]): GraphNode[] {
    if (nodes.length === 0) {
      return nodes;
    }

    const layouts = this.getSavedLayouts(projectId, scopeNodeId, nodes.map((node) => node.id));
    return nodes.map((node) => {
      const layout = layouts.get(node.id);
      if (!layout) {
        return node;
      }

      return {
        ...node,
        position: { x: layout.ui_x, y: layout.ui_y },
        size: { width: layout.ui_width, height: layout.ui_height }
      };
    });
  }

  private getSavedLayouts(projectId: string, scopeNodeId: string, nodeIds: string[]): Map<string, LayoutRow> {
    if (nodeIds.length === 0) {
      return new Map();
    }

    const placeholders = nodeIds.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `
        SELECT node_id, ui_x, ui_y, ui_width, ui_height
        FROM graph_node_layouts
        WHERE project_id = ?
          AND scope_node_id = ?
          AND node_id IN (${placeholders})
      `
      )
      .all(projectId, scopeNodeId, ...nodeIds) as LayoutRow[];
    return new Map(rows.map((row) => [row.node_id, row]));
  }

  private countSavedLayouts(projectId: string, scopeNodeId: string, nodeIds: string[]): number {
    if (nodeIds.length === 0) {
      return 0;
    }

    const placeholders = nodeIds.map(() => "?").join(", ");
    const row = this.db
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM graph_node_layouts
        WHERE project_id = ?
          AND scope_node_id = ?
          AND node_id IN (${placeholders})
      `
      )
      .get(projectId, scopeNodeId, ...nodeIds) as { count: number } | undefined;
    return row?.count ?? 0;
  }

  private upsertNodeLayout(nodeId: string, patch: LayoutPatch): void {
    const node = this.getNode(nodeId);
    const scopeNode = this.getNode(patch.scopeNodeId);
    if (node.projectId !== scopeNode.projectId) {
      throw validationError("Layout scope and node must belong to the same project.");
    }

    this.db
      .prepare(
        `
        INSERT INTO graph_node_layouts (project_id, scope_node_id, node_id, ui_x, ui_y, ui_width, ui_height, updated_at)
        VALUES (@projectId, @scopeNodeId, @nodeId, @uiX, @uiY, @uiWidth, @uiHeight, datetime('now'))
        ON CONFLICT(project_id, scope_node_id, node_id)
        DO UPDATE SET
          ui_x = excluded.ui_x,
          ui_y = excluded.ui_y,
          ui_width = excluded.ui_width,
          ui_height = excluded.ui_height,
          updated_at = datetime('now')
      `
      )
      .run({
        projectId: node.projectId,
        scopeNodeId: patch.scopeNodeId,
        nodeId,
        uiX: patch.position.x,
        uiY: patch.position.y,
        uiWidth: patch.size.width,
        uiHeight: patch.size.height
      });
  }

  private updateBoundaryLayoutOnly(boundaryId: string, layout: { position: { x: number; y: number }; size: { width: number; height: number } }): void {
    this.db
      .prepare(
        `
        UPDATE graph_boundaries
        SET
          ui_x = @uiX,
          ui_y = @uiY,
          ui_width = @uiWidth,
          ui_height = @uiHeight,
          updated_at = datetime('now')
        WHERE id = @boundaryId
      `
      )
      .run({
        boundaryId,
        uiX: layout.position.x,
        uiY: layout.position.y,
        uiWidth: layout.size.width,
        uiHeight: layout.size.height
      });
  }

  private getDependencyDetail(nodeId: string): DependencyDetails {
    const row = this.db.prepare("SELECT * FROM dependency_details WHERE node_id = ?").get(nodeId) as DependencyRow | undefined;
    if (!row) {
      throw notFound(`Dependency details not found: ${nodeId}`);
    }
    return mapDependencyDetails(row);
  }

  private getIoDetail(nodeId: string): IoDetails {
    const row = this.db.prepare("SELECT * FROM io_details WHERE node_id = ?").get(nodeId) as IoRow | undefined;
    if (!row) {
      throw notFound(`I/O details not found: ${nodeId}`);
    }
    return mapIoDetails(row);
  }

  private getProcessDetail(nodeId: string): ProcessDetails {
    const row = this.db.prepare("SELECT * FROM process_details WHERE node_id = ?").get(nodeId) as ProcessRow | undefined;
    if (!row) {
      throw notFound(`Process details not found: ${nodeId}`);
    }
    return mapProcessDetails(row);
  }

  private getFormatDetail(nodeId: string): FormatDetails {
    const row = this.db.prepare("SELECT * FROM format_details WHERE node_id = ?").get(nodeId) as FormatRow | undefined;
    if (!row) {
      throw notFound(`Format details not found: ${nodeId}`);
    }
    return mapFormatDetails(row);
  }

  private getBasicBlockDetail(nodeId: string): BasicBlockDetails {
    const row = this.db.prepare("SELECT * FROM basic_block_details WHERE node_id = ?").get(nodeId) as BasicBlockRow | undefined;
    if (!row) {
      throw notFound(`Basic block details not found: ${nodeId}`);
    }
    return mapBasicBlockDetails(row);
  }

  private getDependencyDetailsForNodes(nodeIds: string[]): DependencyDetails[] {
    if (nodeIds.length === 0) {
      return [];
    }

    const placeholders = nodeIds.map(() => "?").join(", ");
    const rows = this.db.prepare(`SELECT * FROM dependency_details WHERE node_id IN (${placeholders}) ORDER BY dependency_kind ASC, spec ASC`).all(...nodeIds) as DependencyRow[];
    return rows.map(mapDependencyDetails);
  }

  private getIoDetailsForNodes(nodeIds: string[]): IoDetails[] {
    if (nodeIds.length === 0) {
      return [];
    }

    const placeholders = nodeIds.map(() => "?").join(", ");
    const rows = this.db.prepare(`SELECT * FROM io_details WHERE node_id IN (${placeholders}) ORDER BY io_kind ASC, channel ASC`).all(...nodeIds) as IoRow[];
    return rows.map(mapIoDetails);
  }

  private getProcessDetailsForNodes(nodeIds: string[]): ProcessDetails[] {
    if (nodeIds.length === 0) {
      return [];
    }

    const placeholders = nodeIds.map(() => "?").join(", ");
    const rows = this.db.prepare(`SELECT * FROM process_details WHERE node_id IN (${placeholders}) ORDER BY process_kind ASC, node_id ASC`).all(...nodeIds) as ProcessRow[];
    return rows.map(mapProcessDetails);
  }

  private getFormatDetailsForNodes(nodeIds: string[]): FormatDetails[] {
    if (nodeIds.length === 0) {
      return [];
    }

    const placeholders = nodeIds.map(() => "?").join(", ");
    const rows = this.db.prepare(`SELECT * FROM format_details WHERE node_id IN (${placeholders}) ORDER BY format_kind ASC, spec ASC`).all(...nodeIds) as FormatRow[];
    return rows.map(mapFormatDetails);
  }

  private getBasicBlockDetailsForNodes(nodeIds: string[]): BasicBlockDetails[] {
    if (nodeIds.length === 0) {
      return [];
    }

    const placeholders = nodeIds.map(() => "?").join(", ");
    const rows = this.db
      .prepare(`SELECT * FROM basic_block_details WHERE node_id IN (${placeholders}) ORDER BY basic_kind ASC, key ASC`)
      .all(...nodeIds) as BasicBlockRow[];
    return rows.map(mapBasicBlockDetails);
  }

  private getChildCount(nodeId: string): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM graph_nodes WHERE parent_id = ?").get(nodeId) as { count: number } | undefined;
    return row?.count ?? 0;
  }

  private assertValidNode(input: NewGraphNode, updatingNodeId?: string): void {
    if (!DOMAIN_NODE_KINDS.includes(input.kind as never) && !isAttachmentNodeKind(input.kind)) {
      throw validationError(`Unsupported node kind: ${input.kind}`);
    }

    if (input.language && !LANGUAGE_TYPES.includes(input.language)) {
      throw validationError(`Unsupported language type: ${input.language}`);
    }

    this.getProject(input.projectId);

    const parentId = input.parentId ?? null;
    const attachedToId = input.attachedToId ?? null;
    const nodeId = updatingNodeId ?? input.id;

    if ((parentId && parentId === nodeId) || (attachedToId && attachedToId === nodeId)) {
      throw validationError("A node cannot contain or attach to itself.");
    }

    this.assertNoParentCycle(parentId, input.projectId, nodeId);
    this.assertNoAttachmentCycle(attachedToId, input.projectId, nodeId);

    if (input.kind === "custom" && input.customTypeId) {
      const customType = this.db.prepare("SELECT * FROM custom_block_types WHERE id = ?").get(input.customTypeId) as CustomBlockTypeRow | undefined;
      if (!customType || customType.project_id !== input.projectId) {
        throw validationError("Custom node type must belong to the same project.");
      }
    }

    if (input.kind === "framework") {
      if (parentId || attachedToId) {
        throw validationError("Framework nodes cannot have parent_id or attached_to_id.");
      }
      return;
    }

    if (input.kind === "module") {
      if (!parentId || attachedToId) {
        throw validationError("Module nodes must have a framework/module parent and no attached_to_id.");
      }
      const parent = this.getNode(parentId);
      if (parent.projectId !== input.projectId || (parent.kind !== "framework" && parent.kind !== "module")) {
        throw validationError("Module parent must be a framework or module in the same project.");
      }
      return;
    }

    if (input.kind === "website") {
      if (!parentId || attachedToId) {
        throw validationError("Website nodes must have a framework/module parent and no attached_to_id.");
      }
      const parent = this.getNode(parentId);
      if (parent.projectId !== input.projectId || (parent.kind !== "framework" && parent.kind !== "module")) {
        throw validationError("Website parent must be a framework or module in the same project.");
      }
      return;
    }

    if (input.kind === "ui_component") {
      if (!parentId || attachedToId) {
        throw validationError("UI component nodes must have a website/module/component parent and no attached_to_id.");
      }
      const parent = this.getNode(parentId);
      if (parent.projectId !== input.projectId || (parent.kind !== "website" && parent.kind !== "module" && parent.kind !== "ui_component")) {
        throw validationError("UI component parent must be a website, module, or UI component in the same project.");
      }
      return;
    }

    if (input.kind === "function" || input.kind === "object") {
      if (!parentId || attachedToId) {
        throw validationError("Function and object nodes must have a module or function parent and no attached_to_id.");
      }
      const parent = this.getNode(parentId);
      if (parent.projectId !== input.projectId || (parent.kind !== "module" && parent.kind !== "function")) {
        throw validationError("Function and object nodes must be contained by a module or function.");
      }
      return;
    }

    if (!attachedToId || parentId) {
      throw validationError("Basic canvas nodes must use attached_to_id and no parent_id.");
    }

    const owner = this.getNode(attachedToId);
    if (owner.projectId !== input.projectId) {
      throw validationError("Attachment nodes must attach to a node in the same project.");
    }

    if (input.kind === "input" || input.kind === "output" || input.kind === "process") {
      if (!isDomainNodeKind(owner.kind)) {
        throw validationError("Input, output, and process nodes must attach to a domain node.");
      }
      return;
    }

    if (input.kind === "dependency") {
      if (!isDomainNodeKind(owner.kind) && owner.kind !== "process") {
        throw validationError("Dependency nodes must attach to a domain or process node.");
      }
      return;
    }

    if (owner.kind === "format") {
      throw validationError("Format nodes cannot attach to another format node.");
    }
  }

  private assertNoParentCycle(parentId: string | null, projectId: string, nodeId: string): void {
    const seen = new Set<string>();
    let currentId = parentId;
    while (currentId) {
      if (currentId === nodeId || seen.has(currentId)) {
        throw validationError("Node containment cannot create a cycle.");
      }
      seen.add(currentId);
      const row = this.db.prepare("SELECT project_id, parent_id FROM graph_nodes WHERE id = ?").get(currentId) as
        | { project_id: string; parent_id: string | null }
        | undefined;
      if (!row || row.project_id !== projectId) {
        return;
      }
      currentId = row.parent_id;
    }
  }

  private assertNoAttachmentCycle(attachedToId: string | null, projectId: string, nodeId: string): void {
    const seen = new Set<string>();
    let currentId = attachedToId;
    while (currentId) {
      if (currentId === nodeId || seen.has(currentId)) {
        throw validationError("Node attachments cannot create a cycle.");
      }
      seen.add(currentId);
      const row = this.db.prepare("SELECT project_id, attached_to_id FROM graph_nodes WHERE id = ?").get(currentId) as
        | { project_id: string; attached_to_id: string | null }
        | undefined;
      if (!row || row.project_id !== projectId) {
        return;
      }
      currentId = row.attached_to_id;
    }
  }

  private assertValidBoundary(input: NewGraphBoundary): void {
    this.getProject(input.projectId);
    const scopeNode = this.getNode(input.scopeNodeId);
    if (scopeNode.projectId !== input.projectId) {
      throw validationError("Boundary scope must belong to the same project.");
    }
    if (!isDomainNodeKind(scopeNode.kind)) {
      throw validationError("Boundary scope must be a domain node.");
    }
    if (!input.name.trim()) {
      throw validationError("Boundary name is required.");
    }
    if (input.size.width <= 0 || input.size.height <= 0) {
      throw validationError("Boundary size must be positive.");
    }
  }
}

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    rootPath: row.root_path,
    description: row.description ?? "",
    scanningInstructions: row.scanning_instructions ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapScanFileState(row: ScanFileStateRow): ScanFileState {
  return {
    projectId: row.project_id,
    filePath: row.file_path,
    contentHash: row.content_hash,
    lastRunId: row.last_run_id,
    lastScannedAt: row.last_scanned_at
  };
}

function uniqueScanNodes(nodes: ScanNodeDraft[]): ScanNodeDraft[] {
  return [...new Map(nodes.map((node) => [node.stableKey, node])).values()];
}

function uniqueScanEdges(edges: ScanEdgeDraft[]): ScanEdgeDraft[] {
  return [...new Map(edges.map((edge) => [edge.stableKey, edge])).values()];
}

function parseScopes(value: string): string[] {
  return value
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function defaultAgentConfig(agentKind: AgentKind): AgentConfig {
  return {
    agentKind,
    provider: "fake",
    model: agentKind === "scanning" ? "graphcode-scanner-v1" : "graphcode-fake-v1",
    parallelLimit: agentKind === "scanning" ? 8 : 4,
    apiKeySource: {
      type: "env",
      value: defaultApiKeyEnv(agentKind)
    },
    systemPromptSource: {
      type: "manual",
      value: defaultSystemPrompt(agentKind)
    }
  };
}

function defaultCodingAgentConfig(mode: CodingAgentMode): CodingAgentConfig {
  return {
    mode,
    provider: "fake",
    model: "graphcode-fake-v1",
    parallelLimit: mode === "large" ? 8 : mode === "medium" ? 4 : 2,
    apiKeySource: {
      type: "env",
      value: "OPENAI_API_KEY"
    },
    systemPromptSource: {
      type: "manual",
      value: defaultCodingSystemPrompt(mode)
    }
  };
}

function defaultScanningAgentConfig(mode: ScanningAgentMode): ScanningAgentConfig {
  return {
    mode,
    provider: "fake",
    model: `graphcode-scanner-${mode}-v1`,
    parallelLimit: mode === "local" ? 8 : mode === "medium" ? 4 : 1,
    apiKeySource: {
      type: "env",
      value: "OPENAI_API_KEY"
    },
    systemPromptSource: {
      type: "manual",
      value: defaultScanningSystemPrompt(mode)
    }
  };
}

function defaultApiKeyEnv(agentKind: AgentKind): string {
  switch (agentKind) {
    case "planning":
      return "OPENAI_API_KEY";
    case "coding":
      return "OPENAI_API_KEY";
    case "review":
      return "OPENAI_API_KEY";
    case "scanning":
      return "OPENAI_API_KEY";
    default:
      return "";
  }
}

const DEFAULT_SCANNING_SYSTEM_PROMPTS = {
  local: `You are the GraphCode Scanning Local agent.

Analyze exactly one source file and translate the bottom layer into GraphCode scan JSON. Create source-linked nodes for the file, functions, classes, objects, nested symbols, and local workflow blocks. Workflow blocks should include inputs, processes, outputs, and formats for the concrete code in this file.

Use only evidence from the numbered file content. Every node and edge that comes from code must carry source.path, source.startLine, and source.endLine using 1-based inclusive line numbers. Do not invent files, imports, calls, symbols, or line ranges. Stable keys should be based on source facts such as path, symbol name, start line, and relationship kind; the runtime will normalize final IDs.

Return strict JSON only. Do not include markdown, commentary, or prose outside the JSON object.`,
  medium: `You are the GraphCode Scanning Medium agent.

Consolidate local scan outputs for one directory or package into GraphCode scan JSON. Identify directory/module grouping, exported surfaces, important file roles, package boundaries, and intra-directory dependency candidates. Prefer compact summaries that preserve the source-linked stable keys emitted by local scans.

Use local outputs and repository inventory as evidence. Keep relationships scoped to the requested directory unless the provided local evidence proves an outward dependency candidate. Attach source evidence to edges when a specific file range proves the relationship; otherwise leave source lines null rather than guessing.

Return strict JSON only. Do not include markdown, commentary, or prose outside the JSON object.`,
  global: `You are the GraphCode Scanning Global agent.

Construct the whole-system GraphCode scan JSON from repository inventory, medium summaries, and changed local outputs. Create repository and subsystem modules, wire cross-directory functions/modules/files, summarize architectural boundaries, and emit high-level calls, imports, uses, owns, impacts, flows, and format relationships when evidence supports them.

Use compact unchanged graph summaries and changed artifacts to update only the affected higher-level wiring. Preserve manual or curated graph intent by emitting generated scan structure only. For every edge with code evidence, include source.path, source.startLine, and source.endLine; if exact evidence is unavailable, keep the edge summary conservative and leave the source range null.

Return strict JSON only. Do not include markdown, commentary, or prose outside the JSON object.`
} satisfies Record<ScanningAgentMode, string>;

const DEFAULT_CODING_SYSTEM_PROMPTS = {
  small: `You are the GraphCode Coding Small agent.

Produce the smallest safe unified diff for the selected low-level graph block. Use the selected node, direct workflow attachments, direct edges, source path, source range, and current git status. Stay inside the selected block's source range unless the prompt explicitly grants a broader file scope.

Prefer local fixes, small tests, and clear behavior over refactors. Do not edit generated .graphcode state or unrelated files. If the requested change cannot fit in the selected range, explain the blocker in the proposal rather than widening the edit silently.

Return a clean unified diff plus any required test artifact manifest. Do not include unrelated commentary.`,
  medium: `You are the GraphCode Coding Medium agent.

Produce a scoped unified diff using the selected block plus its containing function, object, or file workflow. Use input/process/output/format blocks, branch-labeled flow edges, related callers/importers, source path, source ranges, execution metadata, and git status to make the change.

Keep edits inside the selected organization scope. You may touch directly related tests or fixtures when behavior changes, but avoid broad rewrites and unrelated formatting churn. Preserve public DTO, route, graph schema, and UI contracts unless the prompt explicitly asks to change them.

Return a clean unified diff plus any required test artifact manifest. Do not include unrelated commentary.`,
  large: `You are the GraphCode Coding Large agent.

Produce a coordinated unified diff for a larger graph-scoped change. Use descendant graph context, one-hop related edges, module boundaries, workflow blocks, source ranges, execution metadata, and git status to reason across files while preserving the requested edit boundary.

Large mode gives more context, not unlimited scope. Touch only files required by the selected graph scope and user request. Keep generated graph/database artifacts out of source diffs unless the task explicitly asks for generated-state refresh. Update tests and docs when the behavioral surface changes.

Return a clean unified diff plus any required test artifact manifest. Do not include unrelated commentary.`
} satisfies Record<CodingAgentMode, string>;

const DEFAULT_ROLE_SYSTEM_PROMPTS = {
  planning: `You are the GraphCode Planning agent.

Convert user intent into small, reviewable graph and implementation plans. Use framework blocks for ownership and module boundaries, and workflow blocks for inputs, processes, outputs, formats, branch flow, and source-linked behavior.

Name the smallest source-linked blocks involved, the relevant callers/importers, affected line ranges when known, likely tests, and any graph patch operations needed. Prefer scoped plans over broad rewrites. Preserve explicit workspace-opening behavior and reproducible .graphcode state.`,
  coding: DEFAULT_CODING_SYSTEM_PROMPTS.medium,
  review: `You are the GraphCode Review agent.

Review proposed diffs for correctness, scope, graph consistency, source evidence, and missing verification. Start with concrete findings ordered by severity. Check that the diff stays inside the selected graph scope, preserves API/DTO/database/UI contracts, and updates tests when behavior changes.

For scanner or graph-schema changes, verify stable IDs, source ranges, scan state, generated-row cleanup, branch workflow blocks, and canvas/detail payloads. Mark a block reviewed only when the change is scoped, behaviorally sound, and adequately verified or has an explicit test-gap note.`,
  scanning: `You are the GraphCode Scanning coordinator.

Coordinate local, medium, and global scanner modes into a generated, source-linked GraphCode graph. Inventory scannable files, run local file analysis in parallel, consolidate affected directories, run one global synthesis pass, and merge generated rows while preserving manual graph data.

Use content hashes for incremental scans. Re-analyze only added or modified files locally, delete generated rows for deleted files, refresh affected medium scopes, and update global wiring from compact unchanged summaries plus changed artifacts. Require exact source evidence for code-backed nodes and edges.`
} satisfies Record<AgentKind, string>;

function defaultCodingSystemPrompt(mode: CodingAgentMode): string {
  return DEFAULT_CODING_SYSTEM_PROMPTS[mode] ?? "";
}

function defaultScanningSystemPrompt(mode: ScanningAgentMode): string {
  return DEFAULT_SCANNING_SYSTEM_PROMPTS[mode] ?? "";
}

function defaultSystemPrompt(agentKind: AgentKind): string {
  return DEFAULT_ROLE_SYSTEM_PROMPTS[agentKind] ?? "";
}

function mapAgentSettingsView(row: AgentSettingsRow): AgentConfigView {
  const apiValue = row.api_key_source_value ?? "";
  const promptValue = row.system_prompt_source_value ?? "";
  return {
    agentKind: row.agent_kind,
    provider: row.provider,
    model: row.model,
    parallelLimit: row.parallel_limit,
    apiKeySource: {
      type: row.api_key_source_type,
      value: ""
    },
    systemPromptSource: {
      type: row.system_prompt_source_type,
      value: row.system_prompt_source_type === "manual" ? promptValue : ""
    },
    apiKeyConfigured: apiValue.trim().length > 0,
    systemPromptConfigured: promptValue.trim().length > 0
  };
}

function mapAgentSettings(row: AgentSettingsRow): AgentConfig {
  return {
    agentKind: row.agent_kind,
    provider: row.provider,
    model: row.model,
    parallelLimit: row.parallel_limit,
    apiKeySource: {
      type: row.api_key_source_type,
      value: row.api_key_source_value
    },
    systemPromptSource: {
      type: row.system_prompt_source_type,
      value: row.system_prompt_source_value
    }
  };
}

function mapCodingAgentSettingsView(row: CodingAgentSettingsRow): CodingAgentConfigView {
  const apiValue = row.api_key_source_value ?? "";
  const promptValue = row.system_prompt_source_value ?? "";
  return {
    mode: row.coding_mode,
    provider: row.provider,
    model: row.model,
    parallelLimit: row.parallel_limit,
    apiKeySource: {
      type: row.api_key_source_type,
      value: ""
    },
    systemPromptSource: {
      type: row.system_prompt_source_type,
      value: row.system_prompt_source_type === "manual" ? promptValue : ""
    },
    apiKeyConfigured: apiValue.trim().length > 0,
    systemPromptConfigured: promptValue.trim().length > 0
  };
}

function mapScanningAgentSettingsView(row: ScanningAgentSettingsRow): ScanningAgentConfigView {
  const apiValue = row.api_key_source_value ?? "";
  const promptValue = row.system_prompt_source_value ?? "";
  return {
    mode: row.scanning_mode,
    provider: row.provider,
    model: row.model,
    parallelLimit: row.parallel_limit,
    apiKeySource: {
      type: row.api_key_source_type,
      value: ""
    },
    systemPromptSource: {
      type: row.system_prompt_source_type,
      value: row.system_prompt_source_type === "manual" ? promptValue : ""
    },
    apiKeyConfigured: apiValue.trim().length > 0,
    systemPromptConfigured: promptValue.trim().length > 0
  };
}

function mapCodingAgentSettings(row: CodingAgentSettingsRow): CodingAgentConfig {
  return {
    mode: row.coding_mode,
    provider: row.provider,
    model: row.model,
    parallelLimit: row.parallel_limit,
    apiKeySource: {
      type: row.api_key_source_type,
      value: row.api_key_source_value
    },
    systemPromptSource: {
      type: row.system_prompt_source_type,
      value: row.system_prompt_source_value
    }
  };
}

function mapScanningAgentSettings(row: ScanningAgentSettingsRow): ScanningAgentConfig {
  return {
    mode: row.scanning_mode,
    provider: row.provider,
    model: row.model,
    parallelLimit: row.parallel_limit,
    apiKeySource: {
      type: row.api_key_source_type,
      value: row.api_key_source_value
    },
    systemPromptSource: {
      type: row.system_prompt_source_type,
      value: row.system_prompt_source_value
    }
  };
}

function mapAgentRun(row: AgentRunRow): AgentRun {
  return {
    id: row.id,
    projectId: row.project_id,
    agentKind: row.agent_kind,
    codingMode: row.agent_kind === "coding" ? (row.coding_mode ?? "medium") : null,
    status: row.status,
    baseGraphRevision: row.base_graph_revision ?? 0,
    appliedGraphRevision: row.applied_graph_revision ?? null,
    conflictReason: row.conflict_reason ?? null,
    targetNodeId: row.target_node_id,
    prompt: row.prompt,
    response: row.response,
    diff: row.diff,
    graphPatch: parseGraphPatch(row.graph_patch_json),
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseGraphPatch(value: string | null): GraphPatch | null {
  if (!value) {
    return null;
  }
  try {
    return graphPatchSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}

function parseCodeProposalArtifactManifest(value: string | null): CodeProposalArtifactManifest | null {
  if (!value) {
    return null;
  }
  try {
    return codeProposalArtifactManifestSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}

function mapCodeProposal(row: CodeProposalRow): StoredCodeProposal {
  return {
    id: row.id,
    projectId: row.project_id,
    agentRunId: row.agent_run_id,
    targetNodeId: row.target_node_id,
    diff: row.diff,
    artifactManifest: parseCodeProposalArtifactManifest(row.artifact_manifest_json),
    createdAt: row.created_at
  };
}

function mapCodingWorkflow(row: CodingWorkflowRow, items: CodingWorkflowItem[], scope: GraphNode): CodingWorkflow {
  return {
    id: row.id,
    projectId: row.project_id,
    scopeNodeId: row.scope_node_id,
    scopeName: scope.name,
    status: row.status,
    currentLayer: row.current_layer,
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items
  };
}

function mapCodingWorkflowItem(row: CodingWorkflowItemRow): CodingWorkflowItem {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    projectId: row.project_id,
    nodeId: row.node_id,
    nodeName: row.node_name,
    nodeKind: row.node_kind,
    layerIndex: row.layer_index,
    recommendedMode: row.recommended_mode,
    selectedMode: row.selected_mode,
    modeReason: row.mode_reason,
    status: row.status,
    conflictGroup: row.conflict_group,
    agentRunId: row.agent_run_id,
    proposalId: row.proposal_id,
    appliedAt: row.applied_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAgentMessage(row: AgentMessageRow): AgentMessage {
  return {
    id: row.id,
    runId: row.run_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at
  };
}

function mapGraphStatusHistory(row: GraphStatusHistoryRow): GraphStatusHistory {
  return {
    id: row.id,
    projectId: row.project_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    status: row.status,
    note: row.note,
    agentRunId: row.agent_run_id,
    createdAt: row.created_at
  };
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function sameExecutionMetadata(left: BlockExecutionMetadata, right: BlockExecutionMetadata): boolean {
  return (
    blankToNull(left.testScriptDirectory) === blankToNull(right.testScriptDirectory) &&
    blankToNull(left.virtualEnvironment) === blankToNull(right.virtualEnvironment) &&
    blankToNull(left.workingDirectory) === blankToNull(right.workingDirectory) &&
    blankToNull(left.setupCommand) === blankToNull(right.setupCommand) &&
    blankToNull(left.testCommand) === blankToNull(right.testCommand)
  );
}

function mapCustomBlockType(row: CustomBlockTypeRow): CustomBlockType {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description,
    color: row.color,
    icon: row.icon,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapNodeTypeStyle(row: NodeTypeStyleRow): NodeTypeStyle {
  return {
    projectId: row.project_id,
    nodeKind: row.node_kind,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapTag(row: TagRow): GraphTag {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapNodeReuse(row: NodeReuseRow): GraphNodeReuse {
  return {
    id: row.id,
    projectId: row.project_id,
    scopeNodeId: row.scope_node_id,
    nodeId: row.node_id,
    label: row.label,
    context: row.context,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapNode(row: NodeRow, childCount: number, tags: GraphTag[] = []): GraphNode {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind,
    name: row.name,
    summary: row.summary,
    code: {
      context: row.code_context,
      directory: row.code_directory ?? row.source_path,
      startLine: row.code_start_line ?? row.source_start_line,
      endLine: row.code_end_line ?? row.source_end_line,
      language: row.language ?? "unknown"
    },
    parentId: row.parent_id,
    attachedToId: row.attached_to_id,
    customTypeId: row.custom_type_id,
	    source: {
	      path: row.source_path ?? row.code_directory,
	      startLine: row.source_start_line ?? row.code_start_line,
	      endLine: row.source_end_line ?? row.code_end_line
	    },
	    execution: {
	      testScriptDirectory: blankToNull(row.test_script_directory),
	      virtualEnvironment: blankToNull(row.virtual_environment),
	      workingDirectory: blankToNull(row.working_directory),
	      setupCommand: blankToNull(row.setup_command),
	      testCommand: blankToNull(row.test_command)
	    },
	    position: {
      x: row.ui_x,
      y: row.ui_y
    },
    size: {
      width: row.ui_width,
      height: row.ui_height
    },
    childCount,
    hasChildren: childCount > 0,
    agentStatus: row.agent_status ?? "none",
    gitStatus: null,
    tags,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapEdge(row: EdgeRow, tags: GraphTag[] = []): GraphEdge {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind,
    sourceNodeId: row.source_node_id,
    targetNodeId: row.target_node_id,
    label: row.label,
    codeContext: row.code_context ?? "",
    source: {
      path: row.source_path ?? null,
      startLine: row.source_start_line ?? null,
      endLine: row.source_end_line ?? null
    },
    color: row.color ?? defaultEdgeColor(row.kind),
    animated: row.animated === 1,
    pointingEnabled: row.pointing_enabled !== 0,
    pointingDirection: row.pointing_direction ?? "source_to_target",
    agentStatus: row.agent_status ?? "none",
    gitStatus: null,
    tags,
    createdAt: row.created_at
  };
}

function mapDependencyDetails(row: DependencyRow): DependencyDetails {
  return {
    nodeId: row.node_id,
    dependencyKind: row.dependency_kind,
    spec: row.spec,
    version: row.version,
    required: row.required === 1,
    notes: row.notes
  };
}

function mapIoDetails(row: IoRow): IoDetails {
  return {
    nodeId: row.node_id,
    ioKind: row.io_kind,
    channel: row.channel,
    schemaHint: row.schema_hint,
    notes: row.notes
  };
}

function mapProcessDetails(row: ProcessRow): ProcessDetails {
  return {
    nodeId: row.node_id,
    processKind: row.process_kind,
    trigger: row.trigger,
    notes: row.notes
  };
}

function mapFormatDetails(row: FormatRow): FormatDetails {
  return {
    nodeId: row.node_id,
    formatKind: row.format_kind,
    spec: row.spec,
    example: row.example,
    notes: row.notes
  };
}

function mapBasicBlockDetails(row: BasicBlockRow): BasicBlockDetails {
  return {
    nodeId: row.node_id,
    basicKind: row.basic_kind,
    key: row.key,
    valueHint: row.value_hint,
    required: row.required === 1,
    notes: row.notes
  };
}

function buildChildCountMap(rows: NodeRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.parent_id) {
      counts.set(row.parent_id, (counts.get(row.parent_id) ?? 0) + 1);
    }
  }
  return counts;
}

function sortHierarchyNodes(a: HierarchyNode, b: HierarchyNode): number {
  const kindOrder = new Map<GraphNodeKind, number>([
    ["framework", 0],
    ["module", 1],
    ["website", 2],
    ["ui_component", 3],
    ["object", 4],
    ["function", 5],
    ["process", 6],
    ["dependency", 7],
    ["input", 8],
    ["output", 9],
    ["format", 10],
    ["environment", 11],
    ["config", 12],
    ["secret", 13],
    ["command", 14],
    ["file", 15],
    ["database", 16],
    ["api", 17],
    ["event", 18],
    ["artifact", 19],
    ["custom", 20]
  ]);
  return (kindOrder.get(a.kind) ?? 10) - (kindOrder.get(b.kind) ?? 10) || a.name.localeCompare(b.name);
}

function defaultSizeForKind(kind: GraphNodeKind): { width: number; height: number } {
  if (kind === "website") {
    return { width: 280, height: 144 };
  }
  if (kind === "ui_component") {
    return { width: 244, height: 124 };
  }
  if (kind === "format") {
    return { width: 156, height: 82 };
  }
  if (isAttachmentNodeKind(kind)) {
    return { width: 224, height: 112 };
  }
  return { width: 260, height: 136 };
}

function collectCodingScopeNodeIds(scope: GraphNode, nodeById: Map<string, GraphNode>): Set<string> {
  const included = new Set<string>([scope.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodeById.values()) {
      if (included.has(node.id)) {
        continue;
      }
      if ((node.parentId && included.has(node.parentId)) || (node.attachedToId && included.has(node.attachedToId))) {
        included.add(node.id);
        changed = true;
      }
    }
  }
  return included;
}

function nearestCandidateOwner(node: GraphNode, nodeById: Map<string, GraphNode>, candidateIds: Set<string>): string | null {
  const seen = new Set<string>();
  let currentId = node.attachedToId ?? node.parentId;
  while (currentId && !seen.has(currentId)) {
    if (candidateIds.has(currentId)) {
      return currentId;
    }
    seen.add(currentId);
    const current = nodeById.get(currentId);
    currentId = current?.attachedToId ?? current?.parentId ?? null;
  }
  return null;
}

function recommendCodingMode(node: GraphNode, nodes: GraphNode[], edges: GraphEdge[], scopeIds: Set<string>): { mode: CodingAgentMode; reason: string } {
  const directDomainChildren = nodes.filter((candidate) => candidate.parentId === node.id && isDomainNodeKind(candidate.kind));
  const owner = node.attachedToId ? nodes.find((candidate) => candidate.id === node.attachedToId) : null;
  const ownerDomainChildren = owner ? nodes.filter((candidate) => candidate.parentId === owner.id && isDomainNodeKind(candidate.kind)) : [];
  const isLeafFunctionOrObject = (node.kind === "function" || node.kind === "object") && directDomainChildren.length === 0;
  const isLeafWorkflowChild = isAttachmentNodeKind(node.kind) && !!owner && (owner.kind === "function" || owner.kind === "object") && ownerDomainChildren.length === 0;
  const connectedEdges = edges.filter((edge) => edge.sourceNodeId === node.id || edge.targetNodeId === node.id);
  const crossScopeEdge = connectedEdges.some((edge) => !scopeIds.has(edge.sourceNodeId) || !scopeIds.has(edge.targetNodeId));
  const sourceById = new Map(nodes.map((candidate) => [candidate.id, candidate.source.path ?? candidate.code.directory ?? null]));
  const connectedSourcePaths = new Set(connectedEdges.flatMap((edge) => [sourceById.get(edge.sourceNodeId), sourceById.get(edge.targetNodeId)]).filter((value): value is string => Boolean(value)));
  const ownSourcePath = node.source.path ?? node.code.directory ?? null;
  const crossFile = ownSourcePath ? [...connectedSourcePaths].some((sourcePath) => sourcePath !== ownSourcePath) : connectedSourcePaths.size > 1;
  if ((isLeafFunctionOrObject || isLeafWorkflowChild) && !crossScopeEdge && !crossFile) {
    return { mode: "small", reason: "Leaf-local block with no cross-file or cross-scope graph edges." };
  }
  if (crossScopeEdge || crossFile || node.kind === "framework" || node.kind === "website") {
    return { mode: "large", reason: "Broader graph context is needed because this block crosses scope, file, or top-level boundaries." };
  }
  return { mode: "medium", reason: "Module-local or non-leaf work that should include the containing workflow canvas and direct relationships." };
}

function codingConflictGroup(node: GraphNode, nodeById: Map<string, GraphNode>): string {
  const owner = resolveConflictOwner(node, nodeById);
  const sourcePath = node.source.path ?? node.code.directory ?? "no-source";
  return `${sourcePath}:${owner?.id ?? node.id}`;
}

function resolveConflictOwner(node: GraphNode, nodeById: Map<string, GraphNode>): GraphNode | null {
  if (node.kind === "function" || node.kind === "object") {
    return node;
  }
  const seen = new Set<string>();
  let current = node;
  while (current.attachedToId && !seen.has(current.attachedToId)) {
    seen.add(current.attachedToId);
    const owner = nodeById.get(current.attachedToId);
    if (!owner) {
      break;
    }
    if (owner.kind === "function" || owner.kind === "object") {
      return owner;
    }
    current = owner;
  }
  return null;
}

function sanitizeArtifactPath(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = normalized.split("/").filter((part) => part && part !== "." && part !== "..");
  return parts.join("/") || "test-script.txt";
}

function isPathInside(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

const EDGE_COLORS: Record<GraphEdgeKind, string> = {
  calls: "#2563eb",
  imports: "#64748b",
  uses: "#0891b2",
  owns: "#7c3aed",
  impacts: "#dc2626",
  flows: "#059669",
  describes_format: "#ca8a04"
};

const BOUNDARY_COLORS = ["#2563eb", "#059669", "#7c3aed", "#ca8a04", "#dc2626", "#0891b2", "#c026d3", "#475569"];
const TAG_COLORS = ["#2563eb", "#059669", "#7c3aed", "#dc2626", "#0891b2", "#be185d", "#ca8a04", "#475569"];

type TagLinkKind = "node" | "edge" | "boundary";

const TAG_LINK_METADATA: Record<TagLinkKind, { tableName: string; entityColumn: string }> = {
  node: { tableName: "graph_node_tags", entityColumn: "node_id" },
  edge: { tableName: "graph_edge_tags", entityColumn: "edge_id" },
  boundary: { tableName: "graph_boundary_tags", entityColumn: "boundary_id" }
};

function defaultEdgeColor(kind: GraphEdgeKind): string {
  return EDGE_COLORS[kind] ?? "#727782";
}

function defaultBoundaryColor(seed: string): string {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return BOUNDARY_COLORS[hash % BOUNDARY_COLORS.length];
}

function defaultTagColor(seed: string): string {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  }
  return TAG_COLORS[hash % TAG_COLORS.length];
}

function processKindForSymbol(symbol: CodeGraphSymbol): ProcessKind {
  if (symbol.symbolKind === "component") {
    return "render";
  }
  if (/^(run|start|open|load|save|seed|build|register|create|update|delete|replace)/i.test(symbol.name)) {
    return "orchestrate";
  }
  if (/^(validate|assert|parse|normalize)/i.test(symbol.name)) {
    return "validate";
  }
  return "transform";
}

function processKindForWorkflowNode(symbol: CodeGraphSymbol, workflowNode: CodeGraphWorkflowNode): ProcessKind {
  if (workflowNode.kind === "entry") {
    return processKindForSymbol(symbol);
  }
  if (workflowNode.kind === "condition") {
    return "condition";
  }
  if (workflowNode.kind === "return" || workflowNode.kind === "throw") {
    return "route";
  }
  return "transform";
}

function processKindLabel(kind: ProcessKind): string {
  switch (kind) {
    case "render":
      return "Render";
    case "orchestrate":
      return "Orchestrate";
    case "validate":
      return "Validate";
    case "persist":
      return "Persist";
    case "route":
      return "Route";
    case "analyze":
      return "Analyze";
    case "condition":
      return "Condition";
    case "transform":
    default:
      return "Process";
  }
}

function symbolHierarchyDepth(symbol: CodeGraphSymbol, symbolById: Map<string, CodeGraphSymbol>): number {
  let depth = 0;
  let parentId = symbol.parentSymbolId;
  const seen = new Set<string>();
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = symbolById.get(parentId);
    if (!parent) {
      break;
    }
    depth += 1;
    parentId = parent.parentSymbolId;
  }
  return depth;
}

function sourceLanguage(sourcePath: string): LanguageType {
  return sourcePath.endsWith(".js") || sourcePath.endsWith(".jsx") || sourcePath.endsWith(".mjs") || sourcePath.endsWith(".cjs")
    ? "javascript"
    : "typescript";
}

function pathDepth(value: string): number {
  return value === "." ? 0 : value.split("/").length;
}

function workflowEdgeId(sourceNodeId: string, kind: GraphEdgeKind, targetNodeId: string): string {
  return `code-edge-${hashId(`${sourceNodeId}:${kind}:${targetNodeId}`)}`;
}

function normalizeTagName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

const SELF_SEED_SUMMARIES: Record<string, string> = {
  "framework-graphcode-self": "Self-repo workspace map",
  "module-web": "Frontend workspace UI",
  "website-web-workspace": "Browser graph editing app",
  "module-local-server": "Local API and SQLite backend",
  "module-model": "Shared graph contract",
  "module-parser-planned": "Future repository parser",
  "module-agent-runtime-planned": "Future agent workflow runtime",
  "module-docs-research": "Docs and product research",
  "module-dev-tooling": "Scripts, tests, and outputs",
  "module-workspace-canvas": "React Flow canvas layer",
  "ui-app-shell": "Three-pane app shell",
  "ui-workspace-canvas": "Interactive graph canvas",
  "ui-hierarchy-tree": "Boundary-aware left tree",
  "ui-inspector": "Details and style panel",
  "ui-block-editor": "Block editing dialog",
  "ui-edge-editor": "Edge editing dialog",
  "ui-boundary-editor": "Boundary editing dialog",
  "module-db-repository": "Graph persistence API",
  "module-db-schema": "SQLite migrations",
  "function-app": "Top-level app state",
  "function-app-shell": "Three-pane UI shell",
  "function-workspace-canvas": "Canvas provider wrapper",
  "object-graph-repository": "SQLite graph repository",
  "object-workspace-runtime": "Workspace DB runtime",
  "function-register-routes": "Fastify route registration",
  "function-migrate": "Database migration entrypoint",
  "function-layout-elk": "ELK auto-layout adapter",
  "object-graph-node": "Shared node DTO",
  "object-canvas-graph": "Canvas payload DTO",
  "object-node-detail": "Inspector detail DTO",
  "object-node-mutation": "Node mutation schema",
  "object-graph-tag": "Reusable label DTO",
  "object-node-reuse": "Reusable placement DTO",
  "function-normalize-tag-name": "Tag normalization helper",
  "function-measure-node-layout": "Content-aware card sizing"
};

function enrichSelfSeedNode(node: NewGraphNode): NewGraphNode {
  const originalSummary = node.summary ?? node.name;
  const summary = SELF_SEED_SUMMARIES[node.id] ?? scanSummary(originalSummary, node.kind);
  const location = node.sourcePath
    ? `Source location: ${node.sourcePath}${node.sourceStartLine ? ` lines ${node.sourceStartLine}-${node.sourceEndLine ?? node.sourceStartLine}` : ""}.`
    : "Source location: this block represents architecture or runtime behavior without a single concrete file.";
  const relationship = node.parentId
    ? `It is contained by ${node.parentId}.`
    : node.attachedToId
      ? `It is attached to ${node.attachedToId}.`
      : "It is a top-level graph scope.";
  const codeContext =
    node.codeContext ??
    [
      `${node.name} is a ${node.kind} block in the deterministic self-repo GraphCode seed.`,
      `Short canvas description: ${summary}.`,
      `Architecture role: ${originalSummary}`,
      relationship,
      location,
      "When editing this area, keep the card summary short for visual scanning and put implementation notes, API contracts, test expectations, and downstream impact here."
    ].join(" ");

  return {
    ...node,
    summary,
    codeContext,
    agentStatus: node.agentStatus ?? "implemented"
  };
}

function enrichSelfSeedEdge(edge: NewGraphEdge): NewGraphEdge {
  return {
    ...edge,
    color: edge.color ?? defaultEdgeColor(edge.kind),
    animated: edge.animated ?? edge.kind === "flows",
    pointingEnabled: edge.pointingEnabled ?? true,
    pointingDirection: edge.pointingDirection ?? "source_to_target",
    agentStatus: edge.agentStatus ?? "implemented",
    codeContext:
      edge.codeContext ??
      [
        `This ${edge.kind} edge connects ${edge.sourceNodeId} to ${edge.targetNodeId}.`,
        `Visible description: ${edge.label ?? edge.kind}.`,
        "Use this context to understand why the relationship exists, what behavior or contract crosses the connection, and which tests should fail if the relationship is broken."
      ].join(" ")
  };
}

function scanSummary(value: string, kind: GraphNodeKind): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  const firstClause = cleaned.split(/[.;:]/)[0]?.trim();
  if (!firstClause) {
    return `${kind} block`;
  }
  if (firstClause.length <= 64) {
    return firstClause;
  }
  const trimmed = firstClause.slice(0, 64).trimEnd();
  const lastSpace = trimmed.lastIndexOf(" ");
  return lastSpace > 28 ? trimmed.slice(0, lastSpace) : trimmed;
}

function nodeCenterInsideBoundary(node: GraphNode, boundary: BoundaryRow): boolean {
  const centerX = node.position.x + node.size.width / 2;
  const centerY = node.position.y + node.size.height / 2;
  const minX = boundary.ui_x;
  const minY = boundary.ui_y;
  const maxX = boundary.ui_x + boundary.ui_width;
  const maxY = boundary.ui_y + boundary.ui_height;
  return centerX >= minX && centerX <= maxX && centerY >= minY && centerY <= maxY;
}

function hashId(value: string): string {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 10);
}

export function notFound(message: string): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = 404;
  return error;
}

export function validationError(message: string): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = 400;
  return error;
}
