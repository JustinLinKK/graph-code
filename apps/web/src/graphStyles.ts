import { EXTENSION_NODE_KIND_DEFINITIONS, type GraphNodeKind } from "@graphcode/graph-model";

type NodePaletteEntry = {
  label: string;
  className: string;
  accent: string;
};

const builtInNodePalette = {
  framework: {
    label: "Framework",
    className: "node-framework",
    accent: "#2563eb"
  },
  module: {
    label: "Module",
    className: "node-module",
    accent: "#059669"
  },
  website: {
    label: "Website",
    className: "node-website",
    accent: "#0284c7"
  },
  ui_component: {
    label: "UI Component",
    className: "node-ui-component",
    accent: "#db2777"
  },
  function: {
    label: "Function",
    className: "node-function",
    accent: "#7c3aed"
  },
  object: {
    label: "Object",
    className: "node-object",
    accent: "#ca8a04"
  },
  dependency: {
    label: "Dependency",
    className: "node-dependency",
    accent: "#dc2626"
  },
  input: {
    label: "Input",
    className: "node-input",
    accent: "#0891b2"
  },
  output: {
    label: "Output",
    className: "node-output",
    accent: "#ea580c"
  },
  process: {
    label: "Process",
    className: "node-process",
    accent: "#4f46e5"
  },
  format: {
    label: "Format",
    className: "node-format",
    accent: "#64748b"
  },
  environment: {
    label: "Env Var",
    className: "node-environment",
    accent: "#0f766e"
  },
  config: {
    label: "Config",
    className: "node-config",
    accent: "#9333ea"
  },
  secret: {
    label: "Secret",
    className: "node-secret",
    accent: "#be123c"
  },
  command: {
    label: "Command",
    className: "node-command",
    accent: "#334155"
  },
  file: {
    label: "File",
    className: "node-file",
    accent: "#2563eb"
  },
  database: {
    label: "Database",
    className: "node-database",
    accent: "#0d9488"
  },
  api: {
    label: "API",
    className: "node-api",
    accent: "#0284c7"
  },
  event: {
    label: "Event",
    className: "node-event",
    accent: "#c026d3"
  },
  artifact: {
    label: "Artifact",
    className: "node-artifact",
    accent: "#b45309"
  },
  custom: {
    label: "Custom",
    className: "node-custom",
    accent: "#475569"
  }
} satisfies Partial<Record<GraphNodeKind, NodePaletteEntry>>;

const extensionNodePalette = Object.fromEntries(
  EXTENSION_NODE_KIND_DEFINITIONS.map((definition) => [
    definition.kind,
    {
      label: definition.label,
      className: `node-${definition.kind.replaceAll("_", "-")}`,
      accent: definition.color
    }
  ])
) as Partial<Record<GraphNodeKind, NodePaletteEntry>>;

export const nodePalette = {
  ...builtInNodePalette,
  ...extensionNodePalette
} as Record<GraphNodeKind, NodePaletteEntry>;
