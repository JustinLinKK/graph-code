import {
  blockExecutionMetadataSchema,
  codingWorkUnitSchema,
  contextBudgetSchema,
  expectedOutputSchema,
  graphEdgeKindSchema,
  graphNodeKindSchema,
  interfaceContractSchema,
  sourceEvidenceRefSchema,
  sourceWriteScopeSchema,
  workflowRevisionSchema,
  workspaceRelativePathSchema
} from "@graphcode/graph-model";
import { z } from "zod";

export const WORK_UNIT_CONTEXT_COMPILER_VERSION = "ma3-context-v1";
export const WORK_UNIT_CONTEXT_SELECTION_POLICY_VERSION = "ma3-priority-v1";

export const workUnitContextNodeRoleSchema = z.enum(["owned", "halo", "ancestor", "test", "contract", "upstream"]);
export const workUnitContextEdgeRoleSchema = z.enum(["internal", "boundary", "dependency", "coordination", "evidence"]);
export const workUnitSourceRoleSchema = z.enum(["owned", "halo", "test"]);
export const workUnitSourceAvailabilitySchema = z.enum(["present", "unavailable", "stale"]);
export const workUnitContextOmissionReasonSchema = z.enum([
  "budget",
  "scale_policy",
  "relevance",
  "unavailable",
  "stale",
  "unsupported"
]);

export const workUnitContextNodeSchema = z.object({
  nodeId: z.string().min(1),
  kind: graphNodeKindSchema,
  name: z.string().min(1),
  summary: z.string(),
  role: workUnitContextNodeRoleSchema,
  selectionReason: z.string().min(1),
  evidence: z.array(sourceEvidenceRefSchema),
  estimatedTokens: z.number().int().nonnegative()
});

export const workUnitContextEdgeSchema = z.object({
  edgeId: z.string().min(1),
  kind: graphEdgeKindSchema,
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  label: z.string().nullable(),
  role: workUnitContextEdgeRoleSchema,
  selectionReason: z.string().min(1),
  estimatedTokens: z.number().int().nonnegative()
});

export const workUnitSourceExcerptSchema = z
  .object({
    path: workspaceRelativePathSchema,
    startLine: z.number().int().positive().nullable(),
    endLine: z.number().int().positive().nullable(),
    symbolId: z.string().min(1).nullable(),
    role: workUnitSourceRoleSchema,
    selectionReason: z.string().min(1),
    availability: workUnitSourceAvailabilitySchema,
    exact: z.boolean(),
    writable: z.boolean(),
    content: z.string(),
    fingerprint: z.string().min(1).nullable(),
    estimatedTokens: z.number().int().nonnegative()
  })
  .superRefine((source, context) => {
    if ((source.startLine === null) !== (source.endLine === null)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Source excerpts require both range endpoints or neither." });
    }
    if (source.startLine !== null && source.endLine !== null && source.endLine < source.startLine) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Source excerpt endLine cannot precede startLine." });
    }
    if (source.availability !== "present" && (source.content.length > 0 || source.fingerprint !== null)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Unavailable or stale excerpts cannot carry unverified content." });
    }
    if (source.availability === "present" && source.fingerprint === null) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Present source excerpts require a fingerprint." });
    }
  });

export const workUnitContextOmissionSchema = z.object({
  entityType: z.enum(["node", "edge", "source", "contract", "dependency", "test", "summary"]),
  entityId: z.string().min(1),
  reason: workUnitContextOmissionReasonSchema,
  required: z.boolean(),
  detail: z.string().min(1)
});

export const upstreamAcceptedSummarySchema = z.object({
  workUnitId: z.string().min(1),
  proposalId: z.string().min(1).nullable(),
  summary: z.string().min(1),
  acceptedRevision: workflowRevisionSchema,
  evidence: z.array(sourceEvidenceRefSchema),
  estimatedTokens: z.number().int().nonnegative()
});

export const workUnitExecutionContextSchema = z.object({
  nodeId: z.string().min(1),
  selectionReason: z.string().min(1),
  metadata: blockExecutionMetadataSchema,
  estimatedTokens: z.number().int().nonnegative()
});

export const workUnitContextTokenUsageSchema = z
  .object({
    sourceTokens: z.number().int().nonnegative(),
    graphTokens: z.number().int().nonnegative(),
    contractTokens: z.number().int().nonnegative(),
    dependencyTokens: z.number().int().nonnegative(),
    otherTokens: z.number().int().nonnegative(),
    renderingOverheadTokens: z.number().int().nonnegative(),
    estimatedInputTokens: z.number().int().nonnegative()
  })
  .superRefine((usage, context) => {
    const reconciled =
      usage.sourceTokens +
      usage.graphTokens +
      usage.contractTokens +
      usage.dependencyTokens +
      usage.otherTokens +
      usage.renderingOverheadTokens;
    if (reconciled !== usage.estimatedInputTokens) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Work-unit context token estimates must reconcile." });
    }
  });

