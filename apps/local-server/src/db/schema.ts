import type { GraphDatabase } from "./connection";

const GRAPH_NODES_SQL = `
  CREATE TABLE graph_nodes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('framework', 'module', 'website', 'ui_component', 'function', 'object', 'dependency', 'input', 'output', 'process', 'format', 'environment', 'config', 'secret', 'command', 'file', 'database', 'api', 'event', 'artifact', 'custom')),
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
    color TEXT NOT NULL DEFAULT '#727782',
    animated INTEGER NOT NULL DEFAULT 0,
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
    node_kind TEXT NOT NULL CHECK (node_kind IN ('framework', 'module', 'website', 'ui_component', 'function', 'object', 'dependency', 'input', 'output', 'process', 'format', 'environment', 'config', 'secret', 'command', 'file', 'database', 'api', 'event', 'artifact', 'custom')),
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

const GRAPH_TABLES = [
  "graph_boundary_tags",
  "graph_edge_tags",
  "graph_node_tags",
  "graph_node_reuses",
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
  "graph_edges",
  "graph_revisions",
  "graph_nodes",
  "custom_block_types",
  "workspace_settings",
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
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

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
      process_kind TEXT NOT NULL CHECK (process_kind IN ('transform', 'validate', 'route', 'persist', 'render', 'orchestrate', 'analyze')),
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

    CREATE TABLE IF NOT EXISTS agent_settings (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      agent_kind TEXT NOT NULL CHECK (agent_kind IN ('planning', 'coding', 'review', 'scanning')),
      provider TEXT NOT NULL DEFAULT 'fake' CHECK (provider IN ('fake', 'claudecode', 'openai', 'gemini', 'openrouter')),
      model TEXT NOT NULL DEFAULT '',
      parallel_limit INTEGER NOT NULL DEFAULT 4,
      api_key_source_type TEXT NOT NULL DEFAULT 'env' CHECK (api_key_source_type IN ('manual', 'file', 'env')),
      api_key_source_value TEXT NOT NULL DEFAULT '',
      system_prompt_source_type TEXT NOT NULL DEFAULT 'manual' CHECK (system_prompt_source_type IN ('manual', 'file')),
      system_prompt_source_value TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (project_id, agent_kind)
    );

    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      agent_kind TEXT NOT NULL CHECK (agent_kind IN ('planning', 'coding', 'review', 'scanning')),
      status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
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
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

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
  `);
  ensureWorkspaceSettingsTable(db);
  ensureGraphStatusHistoryTable(db);
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

function ensureGraphStatusHistoryTable(db: GraphDatabase): void {
  const sql = getTableSql(db, "graph_status_history");
  if (!sql || sql.includes("'implemented'")) {
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
    sql.includes("'ui_component'")
  ) {
    if (!tableHasColumn(db, "graph_nodes", "agent_status")) {
      db.exec("ALTER TABLE graph_nodes ADD COLUMN agent_status TEXT NOT NULL DEFAULT 'none';");
    }
    if (!sql.includes("'implemented'")) {
      rebuildGraphNodesTable(db);
    }
    return;
  }

  if (sql.includes("'custom'") && sql.includes("ui_width") && sql.includes("code_context") && sql.includes("custom_type_id")) {
    if (!tableHasColumn(db, "graph_nodes", "agent_status")) {
      db.exec("ALTER TABLE graph_nodes ADD COLUMN agent_status TEXT NOT NULL DEFAULT 'none';");
    }
    rebuildGraphNodesTable(db);
    return;
  }

  resetGraphStorage(db);
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
    if (!tableHasColumn(db, "graph_edges", "agent_status")) {
      db.exec("ALTER TABLE graph_edges ADD COLUMN agent_status TEXT NOT NULL DEFAULT 'none';");
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
  if (!sql.includes("'website'") || !sql.includes("'ui_component'")) {
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
    DROP TABLE IF EXISTS graph_edges;
    DROP TABLE IF EXISTS graph_revisions;
    DROP TABLE IF EXISTS code_proposals;
    DROP TABLE IF EXISTS graph_status_history;
    DROP TABLE IF EXISTS agent_messages;
    DROP TABLE IF EXISTS agent_runs;
    DROP TABLE IF EXISTS agent_settings;
    DROP TABLE IF EXISTS workspace_settings;
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
    ${GRAPH_NODE_REUSES_SQL}
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
      source_path, source_start_line, source_end_line, ui_x, ui_y,
      ui_width, ui_height, agent_status, created_at, updated_at
    )
    SELECT
      id, project_id, kind, name, summary,
      code_context, code_directory, code_start_line, code_end_line, language,
      parent_id, attached_to_id, custom_type_id,
      source_path, source_start_line, source_end_line, ui_x, ui_y,
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
  const hasAgentStatus = tableHasColumn(db, "graph_edges", "agent_status");
  db.pragma("foreign_keys = OFF");
  db.exec(`
    ALTER TABLE graph_edges RENAME TO graph_edges_old;
    ${GRAPH_EDGES_SQL}
    INSERT INTO graph_edges (id, project_id, kind, source_node_id, target_node_id, label, code_context, color, animated, agent_status, created_at)
    SELECT
      id, project_id, kind, source_node_id, target_node_id, label,
      ${hasCodeContext ? "code_context" : "''"},
      ${hasColor ? "color" : "'#727782'"},
      ${hasAnimated ? "animated" : "0"},
      ${hasAgentStatus ? normalizedStatusSql("agent_status") : "'none'"},
      created_at
    FROM graph_edges_old;
    DROP TABLE graph_edges_old;
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
