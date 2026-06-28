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
export const PROCESS_KINDS = ["transform", "validate", "route", "persist", "render", "orchestrate", "analyze"] as const;
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

export const graphNodeKindSchema = z.enum(GRAPH_NODE_KINDS);
export const domainNodeKindSchema = z.enum(DOMAIN_NODE_KINDS);
export const basicNodeKindSchema = z.enum(BASIC_NODE_KINDS);
export const attachmentNodeKindSchema = z.enum(ATTACHMENT_NODE_KINDS);
export const graphEdgeKindSchema = z.enum(GRAPH_EDGE_KINDS);
export const dependencyKindSchema = z.enum(DEPENDENCY_KINDS);
export const ioKindSchema = z.enum(IO_KINDS);
export const processKindSchema = z.enum(PROCESS_KINDS);
export const formatKindSchema = z.enum(FORMAT_KINDS);
export const basicDetailNodeKindSchema = z.enum(BASIC_DETAIL_NODE_KINDS);
export const languageTypeSchema = z.enum(LANGUAGE_TYPES);

export type GraphNodeKind = z.infer<typeof graphNodeKindSchema>;
export type DomainNodeKind = z.infer<typeof domainNodeKindSchema>;
export type BasicNodeKind = z.infer<typeof basicNodeKindSchema>;
export type AttachmentNodeKind = z.infer<typeof attachmentNodeKindSchema>;
export type GraphEdgeKind = z.infer<typeof graphEdgeKindSchema>;
export type DependencyKind = z.infer<typeof dependencyKindSchema>;
export type IoKind = z.infer<typeof ioKindSchema>;
export type ProcessKind = z.infer<typeof processKindSchema>;
export type FormatKind = z.infer<typeof formatKindSchema>;
export type BasicDetailNodeKind = z.infer<typeof basicDetailNodeKindSchema>;
export type LanguageType = z.infer<typeof languageTypeSchema>;

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
  createdAt: z.string(),
  updatedAt: z.string()
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
  animated: z.boolean().optional()
});

export const edgeUpdateSchema = edgeMutationSchema.partial().extend({
  kind: graphEdgeKindSchema.optional()
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
  createIfMissing: z.boolean().optional()
});

export type OpenWorkspaceResult =
  | {
      status: "opened" | "created";
      project: Project;
      graphcodePath: string;
    }
  | {
      status: "missing_graphcode";
      rootPath: string;
      graphcodePath: string;
      message: string;
    };

export type Project = z.infer<typeof projectSchema>;
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