export const workUnitContextSchema = z
  .object({
    schemaVersion: z.literal(1),
    compilerVersion: z.literal(WORK_UNIT_CONTEXT_COMPILER_VERSION),
    selectionPolicyVersion: z.literal(WORK_UNIT_CONTEXT_SELECTION_POLICY_VERSION),
    workflowId: z.string().min(1),
    projectId: z.string().min(1),
    workUnit: codingWorkUnitSchema,
    task: z.string().min(1),
    objective: z.string().min(1),
    scale: z.enum(["small", "medium", "large"]),
    revision: z.object({
      base: workflowRevisionSchema,
      observed: workflowRevisionSchema,
      indexState: z.enum(["complete", "partial", "stale", "indexing", "failed", "unavailable"]),
      warnings: z.array(z.string().min(1))
    }),
    allowedWrites: z.array(sourceWriteScopeSchema),
    nodes: z.array(workUnitContextNodeSchema),
    edges: z.array(workUnitContextEdgeSchema),
    sources: z.array(workUnitSourceExcerptSchema),
    contracts: z.array(interfaceContractSchema),
    upstreamAccepted: z.array(upstreamAcceptedSummarySchema),
    execution: z.array(workUnitExecutionContextSchema),
    architectureSummary: z.string().nullable(),
    omissions: z.array(workUnitContextOmissionSchema),
    outputRequirements: z.object({
      expected: z.array(expectedOutputSchema),
      responseFormat: z.string().min(1)
    }),
    budget: contextBudgetSchema,
    tokenUsage: workUnitContextTokenUsageSchema,
    provenance: z.object({
      compiledAt: z.string().datetime(),
      sourceReads: z.number().int().nonnegative(),
      scopedNodeCount: z.number().int().nonnegative(),
      scopedEdgeCount: z.number().int().nonnegative(),
      inputFingerprint: z.string().min(1)
    })
  })
  .superRefine((compiled, context) => {
    if (
      compiled.workflowId !== compiled.workUnit.workflowId ||
      compiled.projectId !== compiled.workUnit.projectId ||
      compiled.scale !== compiled.workUnit.selectedScale
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Compiled context identity and scale must match its work unit." });
    }
    if (JSON.stringify(compiled.allowedWrites) !== JSON.stringify(compiled.workUnit.plannedWriteScopes)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["allowedWrites"], message: "Compiled write authority must exactly match the work-unit plan." });
    }
    const nodeIds = new Set<string>();
    for (const node of compiled.nodes) {
      if (nodeIds.has(node.nodeId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["nodes"], message: `Duplicate compiled node ${node.nodeId}.` });
      nodeIds.add(node.nodeId);
    }
    const edgeIds = new Set<string>();
    for (const edge of compiled.edges) {
      if (edgeIds.has(edge.edgeId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["edges"], message: `Duplicate compiled edge ${edge.edgeId}.` });
      edgeIds.add(edge.edgeId);
    }
    for (const ownedNodeId of compiled.workUnit.ownedNodeIds) {
      if (!compiled.nodes.some((node) => node.nodeId === ownedNodeId && node.role === "owned")) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["nodes"], message: `Owned node ${ownedNodeId} is missing from compiled context.` });
      }
      const presentSource = compiled.sources.some(
        (source) => source.role === "owned" && source.symbolId === ownedNodeId && source.availability === "present" && source.exact
      );
      const visibleFailure = compiled.omissions.some(
        (omission) => omission.entityType === "source" && omission.entityId === ownedNodeId && omission.required && ["unavailable", "stale", "unsupported"].includes(omission.reason)
      );
      if (!presentSource && !visibleFailure) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["sources"], message: `Owned node ${ownedNodeId} requires exact source or a visible unavailable/stale reason.` });
      }
    }
    const uniqueFiles = new Set(compiled.sources.filter((source) => source.availability === "present").map((source) => source.path));
    if (uniqueFiles.size > compiled.budget.maxFiles) context.addIssue({ code: z.ZodIssueCode.custom, path: ["budget", "maxFiles"], message: "Compiled context exceeds its file budget." });
    if (compiled.nodes.length > compiled.budget.maxNodes) context.addIssue({ code: z.ZodIssueCode.custom, path: ["budget", "maxNodes"], message: "Compiled context exceeds its node budget." });
    if (compiled.edges.length > compiled.budget.maxEdges) context.addIssue({ code: z.ZodIssueCode.custom, path: ["budget", "maxEdges"], message: "Compiled context exceeds its edge budget." });
    if (compiled.tokenUsage.sourceTokens > compiled.budget.maxSourceTokens) context.addIssue({ code: z.ZodIssueCode.custom, path: ["budget", "maxSourceTokens"], message: "Compiled context exceeds its source-token budget." });
    if (compiled.tokenUsage.graphTokens > compiled.budget.maxGraphTokens) context.addIssue({ code: z.ZodIssueCode.custom, path: ["budget", "maxGraphTokens"], message: "Compiled context exceeds its graph-token budget." });
    if (compiled.tokenUsage.contractTokens > compiled.budget.maxContractTokens) context.addIssue({ code: z.ZodIssueCode.custom, path: ["budget", "maxContractTokens"], message: "Compiled context exceeds its contract-token budget." });
    if (compiled.tokenUsage.estimatedInputTokens > compiled.budget.maxInputTokens) context.addIssue({ code: z.ZodIssueCode.custom, path: ["budget", "maxInputTokens"], message: "Compiled context exceeds its total input-token budget." });
  });

