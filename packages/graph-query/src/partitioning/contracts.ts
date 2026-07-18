import {
  AGENT_SCALES,
  GRAPH_EDGE_KINDS,
  contextBudgetSchema,
  graphEdgeSchema,
  graphNodeSchema,
  workflowEdgeClassificationSchema,
  workflowRevisionSchema,
  type ContextBudget,
  type GraphEdgeKind,
  type InterfaceContract,
  type RoutingFeatures
} from "@graphcode/graph-model";
import { z } from "zod";

export const PARTITION_POLICY_VERSION = "deterministic-v1";

export const partitionBudgetPolicySchema = z.object({
  maxSubgraphNodes: z.number().int().positive().default(512),
  maxSubgraphEdges: z.number().int().positive().default(2048),
  maxPartitions: z.number().int().positive().default(128),
  maxHaloNodesPerUnit: z.number().int().nonnegative().default(12),
  smallMergeTokenLimit: z.number().int().positive().default(8000),
  mediumPartitionTokenLimit: z.number().int().positive().default(28000),
  highCouplingWeight: z.number().positive().default(2),
  contextBudgets: z.object({
    small: contextBudgetSchema,
    medium: contextBudgetSchema,
    large: contextBudgetSchema
  })
});

export const workflowEdgeRuleSchema = z.object({
  classification: workflowEdgeClassificationSchema,
  weight: z.number().positive(),
  contractKind: z
    .enum(["signature", "schema", "protocol", "data_flow", "side_effect", "error_behavior", "ordering", "other"])
    .nullable(),
  reason: z.string().min(1)
});

export const workflowEdgePolicySchema = z
  .object({
    version: z.string().min(1).default(PARTITION_POLICY_VERSION),
    edgeRules: z.record(workflowEdgeRuleSchema).default({}),
    informationalIgnoreKinds: z.array(z.enum(GRAPH_EDGE_KINDS)).default(["impacts"])
  })
  .superRefine((policy, context) => {
    for (const edgeKind of Object.keys(policy.edgeRules)) {
      if (!(GRAPH_EDGE_KINDS as readonly string[]).includes(edgeKind)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["edgeRules", edgeKind], message: `Unsupported graph edge kind policy: ${edgeKind}.` });
      }
    }
  });

export const partitionHumanConstraintsSchema = z.object({
  keepTogetherNodeGroups: z.array(z.array(z.string().min(1)).min(2)).default([]),
  separateNodePairs: z.array(z.tuple([z.string().min(1), z.string().min(1)])).default([]),
  explicitDependencies: z
    .array(
      z.object({
        beforeNodeId: z.string().min(1),
        afterNodeId: z.string().min(1),
        reason: z.string().min(1)
      })
    )
    .default([]),
  requestedInterfaceChangeEdgeIds: z.array(z.string().min(1)).default([]),
  approvedIgnoredEdges: z
    .array(
      z.object({
        edgeId: z.string().min(1),
        reason: z.string().min(1),
        approvedBy: z.enum(["policy", "user"]).default("user"),
        approvalReference: z.string().min(1)
      })
    )
    .default([])
});

export const partitionTargetHintSchema = z.object({
  nodeId: z.string().min(1),
  recommendedScale: z.enum(AGENT_SCALES),
  selectedScale: z.enum(AGENT_SCALES),
  reason: z.string().min(1),
  override: z
    .object({
      actor: z.enum(["user", "policy"]),
      reason: z.string().min(1)
    })
    .nullable()
    .default(null)
});

