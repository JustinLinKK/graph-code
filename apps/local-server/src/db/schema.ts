import type { GraphDatabase } from "./connection";

const GRAPH_NODES_SQL = `
  CREATE TABLE graph_nodes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('framework', 'module', 'website', 'ui_component', 'function', 'object', 'embedded_system', 'embedded_device', 'ros_node', 'firmware_task', 'ml_pipeline', 'ml_training_stage', 'ml_model', 'ml_layer', 'dependency', 'input', 'output', 'process', 'format', 'environment', 'config', 'secret', 'command', 'file', 'database', 'api', 'event', 'artifact', 'custom', 'ros_topic', 'ros_service', 'ros_action', 'gpio_pin', 'uart_bus', 'i2c_bus', 'spi_bus', 'pwm_channel', 'adc_channel', 'can_bus', 'interrupt', 'timer', 'ml_dataset', 'ml_dataloader', 'ml_preprocess', 'ml_loss', 'ml_optimizer', 'ml_scheduler', 'ml_metric', 'ml_checkpoint', 'ml_tensor', 'ml_experiment')),
    name TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    code_context TEXT NOT NULL DEFAULT '',
    code_directory TEXT,
    code_start_line INTEGER,
    code_end_line INTEGER,
    language TEXT NOT NULL DEFAULT 'unknown',
    parent_id TEXT REFERENCES graph_nodes(id) ON DELETE CASCADE,
    attached_to_id TEXT REFERENCES graph_nodes(id) ON DELETE CASCADE,
    custom_type_id TEXT REFERENCES custom_block_types(id) ON DELETE SET NULL,
    source_path TEXT,
    source_start_line INTEGER,
    source_end_line INTEGER,
    test_script_directory TEXT,
    virtual_environment TEXT,
    working_directory TEXT,
    setup_command TEXT,
    test_command TEXT,
    ui_x REAL NOT NULL DEFAULT 0,
    ui_y REAL NOT NULL DEFAULT 0,
    ui_width REAL NOT NULL DEFAULT 224,
    ui_height REAL NOT NULL DEFAULT 120,
    agent_status TEXT NOT NULL DEFAULT 'none' CHECK (agent_status IN ('none', 'planning', 'coded', 'reviewed', 'implemented', 'bugged')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

const CUSTOM_BLOCK_TYPES_SQL = `
  CREATE TABLE custom_block_types (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#475569',
    icon TEXT NOT NULL DEFAULT 'square',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

const GRAPH_EDGES_SQL = `
  CREATE TABLE graph_edges (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('calls', 'imports', 'uses', 'owns', 'impacts', 'flows', 'describes_format')),
    source_node_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
    target_node_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
    label TEXT,
    code_context TEXT NOT NULL DEFAULT '',
    source_path TEXT,
    source_start_line INTEGER,
    source_end_line INTEGER,
    color TEXT NOT NULL DEFAULT '#727782',
    animated INTEGER NOT NULL DEFAULT 0,
    pointing_enabled INTEGER NOT NULL DEFAULT 1,
    pointing_direction TEXT NOT NULL DEFAULT 'source_to_target' CHECK (pointing_direction IN ('source_to_target', 'target_to_source', 'bidirectional')),
    agent_status TEXT NOT NULL DEFAULT 'none' CHECK (agent_status IN ('none', 'planning', 'coded', 'reviewed', 'implemented', 'bugged')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

const GRAPH_BOUNDARIES_SQL = `
  CREATE TABLE graph_boundaries (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    scope_node_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    code_context TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#b45309',
    ui_x REAL NOT NULL,
    ui_y REAL NOT NULL,
    ui_width REAL NOT NULL,
    ui_height REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

const GRAPH_NODE_TYPE_STYLES_SQL = `
  CREATE TABLE graph_node_type_styles (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    node_kind TEXT NOT NULL CHECK (node_kind IN ('framework', 'module', 'website', 'ui_component', 'function', 'object', 'embedded_system', 'embedded_device', 'ros_node', 'firmware_task', 'ml_pipeline', 'ml_training_stage', 'ml_model', 'ml_layer', 'dependency', 'input', 'output', 'process', 'format', 'environment', 'config', 'secret', 'command', 'file', 'database', 'api', 'event', 'artifact', 'custom', 'ros_topic', 'ros_service', 'ros_action', 'gpio_pin', 'uart_bus', 'i2c_bus', 'spi_bus', 'pwm_channel', 'adc_channel', 'can_bus', 'interrupt', 'timer', 'ml_dataset', 'ml_dataloader', 'ml_preprocess', 'ml_loss', 'ml_optimizer', 'ml_scheduler', 'ml_metric', 'ml_checkpoint', 'ml_tensor', 'ml_experiment')),
    color TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (project_id, node_kind)
  );
`;

const GRAPH_BOUNDARY_NODES_SQL = `
  CREATE TABLE graph_boundary_nodes (
    boundary_id TEXT NOT NULL REFERENCES graph_boundaries(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
    PRIMARY KEY (boundary_id, node_id)
  );
`;

const GRAPH_TAGS_SQL = `
  CREATE TABLE graph_tags (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#64748b',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(project_id, normalized_name)
  );
`;

const GRAPH_NODE_TAGS_SQL = `
  CREATE TABLE graph_node_tags (
    node_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES graph_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (node_id, tag_id)
  );
`;

const GRAPH_EDGE_TAGS_SQL = `
  CREATE TABLE graph_edge_tags (
    edge_id TEXT NOT NULL REFERENCES graph_edges(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES graph_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (edge_id, tag_id)
  );
`;

const GRAPH_BOUNDARY_TAGS_SQL = `
  CREATE TABLE graph_boundary_tags (
    boundary_id TEXT NOT NULL REFERENCES graph_boundaries(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES graph_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (boundary_id, tag_id)
  );
`;

const GRAPH_NODE_REUSES_SQL = `
  CREATE TABLE graph_node_reuses (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    scope_node_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT '',
    context TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(project_id, scope_node_id, node_id)
  );
`;

const GRAPH_ENTITY_VERSIONS_SQL = `
  CREATE TABLE graph_entity_versions (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('node', 'edge', 'boundary')),
    entity_id TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0,
    deleted INTEGER NOT NULL DEFAULT 0,
    agent_run_id TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (project_id, entity_type, entity_id)
  );
`;

const CODING_AGENT_SETTINGS_SQL = `
  CREATE TABLE coding_agent_settings (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    coding_mode TEXT NOT NULL CHECK (coding_mode IN ('small', 'medium', 'large')),
    provider TEXT NOT NULL DEFAULT 'fake' CHECK (provider IN ('fake', 'codex', 'claudecode', 'openai', 'gemini', 'openrouter')),
    model TEXT NOT NULL DEFAULT '',
    cli_command TEXT NOT NULL DEFAULT '',
    reasoning_effort TEXT NOT NULL DEFAULT 'medium' CHECK (reasoning_effort IN ('low', 'medium', 'high', 'xhigh', 'max', 'ultra')),
    speed_tier TEXT NOT NULL DEFAULT 'standard' CHECK (speed_tier IN ('standard', 'fast')),
    permission_mode TEXT NOT NULL DEFAULT 'ask_for_permission' CHECK (permission_mode IN ('ask_for_permission', 'approve_for_me', 'full_access')),
    codex_system_prompt_mode TEXT NOT NULL DEFAULT 'custom' CHECK (codex_system_prompt_mode IN ('default', 'custom')),
    claude_system_prompt_mode TEXT NOT NULL DEFAULT 'custom' CHECK (claude_system_prompt_mode IN ('default', 'custom')),
    parallel_limit INTEGER NOT NULL DEFAULT 4,
    api_key_source_type TEXT NOT NULL DEFAULT 'env' CHECK (api_key_source_type IN ('manual', 'file', 'env')),
    api_key_source_value TEXT NOT NULL DEFAULT '',
    system_prompt_source_type TEXT NOT NULL DEFAULT 'manual' CHECK (system_prompt_source_type IN ('manual', 'file')),
    system_prompt_source_value TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (project_id, coding_mode)
  );
`;

const REVIEW_AGENT_SETTINGS_SQL = `
  CREATE TABLE review_agent_settings (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    review_mode TEXT NOT NULL CHECK (review_mode IN ('small', 'medium', 'large')),
    provider TEXT NOT NULL DEFAULT 'fake' CHECK (provider IN ('fake', 'codex', 'claudecode', 'openai', 'gemini', 'openrouter')),
    model TEXT NOT NULL DEFAULT '',
    cli_command TEXT NOT NULL DEFAULT '',
    reasoning_effort TEXT NOT NULL DEFAULT 'medium' CHECK (reasoning_effort IN ('low', 'medium', 'high', 'xhigh', 'max', 'ultra')),
    speed_tier TEXT NOT NULL DEFAULT 'standard' CHECK (speed_tier IN ('standard', 'fast')),
    permission_mode TEXT NOT NULL DEFAULT 'ask_for_permission' CHECK (permission_mode IN ('ask_for_permission', 'approve_for_me', 'full_access')),
    codex_system_prompt_mode TEXT NOT NULL DEFAULT 'custom' CHECK (codex_system_prompt_mode IN ('default', 'custom')),
    claude_system_prompt_mode TEXT NOT NULL DEFAULT 'custom' CHECK (claude_system_prompt_mode IN ('default', 'custom')),
    parallel_limit INTEGER NOT NULL DEFAULT 4,
    api_key_source_type TEXT NOT NULL DEFAULT 'env' CHECK (api_key_source_type IN ('manual', 'file', 'env')),
    api_key_source_value TEXT NOT NULL DEFAULT '',
    system_prompt_source_type TEXT NOT NULL DEFAULT 'manual' CHECK (system_prompt_source_type IN ('manual', 'file')),
    system_prompt_source_value TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (project_id, review_mode)
  );
`;

const SCANNING_AGENT_SETTINGS_SQL = `
  CREATE TABLE scanning_agent_settings (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    scanning_mode TEXT NOT NULL CHECK (scanning_mode IN ('local', 'medium', 'global')),
    provider TEXT NOT NULL DEFAULT 'fake' CHECK (provider IN ('fake', 'codex', 'claudecode', 'openai', 'gemini', 'openrouter')),
    model TEXT NOT NULL DEFAULT '',
    cli_command TEXT NOT NULL DEFAULT '',
    reasoning_effort TEXT NOT NULL DEFAULT 'medium' CHECK (reasoning_effort IN ('low', 'medium', 'high', 'xhigh', 'max', 'ultra')),
    speed_tier TEXT NOT NULL DEFAULT 'standard' CHECK (speed_tier IN ('standard', 'fast')),
    permission_mode TEXT NOT NULL DEFAULT 'ask_for_permission' CHECK (permission_mode IN ('ask_for_permission', 'approve_for_me', 'full_access')),
    codex_system_prompt_mode TEXT NOT NULL DEFAULT 'custom' CHECK (codex_system_prompt_mode IN ('default', 'custom')),
    claude_system_prompt_mode TEXT NOT NULL DEFAULT 'custom' CHECK (claude_system_prompt_mode IN ('default', 'custom')),
    parallel_limit INTEGER NOT NULL DEFAULT 4,
    api_key_source_type TEXT NOT NULL DEFAULT 'env' CHECK (api_key_source_type IN ('manual', 'file', 'env')),
    api_key_source_value TEXT NOT NULL DEFAULT '',
    system_prompt_source_type TEXT NOT NULL DEFAULT 'manual' CHECK (system_prompt_source_type IN ('manual', 'file')),
    system_prompt_source_value TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (project_id, scanning_mode)
  );
`;

const AGENT_SETTINGS_SQL = `
  CREATE TABLE agent_settings (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    agent_kind TEXT NOT NULL CHECK (agent_kind IN ('planning', 'coding', 'review', 'scanning')),
    provider TEXT NOT NULL DEFAULT 'fake' CHECK (provider IN ('fake', 'codex', 'claudecode', 'openai', 'gemini', 'openrouter')),
    model TEXT NOT NULL DEFAULT '',
    cli_command TEXT NOT NULL DEFAULT '',
    reasoning_effort TEXT NOT NULL DEFAULT 'medium' CHECK (reasoning_effort IN ('low', 'medium', 'high', 'xhigh', 'max', 'ultra')),
    speed_tier TEXT NOT NULL DEFAULT 'standard' CHECK (speed_tier IN ('standard', 'fast')),
    permission_mode TEXT NOT NULL DEFAULT 'ask_for_permission' CHECK (permission_mode IN ('ask_for_permission', 'approve_for_me', 'full_access')),
    codex_system_prompt_mode TEXT NOT NULL DEFAULT 'custom' CHECK (codex_system_prompt_mode IN ('default', 'custom')),
    claude_system_prompt_mode TEXT NOT NULL DEFAULT 'custom' CHECK (claude_system_prompt_mode IN ('default', 'custom')),
    parallel_limit INTEGER NOT NULL DEFAULT 4,
    api_key_source_type TEXT NOT NULL DEFAULT 'env' CHECK (api_key_source_type IN ('manual', 'file', 'env')),
    api_key_source_value TEXT NOT NULL DEFAULT '',
    system_prompt_source_type TEXT NOT NULL DEFAULT 'manual' CHECK (system_prompt_source_type IN ('manual', 'file')),
    system_prompt_source_value TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (project_id, agent_kind)
  );
`;

const SCAN_FILE_STATE_SQL = `
  CREATE TABLE scan_file_state (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    last_run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
    last_scanned_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (project_id, file_path)
  );
`;

const WORKSPACE_EXTENSION_SETTINGS_SQL = `
  CREATE TABLE workspace_extension_settings (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    package_id TEXT NOT NULL CHECK (package_id IN ('@graphcode/extension-embedded-systems', '@graphcode/extension-ml-pipeline')),
    enabled INTEGER NOT NULL DEFAULT 0,
    config_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (project_id, package_id)
  );
`;

const EXTENSION_NODE_DETAILS_SQL = `
  CREATE TABLE extension_node_details (
    node_id TEXT PRIMARY KEY REFERENCES graph_nodes(id) ON DELETE CASCADE,
    package_id TEXT NOT NULL CHECK (package_id IN ('@graphcode/extension-embedded-systems', '@graphcode/extension-ml-pipeline')),
    schema_id TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

const CODING_WORKFLOWS_SQL = `
  CREATE TABLE coding_workflows (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    scope_node_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'preview' CHECK (status IN ('preview', 'running', 'blocked', 'succeeded', 'failed')),
    current_layer INTEGER NOT NULL DEFAULT 0,
    summary TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

const CODING_WORKFLOW_ITEMS_SQL = `
  CREATE TABLE coding_workflow_items (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES coding_workflows(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
    layer_index INTEGER NOT NULL DEFAULT 0,
    recommended_mode TEXT NOT NULL CHECK (recommended_mode IN ('small', 'medium', 'large')),
    selected_mode TEXT NOT NULL CHECK (selected_mode IN ('small', 'medium', 'large')),
    mode_reason TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'proposed', 'applied', 'skipped', 'failed', 'blocked')),
    conflict_group TEXT NOT NULL DEFAULT '',
    agent_run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
    proposal_id TEXT REFERENCES code_proposals(id) ON DELETE SET NULL,
    applied_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(workflow_id, node_id)
  );
`;

const GRAPH_TABLES = [
  "graph_boundary_tags",
  "graph_edge_tags",
  "graph_node_tags",
  "graph_node_reuses",
  "coding_workflow_items",
  "coding_workflows",
  "graph_tags",
  "graph_node_layouts",
  "graph_node_type_styles",
  "graph_boundary_nodes",
  "graph_boundaries",
  "dependency_details",
  "io_details",
  "process_details",
  "format_details",
  "basic_block_details",
  "extension_node_details",
  "graph_entity_versions",
  "graph_edges",
  "graph_revisions",
  "graph_nodes",
  "custom_block_types",
    "scan_file_state",
    "workspace_settings",
  "workspace_extension_settings",
    "scanning_agent_settings",
    "review_agent_settings",
    "coding_agent_settings",
  "agent_settings",
  "agent_runs",
  "agent_messages",
  "graph_status_history",
  "code_proposals",
  "graph_edges_old",
  "graph_nodes_old"
] as const;

export function migrate(db: GraphDatabase): void {
  db.pragma("foreign_keys = ON");
  db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        scanning_instructions TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    ensureProjectsTable(db);

    ensureCustomBlockTypesTable(db);

  if (hasBrokenGraphTableReferences(db)) {
    resetGraphStorage(db);
  } else {
    ensureGraphNodesTable(db);
    ensureGraphEdgesTable(db);
    ensureGraphBoundariesTables(db);
    ensureGraphNodeTypeStylesTable(db);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS dependency_details (
      node_id TEXT PRIMARY KEY REFERENCES graph_nodes(id) ON DELETE CASCADE,
      dependency_kind TEXT NOT NULL CHECK (dependency_kind IN ('package', 'runtime', 'service', 'env', 'file', 'cli', 'database', 'external_system', 'tool')),
      spec TEXT NOT NULL,
      version TEXT,
      required INTEGER NOT NULL DEFAULT 1,
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS io_details (
      node_id TEXT PRIMARY KEY REFERENCES graph_nodes(id) ON DELETE CASCADE,
      io_kind TEXT NOT NULL CHECK (io_kind IN ('api', 'file', 'user', 'queue', 'env', 'artifact', 'log', 'database', 'service')),
      channel TEXT NOT NULL,
      schema_hint TEXT,
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS process_details (
      node_id TEXT PRIMARY KEY REFERENCES graph_nodes(id) ON DELETE CASCADE,
      process_kind TEXT NOT NULL CHECK (process_kind IN ('transform', 'validate', 'route', 'persist', 'render', 'orchestrate', 'analyze', 'condition')),
      trigger TEXT,
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS format_details (
      node_id TEXT PRIMARY KEY REFERENCES graph_nodes(id) ON DELETE CASCADE,
      format_kind TEXT NOT NULL CHECK (format_kind IN ('type', 'schema', 'mime', 'protocol', 'artifact', 'event')),
      spec TEXT NOT NULL,
      example TEXT,
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS basic_block_details (
      node_id TEXT PRIMARY KEY REFERENCES graph_nodes(id) ON DELETE CASCADE,
      basic_kind TEXT NOT NULL CHECK (basic_kind IN ('environment', 'config', 'secret', 'command', 'file', 'database', 'api', 'event', 'artifact', 'custom')),
      key TEXT NOT NULL DEFAULT '',
      value_hint TEXT,
      required INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT ''
    );

    ${EXTENSION_NODE_DETAILS_SQL.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")}

    CREATE TABLE IF NOT EXISTS graph_node_layouts (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      scope_node_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
      node_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
      ui_x REAL NOT NULL,
      ui_y REAL NOT NULL,
      ui_width REAL NOT NULL,
      ui_height REAL NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (project_id, scope_node_id, node_id)
    );

    ${GRAPH_BOUNDARIES_SQL.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")}

    ${GRAPH_BOUNDARY_NODES_SQL.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")}

    ${GRAPH_TAGS_SQL.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")}

    ${GRAPH_NODE_TAGS_SQL.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")}

    ${GRAPH_EDGE_TAGS_SQL.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")}

    ${GRAPH_BOUNDARY_TAGS_SQL.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")}

    ${GRAPH_NODE_REUSES_SQL.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")}

    CREATE TABLE IF NOT EXISTS graph_revisions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    ${GRAPH_ENTITY_VERSIONS_SQL.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")}
    ${SCAN_FILE_STATE_SQL.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")}

    CREATE TABLE IF NOT EXISTS workspace_settings (
      project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
      github_enabled INTEGER NOT NULL DEFAULT 0,
      github_repository TEXT NOT NULL DEFAULT '',
      github_client_id TEXT NOT NULL DEFAULT '',
      github_access_token TEXT NOT NULL DEFAULT '',
      github_user_login TEXT NOT NULL DEFAULT '',
      github_token_scopes TEXT NOT NULL DEFAULT '',
      github_connected_at TEXT,
      github_last_validated_at TEXT,
      auto_review_after_coding INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    ${WORKSPACE_EXTENSION_SETTINGS_SQL.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")}

    ${AGENT_SETTINGS_SQL.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")}

    ${CODING_AGENT_SETTINGS_SQL.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")}
    ${REVIEW_AGENT_SETTINGS_SQL.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")}
    ${SCANNING_AGENT_SETTINGS_SQL.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")}

    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        agent_kind TEXT NOT NULL CHECK (agent_kind IN ('planning', 'coding', 'review', 'scanning')),
        coding_mode TEXT CHECK (coding_mode IN ('small', 'medium', 'large')),
        review_mode TEXT CHECK (review_mode IN ('small', 'medium', 'large')),
        status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'conflicted')),
      base_graph_revision INTEGER NOT NULL DEFAULT 0,
      applied_graph_revision INTEGER,
      conflict_reason TEXT,
      target_node_id TEXT REFERENCES graph_nodes(id) ON DELETE SET NULL,
      prompt TEXT NOT NULL DEFAULT '',
      response TEXT NOT NULL DEFAULT '',
      diff TEXT NOT NULL DEFAULT '',
      graph_patch_json TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_messages (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS graph_status_history (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('node', 'edge', 'boundary')),
      entity_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('none', 'planning', 'coded', 'reviewed', 'implemented', 'bugged')),
      note TEXT NOT NULL DEFAULT '',
      agent_run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

      CREATE TABLE IF NOT EXISTS code_proposals (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        agent_run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
        target_node_id TEXT REFERENCES graph_nodes(id) ON DELETE SET NULL,
        diff TEXT NOT NULL,
        artifact_manifest_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      ${CODING_WORKFLOWS_SQL.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")}
      ${CODING_WORKFLOW_ITEMS_SQL.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")}

      CREATE INDEX IF NOT EXISTS idx_graph_nodes_project ON graph_nodes(project_id);
    CREATE INDEX IF NOT EXISTS idx_graph_nodes_parent ON graph_nodes(parent_id);
    CREATE INDEX IF NOT EXISTS idx_graph_nodes_attached_to ON graph_nodes(attached_to_id);
    CREATE INDEX IF NOT EXISTS idx_graph_nodes_custom_type ON graph_nodes(custom_type_id);
    CREATE INDEX IF NOT EXISTS idx_custom_block_types_project ON custom_block_types(project_id);
    CREATE INDEX IF NOT EXISTS idx_graph_edges_project ON graph_edges(project_id);
    CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source_node_id);
    CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target_node_id);
    CREATE INDEX IF NOT EXISTS idx_graph_node_layouts_scope ON graph_node_layouts(project_id, scope_node_id);
    CREATE INDEX IF NOT EXISTS idx_graph_node_type_styles_project ON graph_node_type_styles(project_id);
    CREATE INDEX IF NOT EXISTS idx_graph_boundaries_project_scope ON graph_boundaries(project_id, scope_node_id);
    CREATE INDEX IF NOT EXISTS idx_graph_boundary_nodes_node ON graph_boundary_nodes(node_id);
    CREATE INDEX IF NOT EXISTS idx_graph_tags_project ON graph_tags(project_id);
    CREATE INDEX IF NOT EXISTS idx_graph_node_tags_tag ON graph_node_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_graph_edge_tags_tag ON graph_edge_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_graph_boundary_tags_tag ON graph_boundary_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_graph_node_reuses_scope ON graph_node_reuses(project_id, scope_node_id);
    CREATE INDEX IF NOT EXISTS idx_graph_node_reuses_node ON graph_node_reuses(project_id, node_id);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_project ON agent_runs(project_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_target ON agent_runs(target_node_id);
    CREATE INDEX IF NOT EXISTS idx_agent_messages_run ON agent_messages(run_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_graph_status_history_entity ON graph_status_history(project_id, entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_code_proposals_project ON code_proposals(project_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_coding_workflows_project ON coding_workflows(project_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_coding_workflow_items_workflow ON coding_workflow_items(workflow_id, layer_index, status);
    CREATE INDEX IF NOT EXISTS idx_scan_file_state_project ON scan_file_state(project_id, last_scanned_at);
    CREATE INDEX IF NOT EXISTS idx_workspace_extension_settings_project ON workspace_extension_settings(project_id);
    CREATE INDEX IF NOT EXISTS idx_extension_node_details_package ON extension_node_details(package_id);
  `);
  ensureWorkspaceSettingsTable(db);
  ensureWorkspaceExtensionSettingsTable(db);
  ensureAgentSettingsTable(db);
    ensureCodingAgentSettingsTable(db);
    ensureReviewAgentSettingsTable(db);
    ensureScanningAgentSettingsTable(db);
  ensureScanFileStateTable(db);
  ensureAgentRunsTable(db);
  ensureAgentReferenceTables(db);
  ensureCodingWorkflowTables(db);
  ensureGraphEntityVersionsTable(db);
  ensureGraphStatusHistoryTable(db);
  ensureProcessDetailsTable(db);
  }

function ensureProjectsTable(db: GraphDatabase): void {
  if (!getTableSql(db, "projects")) {
    return;
  }
  if (!tableHasColumn(db, "projects", "description")) {
    db.exec("ALTER TABLE projects ADD COLUMN description TEXT NOT NULL DEFAULT '';");
  }
  if (!tableHasColumn(db, "projects", "scanning_instructions")) {
    db.exec("ALTER TABLE projects ADD COLUMN scanning_instructions TEXT NOT NULL DEFAULT '';");
  }
}

function ensureWorkspaceSettingsTable(db: GraphDatabase): void {
  if (!getTableSql(db, "workspace_settings")) {
    return;
  }
  if (!tableHasColumn(db, "workspace_settings", "github_client_id")) {
    db.exec("ALTER TABLE workspace_settings ADD COLUMN github_client_id TEXT NOT NULL DEFAULT '';");
  }
  if (!tableHasColumn(db, "workspace_settings", "github_access_token")) {
    db.exec("ALTER TABLE workspace_settings ADD COLUMN github_access_token TEXT NOT NULL DEFAULT '';");
  }
  if (!tableHasColumn(db, "workspace_settings", "github_user_login")) {
    db.exec("ALTER TABLE workspace_settings ADD COLUMN github_user_login TEXT NOT NULL DEFAULT '';");
  }
  if (!tableHasColumn(db, "workspace_settings", "github_token_scopes")) {
    db.exec("ALTER TABLE workspace_settings ADD COLUMN github_token_scopes TEXT NOT NULL DEFAULT '';");
  }
  if (!tableHasColumn(db, "workspace_settings", "github_connected_at")) {
    db.exec("ALTER TABLE workspace_settings ADD COLUMN github_connected_at TEXT;");
  }
  if (!tableHasColumn(db, "workspace_settings", "github_last_validated_at")) {
    db.exec("ALTER TABLE workspace_settings ADD COLUMN github_last_validated_at TEXT;");
  }
  if (!tableHasColumn(db, "workspace_settings", "auto_review_after_coding")) {
    db.exec("ALTER TABLE workspace_settings ADD COLUMN auto_review_after_coding INTEGER NOT NULL DEFAULT 1;");
  }
}

function ensureWorkspaceExtensionSettingsTable(db: GraphDatabase): void {
  if (!getTableSql(db, "workspace_extension_settings")) {
    db.exec(WORKSPACE_EXTENSION_SETTINGS_SQL);
  }
}

function ensureAgentSettingsTable(db: GraphDatabase): void {
  ensureProviderSettingsTable(db, "agent_settings", AGENT_SETTINGS_SQL);
}

function ensureCodingAgentSettingsTable(db: GraphDatabase): void {
  ensureProviderSettingsTable(db, "coding_agent_settings", CODING_AGENT_SETTINGS_SQL);
}

function ensureReviewAgentSettingsTable(db: GraphDatabase): void {
  ensureProviderSettingsTable(db, "review_agent_settings", REVIEW_AGENT_SETTINGS_SQL);
}

function ensureScanningAgentSettingsTable(db: GraphDatabase): void {
  ensureProviderSettingsTable(db, "scanning_agent_settings", SCANNING_AGENT_SETTINGS_SQL);
}

function ensureProviderSettingsTable(db: GraphDatabase, tableName: string, createSql: string): void {
  const sql = getTableSql(db, tableName);
  if (!sql) {
    db.exec(createSql);
    return;
  }
  const hasCodexSettingsColumns =
    tableHasColumn(db, tableName, "cli_command") &&
    tableHasColumn(db, tableName, "reasoning_effort") &&
    tableHasColumn(db, tableName, "speed_tier") &&
    tableHasColumn(db, tableName, "permission_mode") &&
    tableHasColumn(db, tableName, "codex_system_prompt_mode") &&
    tableHasColumn(db, tableName, "claude_system_prompt_mode");
  if (!sql.includes("'codex'") || !hasCodexSettingsColumns) {
    rebuildProviderSettingsTable(db, tableName, createSql);
  }
}

function ensureScanFileStateTable(db: GraphDatabase): void {
  if (!getTableSql(db, "scan_file_state")) {
    db.exec(SCAN_FILE_STATE_SQL);
  }
}

function ensureAgentRunsTable(db: GraphDatabase): void {
  const sql = getTableSql(db, "agent_runs");
  if (!sql) {
    return;
  }
  if (!sql.includes("'conflicted'")) {
    rebuildAgentRunsTable(db);
    return;
  }
  if (!tableHasColumn(db, "agent_runs", "coding_mode")) {
    db.exec("ALTER TABLE agent_runs ADD COLUMN coding_mode TEXT CHECK (coding_mode IN ('small', 'medium', 'large'));");
    db.exec("UPDATE agent_runs SET coding_mode = 'medium' WHERE agent_kind = 'coding' AND coding_mode IS NULL;");
  }
  if (!tableHasColumn(db, "agent_runs", "review_mode")) {
    db.exec("ALTER TABLE agent_runs ADD COLUMN review_mode TEXT CHECK (review_mode IN ('small', 'medium', 'large'));");
    db.exec("UPDATE agent_runs SET review_mode = 'medium' WHERE agent_kind = 'review' AND review_mode IS NULL;");
  }
  if (!tableHasColumn(db, "agent_runs", "base_graph_revision")) {
    db.exec("ALTER TABLE agent_runs ADD COLUMN base_graph_revision INTEGER NOT NULL DEFAULT 0;");
  }
  if (!tableHasColumn(db, "agent_runs", "applied_graph_revision")) {
    db.exec("ALTER TABLE agent_runs ADD COLUMN applied_graph_revision INTEGER;");
  }
  if (!tableHasColumn(db, "agent_runs", "conflict_reason")) {
    db.exec("ALTER TABLE agent_runs ADD COLUMN conflict_reason TEXT;");
  }
}

function ensureAgentReferenceTables(db: GraphDatabase): void {
  if (getTableSql(db, "agent_messages")?.includes("agent_runs_old")) {
    db.pragma("foreign_keys = OFF");
    db.exec(`
      ALTER TABLE agent_messages RENAME TO agent_messages_old;
      CREATE TABLE agent_messages (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO agent_messages (id, run_id, role, content, created_at)
      SELECT id, run_id, role, content, created_at FROM agent_messages_old;
      DROP TABLE agent_messages_old;
    `);
    db.pragma("foreign_keys = ON");
  }

  const codeProposalSql = getTableSql(db, "code_proposals");
  if (codeProposalSql?.includes("agent_runs_old")) {
    const hasArtifactManifest = tableHasColumn(db, "code_proposals", "artifact_manifest_json");
    db.pragma("foreign_keys = OFF");
    db.exec(`
      ALTER TABLE code_proposals RENAME TO code_proposals_old;
      CREATE TABLE code_proposals (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        agent_run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
        target_node_id TEXT REFERENCES graph_nodes(id) ON DELETE SET NULL,
        diff TEXT NOT NULL,
        artifact_manifest_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO code_proposals (id, project_id, agent_run_id, target_node_id, diff, artifact_manifest_json, created_at)
      SELECT id, project_id, agent_run_id, target_node_id, diff, ${hasArtifactManifest ? "artifact_manifest_json" : "NULL"}, created_at FROM code_proposals_old;
      DROP TABLE code_proposals_old;
    `);
    db.pragma("foreign_keys = ON");
  } else if (codeProposalSql && !tableHasColumn(db, "code_proposals", "artifact_manifest_json")) {
    db.exec("ALTER TABLE code_proposals ADD COLUMN artifact_manifest_json TEXT;");
  }
}

function ensureCodingWorkflowTables(db: GraphDatabase): void {
  if (!getTableSql(db, "coding_workflows")) {
    db.exec(CODING_WORKFLOWS_SQL);
  }
  if (!getTableSql(db, "coding_workflow_items")) {
    db.exec(CODING_WORKFLOW_ITEMS_SQL);
  }
}

function ensureGraphEntityVersionsTable(db: GraphDatabase): void {
  if (!getTableSql(db, "graph_entity_versions")) {
    db.exec(GRAPH_ENTITY_VERSIONS_SQL);
  }
  if (!tableHasColumn(db, "graph_entity_versions", "agent_run_id")) {
    db.exec("ALTER TABLE graph_entity_versions ADD COLUMN agent_run_id TEXT;");
  }
  db.exec(`
    INSERT OR IGNORE INTO graph_entity_versions (project_id, entity_type, entity_id, revision, deleted)
    SELECT project_id, 'node', id, 0, 0 FROM graph_nodes;
    INSERT OR IGNORE INTO graph_entity_versions (project_id, entity_type, entity_id, revision, deleted)
    SELECT project_id, 'edge', id, 0, 0 FROM graph_edges;
    INSERT OR IGNORE INTO graph_entity_versions (project_id, entity_type, entity_id, revision, deleted)
    SELECT project_id, 'boundary', id, 0, 0 FROM graph_boundaries;
  `);
}

function ensureGraphStatusHistoryTable(db: GraphDatabase): void {
  const sql = getTableSql(db, "graph_status_history");
  if (!sql || (sql.includes("'implemented'") && !sql.includes("agent_runs_old"))) {
    return;
  }

  db.pragma("foreign_keys = OFF");
  db.exec(`
    ALTER TABLE graph_status_history RENAME TO graph_status_history_old;
    CREATE TABLE graph_status_history (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('node', 'edge', 'boundary')),
      entity_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('none', 'planning', 'coded', 'reviewed', 'implemented', 'bugged')),
      note TEXT NOT NULL DEFAULT '',
      agent_run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO graph_status_history (id, project_id, entity_type, entity_id, status, note, agent_run_id, created_at)
    SELECT id, project_id, entity_type, entity_id, ${normalizedStatusSql("status")}, note, agent_run_id, created_at
    FROM graph_status_history_old;
    DROP TABLE graph_status_history_old;
  `);
  db.pragma("foreign_keys = ON");
}

function ensureProcessDetailsTable(db: GraphDatabase): void {
  const sql = getTableSql(db, "process_details");
  if (!sql || sql.includes("'condition'")) {
    return;
  }

  db.pragma("foreign_keys = OFF");
  db.exec(`
    ALTER TABLE process_details RENAME TO process_details_old;
    CREATE TABLE process_details (
      node_id TEXT PRIMARY KEY REFERENCES graph_nodes(id) ON DELETE CASCADE,
      process_kind TEXT NOT NULL CHECK (process_kind IN ('transform', 'validate', 'route', 'persist', 'render', 'orchestrate', 'analyze', 'condition')),
      trigger TEXT,
      notes TEXT NOT NULL DEFAULT ''
    );
    INSERT INTO process_details (node_id, process_kind, trigger, notes)
    SELECT node_id, process_kind, trigger, notes FROM process_details_old;
    DROP TABLE process_details_old;
  `);
  db.pragma("foreign_keys = ON");
}

function ensureCustomBlockTypesTable(db: GraphDatabase): void {
  const sql = getTableSql(db, "custom_block_types");
  if (!sql) {
    db.exec(CUSTOM_BLOCK_TYPES_SQL);
  }
}

function ensureGraphNodesTable(db: GraphDatabase): void {
  const sql = getTableSql(db, "graph_nodes");
  if (!sql) {
    db.exec(GRAPH_NODES_SQL);
    return;
  }

  if (
    sql.includes("'custom'") &&
    sql.includes("ui_width") &&
    sql.includes("code_context") &&
    sql.includes("custom_type_id") &&
    sql.includes("'website'") &&
    sql.includes("'ui_component'") &&
    sql.includes("'embedded_system'") &&
    sql.includes("'ml_layer'")
  ) {
      if (!tableHasColumn(db, "graph_nodes", "agent_status")) {
        db.exec("ALTER TABLE graph_nodes ADD COLUMN agent_status TEXT NOT NULL DEFAULT 'none';");
      }
      ensureGraphNodeExecutionColumns(db);
      if (!sql.includes("'implemented'")) {
        rebuildGraphNodesTable(db);
      }
    return;
  }

  if (sql.includes("'custom'") && sql.includes("ui_width") && sql.includes("code_context") && sql.includes("custom_type_id")) {
    if (!tableHasColumn(db, "graph_nodes", "agent_status")) {
      db.exec("ALTER TABLE graph_nodes ADD COLUMN agent_status TEXT NOT NULL DEFAULT 'none';");
    }
    ensureGraphNodeExecutionColumns(db);
    rebuildGraphNodesTable(db);
    return;
  }

  resetGraphStorage(db);
}

function ensureGraphNodeExecutionColumns(db: GraphDatabase): void {
  const columns: Array<[string, string]> = [
    ["test_script_directory", "TEXT"],
    ["virtual_environment", "TEXT"],
    ["working_directory", "TEXT"],
    ["setup_command", "TEXT"],
    ["test_command", "TEXT"]
  ];
  for (const [column, type] of columns) {
    if (!tableHasColumn(db, "graph_nodes", column)) {
      db.exec(`ALTER TABLE graph_nodes ADD COLUMN ${column} ${type};`);
    }
  }
}

function ensureGraphEdgesTable(db: GraphDatabase): void {
  const sql = getTableSql(db, "graph_edges");
  if (!sql) {
    db.exec(GRAPH_EDGES_SQL);
    return;
  }

  if (sql.includes("'flows'") && sql.includes("'describes_format'")) {
    if (!tableHasColumn(db, "graph_edges", "code_context")) {
      db.exec("ALTER TABLE graph_edges ADD COLUMN code_context TEXT NOT NULL DEFAULT '';");
    }
    if (!tableHasColumn(db, "graph_edges", "color")) {
      db.exec("ALTER TABLE graph_edges ADD COLUMN color TEXT NOT NULL DEFAULT '#727782';");
    }
    if (!tableHasColumn(db, "graph_edges", "animated")) {
      db.exec("ALTER TABLE graph_edges ADD COLUMN animated INTEGER NOT NULL DEFAULT 0;");
    }
    if (!tableHasColumn(db, "graph_edges", "pointing_enabled")) {
      db.exec("ALTER TABLE graph_edges ADD COLUMN pointing_enabled INTEGER NOT NULL DEFAULT 1;");
    }
    if (!tableHasColumn(db, "graph_edges", "pointing_direction")) {
      db.exec("ALTER TABLE graph_edges ADD COLUMN pointing_direction TEXT NOT NULL DEFAULT 'source_to_target';");
    }
    if (!tableHasColumn(db, "graph_edges", "agent_status")) {
      db.exec("ALTER TABLE graph_edges ADD COLUMN agent_status TEXT NOT NULL DEFAULT 'none';");
    }
    if (!tableHasColumn(db, "graph_edges", "source_path")) {
      db.exec("ALTER TABLE graph_edges ADD COLUMN source_path TEXT;");
    }
    if (!tableHasColumn(db, "graph_edges", "source_start_line")) {
      db.exec("ALTER TABLE graph_edges ADD COLUMN source_start_line INTEGER;");
    }
    if (!tableHasColumn(db, "graph_edges", "source_end_line")) {
      db.exec("ALTER TABLE graph_edges ADD COLUMN source_end_line INTEGER;");
    }
    if (!sql.includes("'implemented'")) {
      rebuildGraphEdgesTable(db);
    }
    return;
  }

  rebuildGraphEdgesTable(db);
}

function ensureGraphBoundariesTables(db: GraphDatabase): void {
  if (!getTableSql(db, "graph_boundaries")) {
    db.exec(GRAPH_BOUNDARIES_SQL);
  } else if (!tableHasColumn(db, "graph_boundaries", "color")) {
    db.exec("ALTER TABLE graph_boundaries ADD COLUMN color TEXT NOT NULL DEFAULT '#b45309';");
  }
  if (!getTableSql(db, "graph_boundary_nodes")) {
    db.exec(GRAPH_BOUNDARY_NODES_SQL);
  }
}

function ensureGraphNodeTypeStylesTable(db: GraphDatabase): void {
  const sql = getTableSql(db, "graph_node_type_styles");
  if (!sql) {
    db.exec(GRAPH_NODE_TYPE_STYLES_SQL);
    return;
  }
  if (!sql.includes("'website'") || !sql.includes("'ui_component'") || !sql.includes("'embedded_system'") || !sql.includes("'ml_layer'")) {
    db.pragma("foreign_keys = OFF");
    db.exec(`
      CREATE TABLE graph_node_type_styles_new AS SELECT * FROM graph_node_type_styles;
      DROP TABLE graph_node_type_styles;
      ${GRAPH_NODE_TYPE_STYLES_SQL}
      INSERT INTO graph_node_type_styles (project_id, node_kind, color, created_at, updated_at)
      SELECT project_id, node_kind, color, created_at, updated_at FROM graph_node_type_styles_new;
      DROP TABLE graph_node_type_styles_new;
    `);
    db.pragma("foreign_keys = ON");
  }
}

function hasBrokenGraphTableReferences(db: GraphDatabase): boolean {
  const placeholders = GRAPH_TABLES.map(() => "?").join(", ");
  const rows = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`)
    .all(...GRAPH_TABLES) as Array<{ sql: string | null }>;
  return rows.some((row) => row.sql?.includes("graph_nodes_old") || row.sql?.includes("graph_edges_old"));
}

function resetGraphStorage(db: GraphDatabase): void {
  db.pragma("foreign_keys = OFF");
  db.exec(`
    DROP TABLE IF EXISTS graph_node_layouts;
    DROP TABLE IF EXISTS graph_boundary_tags;
    DROP TABLE IF EXISTS graph_edge_tags;
    DROP TABLE IF EXISTS graph_node_tags;
    DROP TABLE IF EXISTS graph_node_reuses;
    DROP TABLE IF EXISTS graph_tags;
    DROP TABLE IF EXISTS graph_node_type_styles;
    DROP TABLE IF EXISTS graph_boundary_nodes;
    DROP TABLE IF EXISTS graph_boundaries;
    DROP TABLE IF EXISTS dependency_details;
    DROP TABLE IF EXISTS io_details;
    DROP TABLE IF EXISTS process_details;
    DROP TABLE IF EXISTS format_details;
    DROP TABLE IF EXISTS basic_block_details;
    DROP TABLE IF EXISTS extension_node_details;
      DROP TABLE IF EXISTS graph_entity_versions;
      DROP TABLE IF EXISTS scan_file_state;
      DROP TABLE IF EXISTS graph_edges;
      DROP TABLE IF EXISTS graph_revisions;
      DROP TABLE IF EXISTS coding_workflow_items;
      DROP TABLE IF EXISTS coding_workflows;
      DROP TABLE IF EXISTS code_proposals;
    DROP TABLE IF EXISTS graph_status_history;
      DROP TABLE IF EXISTS agent_messages;
        DROP TABLE IF EXISTS agent_runs;
        DROP TABLE IF EXISTS scanning_agent_settings;
        DROP TABLE IF EXISTS review_agent_settings;
        DROP TABLE IF EXISTS coding_agent_settings;
    DROP TABLE IF EXISTS agent_settings;
    DROP TABLE IF EXISTS workspace_settings;
    DROP TABLE IF EXISTS workspace_extension_settings;
    DROP TABLE IF EXISTS graph_edges_old;
    DROP TABLE IF EXISTS graph_nodes_old;
    DROP TABLE IF EXISTS graph_nodes;
    DROP TABLE IF EXISTS custom_block_types;
    ${CUSTOM_BLOCK_TYPES_SQL}
    ${GRAPH_NODES_SQL}
    ${GRAPH_EDGES_SQL}
    ${GRAPH_BOUNDARIES_SQL}
    ${GRAPH_BOUNDARY_NODES_SQL}
    ${GRAPH_NODE_TYPE_STYLES_SQL}
    ${GRAPH_TAGS_SQL}
    ${GRAPH_NODE_TAGS_SQL}
    ${GRAPH_EDGE_TAGS_SQL}
    ${GRAPH_BOUNDARY_TAGS_SQL}
    ${EXTENSION_NODE_DETAILS_SQL}
      ${GRAPH_NODE_REUSES_SQL}
      ${GRAPH_ENTITY_VERSIONS_SQL}
    ${WORKSPACE_EXTENSION_SETTINGS_SQL}
        ${SCAN_FILE_STATE_SQL}
        ${CODING_AGENT_SETTINGS_SQL}
        ${REVIEW_AGENT_SETTINGS_SQL}
        ${SCANNING_AGENT_SETTINGS_SQL}
      ${CODING_WORKFLOWS_SQL}
      ${CODING_WORKFLOW_ITEMS_SQL}
    `);
  db.pragma("foreign_keys = ON");
}

function rebuildProviderSettingsTable(db: GraphDatabase, tableName: string, createSql: string): void {
  const keyColumnByTable: Record<string, string> = {
    agent_settings: "agent_kind",
    coding_agent_settings: "coding_mode",
    review_agent_settings: "review_mode",
    scanning_agent_settings: "scanning_mode"
  };
  const keyColumn = keyColumnByTable[tableName];
  if (!keyColumn) {
    return;
  }
  const hasCliCommand = tableHasColumn(db, tableName, "cli_command");
  const hasReasoningEffort = tableHasColumn(db, tableName, "reasoning_effort");
  const hasSpeedTier = tableHasColumn(db, tableName, "speed_tier");
  const hasPermissionMode = tableHasColumn(db, tableName, "permission_mode");
  const hasCodexSystemPromptMode = tableHasColumn(db, tableName, "codex_system_prompt_mode");
  const hasClaudeSystemPromptMode = tableHasColumn(db, tableName, "claude_system_prompt_mode");
  const codexLegacyCommandPredicate = [
    "provider = 'codex' AND",
    "(",
    "trim(model) IN ('codex', 'codex.cmd', 'codex.exe')",
    "OR trim(model) LIKE 'codex %'",
    "OR trim(model) LIKE '%/codex'",
    "OR trim(model) LIKE '%/codex.exe'",
    "OR trim(model) LIKE '%\\\\codex'",
    "OR trim(model) LIKE '%\\\\codex.exe'",
    "OR trim(model) LIKE 'npx %codex%'",
    "OR trim(model) LIKE 'pnpm %codex%'",
    "OR trim(model) LIKE 'bunx %codex%'",
    "OR trim(model) LIKE 'npm exec %codex%'",
    "OR trim(model) LIKE 'node %codex%'",
    ")"
  ].join(" ");
  const claudeLegacyCommandPredicate = [
    "provider = 'claudecode' AND",
    "(",
    "trim(model) IN ('claude', 'claude.cmd', 'claude.exe')",
    "OR trim(model) LIKE 'claude %'",
    "OR trim(model) LIKE '%/claude'",
    "OR trim(model) LIKE '%/claude.exe'",
    "OR trim(model) LIKE '%\\\\claude'",
    "OR trim(model) LIKE '%\\\\claude.exe'",
    "OR trim(model) LIKE 'npx %claude%'",
    "OR trim(model) LIKE 'pnpm %claude%'",
    "OR trim(model) LIKE 'bunx %claude%'",
    "OR trim(model) LIKE 'npm exec %claude%'",
    "OR trim(model) LIKE 'node %claude%'",
    ")"
  ].join(" ");
  const modelExpression = `CASE WHEN ${codexLegacyCommandPredicate} OR ${claudeLegacyCommandPredicate} THEN '' ELSE model END`;
  const cliCommandExpression = hasCliCommand
    ? `CASE WHEN trim(cli_command) <> '' THEN cli_command WHEN ${codexLegacyCommandPredicate} OR ${claudeLegacyCommandPredicate} THEN model ELSE '' END`
    : `CASE WHEN ${codexLegacyCommandPredicate} OR ${claudeLegacyCommandPredicate} THEN model ELSE '' END`;
  const oldTableName = `${tableName}_old`;
  db.pragma("foreign_keys = OFF");
  db.exec(`
    ALTER TABLE ${tableName} RENAME TO ${oldTableName};
    ${createSql}
    INSERT INTO ${tableName} (
      project_id, ${keyColumn}, provider, model, cli_command,
      reasoning_effort, speed_tier, permission_mode, codex_system_prompt_mode, claude_system_prompt_mode,
      parallel_limit,
      api_key_source_type, api_key_source_value,
      system_prompt_source_type, system_prompt_source_value,
      created_at, updated_at
    )
    SELECT
      project_id, ${keyColumn}, provider, ${modelExpression}, ${cliCommandExpression},
      ${hasReasoningEffort ? "reasoning_effort" : "'medium'"},
      ${hasSpeedTier ? "speed_tier" : "'standard'"},
      ${hasPermissionMode ? "permission_mode" : "'ask_for_permission'"},
      ${hasCodexSystemPromptMode ? "codex_system_prompt_mode" : "'custom'"},
      ${hasClaudeSystemPromptMode ? "claude_system_prompt_mode" : "'custom'"},
      parallel_limit,
      api_key_source_type, api_key_source_value,
      system_prompt_source_type, system_prompt_source_value,
      created_at, updated_at
    FROM ${oldTableName};
    DROP TABLE ${oldTableName};
  `);
  db.pragma("foreign_keys = ON");
}

function rebuildGraphNodesTable(db: GraphDatabase): void {
  db.pragma("foreign_keys = OFF");
  db.exec(`
    ${GRAPH_NODES_SQL.replace("CREATE TABLE graph_nodes", "CREATE TABLE graph_nodes_new")}
    INSERT INTO graph_nodes_new (
      id, project_id, kind, name, summary,
      code_context, code_directory, code_start_line, code_end_line, language,
      parent_id, attached_to_id, custom_type_id,
        source_path, source_start_line, source_end_line,
        test_script_directory, virtual_environment, working_directory, setup_command, test_command,
        ui_x, ui_y,
        ui_width, ui_height, agent_status, created_at, updated_at
      )
      SELECT
        id, project_id, kind, name, summary,
        code_context, code_directory, code_start_line, code_end_line, language,
        parent_id, attached_to_id, custom_type_id,
        source_path, source_start_line, source_end_line,
        ${tableHasColumn(db, "graph_nodes", "test_script_directory") ? "test_script_directory" : "NULL"},
        ${tableHasColumn(db, "graph_nodes", "virtual_environment") ? "virtual_environment" : "NULL"},
        ${tableHasColumn(db, "graph_nodes", "working_directory") ? "working_directory" : "NULL"},
        ${tableHasColumn(db, "graph_nodes", "setup_command") ? "setup_command" : "NULL"},
        ${tableHasColumn(db, "graph_nodes", "test_command") ? "test_command" : "NULL"},
        ui_x, ui_y,
        ui_width, ui_height, ${normalizedStatusSql("agent_status")}, created_at, updated_at
      FROM graph_nodes;
    DROP TABLE graph_nodes;
    ALTER TABLE graph_nodes_new RENAME TO graph_nodes;
  `);
  db.pragma("foreign_keys = ON");
}

function rebuildGraphEdgesTable(db: GraphDatabase): void {
  const hasCodeContext = tableHasColumn(db, "graph_edges", "code_context");
  const hasColor = tableHasColumn(db, "graph_edges", "color");
  const hasAnimated = tableHasColumn(db, "graph_edges", "animated");
  const hasPointingEnabled = tableHasColumn(db, "graph_edges", "pointing_enabled");
  const hasPointingDirection = tableHasColumn(db, "graph_edges", "pointing_direction");
  const hasAgentStatus = tableHasColumn(db, "graph_edges", "agent_status");
  const hasSourcePath = tableHasColumn(db, "graph_edges", "source_path");
  const hasSourceStartLine = tableHasColumn(db, "graph_edges", "source_start_line");
  const hasSourceEndLine = tableHasColumn(db, "graph_edges", "source_end_line");
  db.pragma("foreign_keys = OFF");
  db.exec(`
    ALTER TABLE graph_edges RENAME TO graph_edges_old;
    ${GRAPH_EDGES_SQL}
    INSERT INTO graph_edges (id, project_id, kind, source_node_id, target_node_id, label, code_context, source_path, source_start_line, source_end_line, color, animated, pointing_enabled, pointing_direction, agent_status, created_at)
    SELECT
      id, project_id, kind, source_node_id, target_node_id, label,
      ${hasCodeContext ? "code_context" : "''"},
      ${hasSourcePath ? "source_path" : "NULL"},
      ${hasSourceStartLine ? "source_start_line" : "NULL"},
      ${hasSourceEndLine ? "source_end_line" : "NULL"},
      ${hasColor ? "color" : "'#727782'"},
      ${hasAnimated ? "animated" : "0"},
      ${hasPointingEnabled ? "pointing_enabled" : "1"},
      ${hasPointingDirection ? "pointing_direction" : "'source_to_target'"},
      ${hasAgentStatus ? normalizedStatusSql("agent_status") : "'none'"},
      created_at
    FROM graph_edges_old;
    DROP TABLE graph_edges_old;
  `);
  db.pragma("foreign_keys = ON");
}

function rebuildAgentRunsTable(db: GraphDatabase): void {
  const hasCodingMode = tableHasColumn(db, "agent_runs", "coding_mode");
  const hasReviewMode = tableHasColumn(db, "agent_runs", "review_mode");
  const hasBaseGraphRevision = tableHasColumn(db, "agent_runs", "base_graph_revision");
  const hasAppliedGraphRevision = tableHasColumn(db, "agent_runs", "applied_graph_revision");
  const hasConflictReason = tableHasColumn(db, "agent_runs", "conflict_reason");
  db.pragma("foreign_keys = OFF");
  db.exec(`
    ALTER TABLE agent_runs RENAME TO agent_runs_old;
    CREATE TABLE agent_runs (
      id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        agent_kind TEXT NOT NULL CHECK (agent_kind IN ('planning', 'coding', 'review', 'scanning')),
        coding_mode TEXT CHECK (coding_mode IN ('small', 'medium', 'large')),
        review_mode TEXT CHECK (review_mode IN ('small', 'medium', 'large')),
        status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'conflicted')),
      base_graph_revision INTEGER NOT NULL DEFAULT 0,
      applied_graph_revision INTEGER,
      conflict_reason TEXT,
      target_node_id TEXT REFERENCES graph_nodes(id) ON DELETE SET NULL,
      prompt TEXT NOT NULL DEFAULT '',
      response TEXT NOT NULL DEFAULT '',
      diff TEXT NOT NULL DEFAULT '',
      graph_patch_json TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
      INSERT INTO agent_runs (
        id, project_id, agent_kind, coding_mode, review_mode, status,
        base_graph_revision, applied_graph_revision, conflict_reason,
        target_node_id, prompt, response, diff, graph_patch_json, error, created_at, updated_at
      )
      SELECT
        id, project_id, agent_kind,
        ${hasCodingMode ? "coding_mode" : "CASE WHEN agent_kind = 'coding' THEN 'medium' ELSE NULL END"},
        ${hasReviewMode ? "review_mode" : "CASE WHEN agent_kind = 'review' THEN 'medium' ELSE NULL END"},
        CASE status WHEN 'queued' THEN 'queued' WHEN 'running' THEN 'running' WHEN 'succeeded' THEN 'succeeded' WHEN 'failed' THEN 'failed' WHEN 'conflicted' THEN 'conflicted' ELSE 'failed' END,
      ${hasBaseGraphRevision ? "base_graph_revision" : "0"},
      ${hasAppliedGraphRevision ? "applied_graph_revision" : "NULL"},
      ${hasConflictReason ? "conflict_reason" : "NULL"},
      target_node_id, prompt, response, diff, graph_patch_json, error, created_at, updated_at
    FROM agent_runs_old;
    DROP TABLE agent_runs_old;
  `);
  db.pragma("foreign_keys = ON");
}

function normalizedStatusSql(columnName: string): string {
  return `CASE ${columnName}
    WHEN 'planning' THEN 'planning'
    WHEN 'coded' THEN 'coded'
    WHEN 'reviewed' THEN 'reviewed'
    WHEN 'implemented' THEN 'implemented'
    WHEN 'bugged' THEN 'bugged'
    ELSE 'none'
  END`;
}

function getTableSql(db: GraphDatabase, tableName: string): string | null {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { sql: string } | undefined;
  return row?.sql ?? null;
}

function tableHasColumn(db: GraphDatabase, tableName: string, columnName: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === columnName);
}