export const renderedWorkUnitContextSchema = z.object({
  provider: z.enum(["generic", "openai", "anthropic", "google"]),
  purpose: z.enum(["coding", "review"]),
  systemPrompt: z.string().min(1),
  userPrompt: z.string().min(1),
  estimatedInputTokens: z.number().int().positive()
});

export const workUnitContextShadowComparisonSchema = z.object({
  workUnitId: z.string().min(1),
  isolatedPromptCharacters: z.number().int().nonnegative(),
  isolatedEstimatedTokens: z.number().int().nonnegative(),
  legacyCodingPromptCharacters: z.number().int().nonnegative(),
  legacyReviewPromptCharacters: z.number().int().nonnegative(),
  codingTokenReductionRatio: z.number(),
  reviewTokenReductionRatio: z.number(),
  fullProjectReadUsed: z.literal(false)
});

export const workUnitContextRetrievalRequestSchema = z
  .object({
    requestId: z.string().min(1),
    workUnitId: z.string().min(1),
    missingFact: z.string().min(1),
    reason: z.string().min(1),
    requestedNodeIds: z.array(z.string().min(1)).default([]),
    requestedSources: z
      .array(
        z
          .object({
            path: workspaceRelativePathSchema,
            startLine: z.number().int().positive().nullable(),
            endLine: z.number().int().positive().nullable(),
            intent: z.enum(["read", "write"]).default("read")
          })
          .superRefine((source, context) => {
            if ((source.startLine === null) !== (source.endLine === null)) {
              context.addIssue({ code: z.ZodIssueCode.custom, message: "Retrieval source ranges require both endpoints or neither." });
            }
            if (source.startLine !== null && source.endLine !== null && source.endLine < source.startLine) {
              context.addIssue({ code: z.ZodIssueCode.custom, message: "Retrieval source endLine cannot precede startLine." });
            }
          })
      )
      .default([]),
    remainingBudget: z.object({
      maxInputTokens: z.number().int().nonnegative(),
      maxSourceTokens: z.number().int().nonnegative(),
      maxGraphTokens: z.number().int().nonnegative(),
      maxContractTokens: z.number().int().nonnegative(),
      maxFiles: z.number().int().nonnegative(),
      maxNodes: z.number().int().nonnegative(),
      maxEdges: z.number().int().nonnegative()
    })
  })
  .superRefine((request, context) => {
    if (request.requestedNodeIds.length === 0 && request.requestedSources.length === 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "A retrieval request must name at least one node or source range." });
    }
    const nodeIds = new Set<string>();
    for (const nodeId of request.requestedNodeIds) {
      if (nodeIds.has(nodeId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["requestedNodeIds"], message: `Duplicate retrieval node ${nodeId}.` });
      nodeIds.add(nodeId);
    }
  });

export type WorkUnitContextNodeRole = z.infer<typeof workUnitContextNodeRoleSchema>;
export type WorkUnitContextEdgeRole = z.infer<typeof workUnitContextEdgeRoleSchema>;
export type WorkUnitSourceRole = z.infer<typeof workUnitSourceRoleSchema>;
export type WorkUnitContextNode = z.infer<typeof workUnitContextNodeSchema>;
export type WorkUnitContextEdge = z.infer<typeof workUnitContextEdgeSchema>;
export type WorkUnitSourceExcerpt = z.infer<typeof workUnitSourceExcerptSchema>;
export type WorkUnitContextOmission = z.infer<typeof workUnitContextOmissionSchema>;
export type UpstreamAcceptedSummary = z.infer<typeof upstreamAcceptedSummarySchema>;
export type WorkUnitExecutionContext = z.infer<typeof workUnitExecutionContextSchema>;
export type WorkUnitContext = z.infer<typeof workUnitContextSchema>;
export type RenderedWorkUnitContext = z.infer<typeof renderedWorkUnitContextSchema>;
export type WorkUnitContextShadowComparison = z.infer<typeof workUnitContextShadowComparisonSchema>;
export type WorkUnitContextRetrievalRequest = z.infer<typeof workUnitContextRetrievalRequestSchema>;