export const graphPartitionInputSchema = z
  .object({
    workflowId: z.string().min(1),
    projectId: z.string().min(1),
    revision: workflowRevisionSchema,
    indexState: z.enum(["complete", "partial", "stale", "indexing", "failed", "unavailable"]),
    scopeNodeId: z.string().min(1),
    targetNodeIds: z.array(z.string().min(1)).min(1),
    targetHints: z.array(partitionTargetHintSchema).default([]),
    task: z.string().min(1),
    nodes: z.array(graphNodeSchema).min(1),
    edges: z.array(graphEdgeSchema),
    maximumConcurrency: z.number().int().positive(),
    budgets: partitionBudgetPolicySchema,
    policy: workflowEdgePolicySchema.default({}),
    constraints: partitionHumanConstraintsSchema.default({})
  })
  .superRefine((input, context) => {
    const nodeIds = new Set<string>();
    for (const node of input.nodes) {
      if (nodeIds.has(node.id)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["nodes"], message: `Duplicate partition input node ${node.id}.` });
      }
      nodeIds.add(node.id);
      if (node.projectId !== input.projectId) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["nodes", node.id], message: `Node ${node.id} belongs to another project.` });
      }
    }
    if (!nodeIds.has(input.scopeNodeId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["scopeNodeId"], message: "Partition scope node is missing from the scoped graph." });
    }
    const targetIds = new Set<string>();
    for (const nodeId of input.targetNodeIds) {
      if (!nodeIds.has(nodeId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["targetNodeIds"], message: `Partition target node ${nodeId} is missing.` });
      }
      if (targetIds.has(nodeId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["targetNodeIds"], message: `Duplicate partition target node ${nodeId}.` });
      }
      targetIds.add(nodeId);
    }
    if (targetIds.size > input.budgets.maxSubgraphNodes) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["budgets", "maxSubgraphNodes"], message: "The node budget cannot contain all required target nodes." });
    }
    const edgeIds = new Set<string>();
    for (const edge of input.edges) {
      if (edgeIds.has(edge.id)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["edges"], message: `Duplicate partition input edge ${edge.id}.` });
      }
      edgeIds.add(edge.id);
      if (edge.projectId !== input.projectId || !nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["edges", edge.id], message: `Edge ${edge.id} must resolve inside the scoped project graph.` });
      }
    }
    const hintedNodeIds = new Set<string>();
    for (const hint of input.targetHints) {
      if (!targetIds.has(hint.nodeId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["targetHints"], message: `Target hint ${hint.nodeId} is not a target node.` });
      }
      if (hintedNodeIds.has(hint.nodeId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["targetHints"], message: `Duplicate target hint ${hint.nodeId}.` });
      }
      hintedNodeIds.add(hint.nodeId);
    }
    for (const group of input.constraints.keepTogetherNodeGroups) {
      if (group.some((nodeId) => !targetIds.has(nodeId))) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["constraints", "keepTogetherNodeGroups"], message: "Keep-together constraints may reference target nodes only." });
      }
    }
    for (const [left, right] of input.constraints.separateNodePairs) {
      if (!targetIds.has(left) || !targetIds.has(right) || left === right) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["constraints", "separateNodePairs"], message: "Separate-node constraints must reference two distinct target nodes." });
      }
    }
    for (const dependency of input.constraints.explicitDependencies) {
      if (!targetIds.has(dependency.beforeNodeId) || !targetIds.has(dependency.afterNodeId) || dependency.beforeNodeId === dependency.afterNodeId) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["constraints", "explicitDependencies"], message: "Explicit dependencies must reference two distinct target nodes." });
      }
    }
    for (const edgeId of [
      ...input.constraints.requestedInterfaceChangeEdgeIds,
      ...input.constraints.approvedIgnoredEdges.map((edge) => edge.edgeId)
    ]) {
      if (!edgeIds.has(edgeId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["constraints"], message: `Constraint references missing edge ${edgeId}.` });
      }
    }
  });

export type PartitionBudgetPolicy = z.infer<typeof partitionBudgetPolicySchema>;
export type WorkflowEdgeRule = z.infer<typeof workflowEdgeRuleSchema>;
export type WorkflowEdgePolicy = z.infer<typeof workflowEdgePolicySchema>;
export type PartitionHumanConstraints = z.infer<typeof partitionHumanConstraintsSchema>;
export type PartitionTargetHint = z.infer<typeof partitionTargetHintSchema>;
export type GraphPartitionInput = z.infer<typeof graphPartitionInputSchema>;

