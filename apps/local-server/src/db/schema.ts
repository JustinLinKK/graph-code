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
  `);
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
    return;
  }

  if (sql.includes("'custom'") && sql.includes("ui_width") && sql.includes("code_context") && sql.includes("custom_type_id")) {
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
    return;
  }

  db.pragma("foreign_keys = OFF");
  db.exec(`
    ALTER TABLE graph_edges RENAME TO graph_edges_old;
    ${GRAPH_EDGES_SQL}
    INSERT INTO graph_edges (id, project_id, kind, source_node_id, target_node_id, label, code_context, color, animated, created_at)
    SELECT id, project_id, kind, source_node_id, target_node_id, label, '', '#727782', 0, created_at
    FROM graph_edges_old;
    DROP TABLE graph_edges_old;
  `);
  db.pragma("foreign_keys = ON");
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
      ui_width, ui_height, created_at, updated_at
    )
    SELECT
      id, project_id, kind, name, summary,
      code_context, code_directory, code_start_line, code_end_line, language,
      parent_id, attached_to_id, custom_type_id,
      source_path, source_start_line, source_end_line, ui_x, ui_y,
      ui_width, ui_height, created_at, updated_at
    FROM graph_nodes;
    DROP TABLE graph_nodes;
    ALTER TABLE graph_nodes_new RENAME TO graph_nodes;
  `);
  db.pragma("foreign_keys = ON");
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