export type MutablePartition = {
  id: string;
  kind: "leaf" | "integration";
  title: string;
  objective: string;
  ownedNodeIds: string[];
  parentWorkUnitId: string | null;
  dependencyWorkUnitIds: Set<string>;
  coordinationWorkUnitIds: Set<string>;
  estimatedTokens: number;
  recommendedScale: (typeof AGENT_SCALES)[number];
  selectedScale: (typeof AGENT_SCALES)[number];
  routingReason: string;
  contextBudget: ContextBudget;
};

export type ClassifiedPartitionEdge = {
  edgeId: string;
  sourceWorkUnitId: string | null;
  targetWorkUnitId: string | null;
  classification: z.infer<typeof workflowEdgeClassificationSchema>;
  reason: string;
  weight: number;
  contractKind: InterfaceContract["contractKind"] | null;
  cut: boolean;
};

export const DEFAULT_CONTEXT_BUDGETS: Record<(typeof AGENT_SCALES)[number], ContextBudget> = {
  small: { maxInputTokens: 16000, maxSourceTokens: 8000, maxGraphTokens: 4000, maxContractTokens: 2000, maxFiles: 4, maxNodes: 64, maxEdges: 128 },
  medium: { maxInputTokens: 48000, maxSourceTokens: 28000, maxGraphTokens: 10000, maxContractTokens: 6000, maxFiles: 16, maxNodes: 256, maxEdges: 512 },
  large: { maxInputTokens: 128000, maxSourceTokens: 76000, maxGraphTokens: 28000, maxContractTokens: 16000, maxFiles: 64, maxNodes: 1024, maxEdges: 2048 }
};

export const DEFAULT_PARTITION_BUDGETS: PartitionBudgetPolicy = {
  maxSubgraphNodes: 512,
  maxSubgraphEdges: 2048,
  maxPartitions: 128,
  maxHaloNodesPerUnit: 12,
  smallMergeTokenLimit: 8000,
  mediumPartitionTokenLimit: 28000,
  highCouplingWeight: 2,
  contextBudgets: DEFAULT_CONTEXT_BUDGETS
};

export const DEFAULT_EDGE_RULES: Record<GraphEdgeKind, WorkflowEdgeRule> = {
  calls: { classification: "coordinates_with", weight: 3, contractKind: "signature", reason: "Call relationships coordinate producer and consumer contracts." },
  imports: { classification: "read_context", weight: 2, contractKind: "signature", reason: "Imports provide read context unless the imported interface changes." },
  uses: { classification: "read_context", weight: 2, contractKind: "signature", reason: "Use relationships provide read context unless the consumed interface changes." },
  owns: { classification: "requires_before", weight: 3, contractKind: "ordering", reason: "Owned child implementation precedes owner integration." },
  impacts: { classification: "informational", weight: 1, contractKind: null, reason: "Impact edges are verification evidence rather than coding order by default." },
  flows: { classification: "coordinates_with", weight: 3, contractKind: "data_flow", reason: "Flow edges coordinate data producers and consumers." },
  describes_format: { classification: "coordinates_with", weight: 3, contractKind: "schema", reason: "Format edges coordinate schema compatibility." }
};

export function defaultWorkflowEdgePolicy(): WorkflowEdgePolicy {
  return { version: PARTITION_POLICY_VERSION, edgeRules: {}, informationalIgnoreKinds: ["impacts"] };
}

export function effectiveEdgeRule(policy: WorkflowEdgePolicy, edgeKind: GraphEdgeKind): WorkflowEdgeRule {
  return policy.edgeRules[edgeKind] ?? DEFAULT_EDGE_RULES[edgeKind];
}

export function scaleForEstimatedTokens(tokens: number, budgets: PartitionBudgetPolicy): (typeof AGENT_SCALES)[number] {
  if (tokens <= budgets.smallMergeTokenLimit) return "small";
  if (tokens <= budgets.mediumPartitionTokenLimit) return "medium";
  return "large";
}

export function defaultRoutingIndexFeatures(indexState: GraphPartitionInput["indexState"]): Pick<RoutingFeatures, "indexState" | "risks"> {
  return { indexState, risks: indexState === "complete" ? [] : ["incomplete_index"] };
}
