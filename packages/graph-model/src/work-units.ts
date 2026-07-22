import { z } from "zod";

export const AGENT_SCALES = ["small", "medium", "large"] as const;
export const WORK_UNIT_STATUSES = [
  "draft",
  "pending",
  "ready",
  "running",
  "proposed",
  "validating",
  "conflicted",
  "accepted",
  "applied",
  "blocked",
  "stale",
  "skipped",
  "failed",
  "cancelled"
] as const;
export const WORKFLOW_EDGE_CLASSIFICATIONS = ["requires_before", "coordinates_with", "read_context", "write_conflict", "informational"] as const;
export const INTERFACE_CONTRACT_KINDS = [
  "signature",
  "schema",
  "protocol",
  "data_flow",
  "side_effect",
  "error_behavior",
  "ordering",
  "other"
] as const;
export const INTEGRATION_CHECK_KINDS = [
  "actual_write_set",
  "write_authorization",
  "stale_revision",
  "overlap_conflict",
  "interface_contract",
  "combined_patch",
  "targeted_checks"
] as const;

const WORK_UNIT_GRAPH_EDGE_KINDS = ["calls", "imports", "uses", "owns", "impacts", "flows", "describes_format"] as const;

export const agentScaleSchema = z.enum(AGENT_SCALES);
export const workUnitStatusSchema = z.enum(WORK_UNIT_STATUSES);
export const workflowEdgeClassificationSchema = z.enum(WORKFLOW_EDGE_CLASSIFICATIONS);
export const interfaceContractKindSchema = z.enum(INTERFACE_CONTRACT_KINDS);
export const integrationCheckKindSchema = z.enum(INTEGRATION_CHECK_KINDS);

export const codingWorkflowPartitionConstraintsSchema = z.object({
  keepTogetherNodeGroups: z.array(z.array(z.string().min(1)).min(2)).default([]),
  separateNodePairs: z.array(z.tuple([z.string().min(1), z.string().min(1)])).default([]),
  approvedIgnoredEdges: z.array(z.object({
    edgeId: z.string().min(1),
    reason: z.string().min(1),
    approvedBy: z.literal("user").default("user"),
    approvalReference: z.string().min(1)
  })).default([])
});

export const codingWorkflowExecutionPolicySchema = z.object({
  maximumConcurrency: z.number().int().min(1).max(32).default(4),
  maxEstimatedCost: z.number().nonnegative().nullable().default(null),
  currency: z.string().min(1).default("USD")
});

export const workspaceRelativePathSchema = z
  .string()
  .trim()
  .min(1)
  .superRefine((value, context) => {
    const segments = value.split("/");
    if (
      value.includes("\\") ||
      value.startsWith("/") ||
      /^[A-Za-z]:\//.test(value) ||
      value.startsWith("./") ||
      value.endsWith("/") ||
      value.includes("//") ||
      segments.some((segment) => segment === "." || segment === ".." || segment.length === 0)
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Source paths must be normalized workspace-relative paths." });
    }
  });

export const contextBudgetSchema = z.object({
  maxInputTokens: z.number().int().positive(),
  maxSourceTokens: z.number().int().nonnegative(),
  maxGraphTokens: z.number().int().nonnegative(),
  maxContractTokens: z.number().int().nonnegative(),
  maxFiles: z.number().int().positive(),
  maxNodes: z.number().int().positive(),
  maxEdges: z.number().int().positive()
});

export const sourceWriteScopeSchema = z
  .object({
    path: workspaceRelativePathSchema,
    startLine: z.number().int().positive().nullable(),
    endLine: z.number().int().positive().nullable(),
    symbolId: z.string().min(1).nullable(),
    permission: z.enum(["edit", "create", "delete", "rename"])
  })
  .superRefine((scope, context) => {
    if ((scope.startLine === null) !== (scope.endLine === null)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Write-scope line ranges must provide both endpoints or neither." });
    }
    if (scope.startLine !== null && scope.endLine !== null && scope.endLine < scope.startLine) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Write-scope endLine cannot precede startLine." });
    }
  });

export const expectedOutputSchema = z.object({
  kind: z.enum(["diff", "test", "contract", "artifact", "summary"]),
  description: z.string().min(1),
  required: z.boolean(),
  path: workspaceRelativePathSchema.nullable().default(null)
});

export const workflowRevisionSchema = z
  .object({
    indexRevision: z.string().min(1).nullable(),
    workspaceRevision: z.string().min(1).nullable(),
    graphRevision: z.number().int().nonnegative(),
    sourceHashes: z.record(z.string().min(1)),
    contextCompilerVersion: z.string().min(1),
    routingFeatureVersion: z.string().min(1),
    capturedAt: z.string().datetime()
  })
  .superRefine((revision, context) => {
    for (const sourcePath of Object.keys(revision.sourceHashes)) {
      if (!workspaceRelativePathSchema.safeParse(sourcePath).success) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sourceHashes", sourcePath],
          message: "Source hash keys must be normalized workspace-relative paths."
        });
      }
    }
  });

export const sourceEvidenceRefSchema = z
  .object({
    path: workspaceRelativePathSchema,
    startLine: z.number().int().positive().nullable(),
    endLine: z.number().int().positive().nullable(),
    symbolId: z.string().min(1).nullable(),
    origin: z.enum(["parser", "graph", "source", "user", "model"]),
    fingerprint: z.string().min(1).nullable().default(null)
  })
  .superRefine((evidence, context) => {
    if ((evidence.startLine === null) !== (evidence.endLine === null)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Evidence line ranges must provide both endpoints or neither." });
    }
    if (evidence.startLine !== null && evidence.endLine !== null && evidence.endLine < evidence.startLine) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Evidence endLine cannot precede startLine." });
    }
  });

export const contractSnapshotSchema = z.object({
  formatVersion: z.literal(1),
  summary: z.string(),
  normalizedValue: z.string(),
  fingerprint: z.string().min(1),
  metadata: z.record(z.unknown()).default({})
});

export const interfaceContractSchema = z
  .object({
    id: z.string().min(1),
    workflowId: z.string().min(1),
    edgeId: z.string().min(1),
    edgeKind: z.enum(WORK_UNIT_GRAPH_EDGE_KINDS),
    producerWorkUnitId: z.string().min(1),
    consumerWorkUnitId: z.string().min(1),
    direction: z.enum(["producer_to_consumer", "bidirectional"]),
    subjectNodeIds: z.array(z.string().min(1)),
    contractKind: interfaceContractKindSchema,
    baseline: contractSnapshotSchema,
    proposed: contractSnapshotSchema.nullable(),
    status: z.enum(["stable", "proposed_change", "accepted", "conflicted", "invalid"]),
    evidence: z.array(sourceEvidenceRefSchema)
  })
  .superRefine((contract, context) => {
    if (contract.producerWorkUnitId === contract.consumerWorkUnitId) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Interface contracts must cross two work units." });
    }
    addDuplicateIssues(contract.subjectNodeIds, context, ["subjectNodeIds"], "subject node");
  });

export const routingFeaturesSchema = z.object({
  ownedSymbolCount: z.number().int().nonnegative(),
  estimatedSourceTokens: z.number().int().nonnegative(),
  controlFlowComplexity: z.number().nonnegative().nullable(),
  cutEdgeCount: z.number().int().nonnegative(),
  cutEdgeWeight: z.number().nonnegative(),
  crossFileRelationshipCount: z.number().int().nonnegative(),
  crossPackageRelationshipCount: z.number().int().nonnegative(),
  upstreamWorkUnitCount: z.number().int().nonnegative(),
  downstreamWorkUnitCount: z.number().int().nonnegative(),
  interfaceChangeRequested: z.boolean(),
  publicApiInvolvement: z.boolean(),
  sharedStateInvolvement: z.boolean(),
  testAvailability: z.enum(["available", "missing", "unknown"]),
  blastRadius: z.enum(["local", "module", "cross_package", "repository"]),
  languageConfidence: z.number().min(0).max(1).nullable(),
  indexState: z.enum(["complete", "partial", "stale", "indexing", "failed", "unavailable"]),
  taskAmbiguity: z.enum(["low", "medium", "high", "unknown"]),
  planningConfidence: z.number().min(0).max(1).nullable(),
  risks: z.array(z.enum(["generated_file", "configuration", "security", "migration", "concurrency", "public_contract", "shared_state", "cross_file", "cross_package", "incomplete_index"]))
});

export const modelRoutingDecisionSchema = z.object({
  id: z.string().min(1),
  workUnitId: z.string().min(1),
  recommendedScale: agentScaleSchema,
  selectedScale: agentScaleSchema,
  featureVersion: z.string().min(1),
  features: routingFeaturesSchema,
  reasons: z.array(z.string().min(1)).min(1),
  estimatedInputTokens: z.number().int().nonnegative(),
  estimatedOutputTokens: z.number().int().nonnegative(),
  estimatedCost: z.number().nonnegative().nullable(),
  assignment: z
    .object({
      providerId: z.string().min(1),
      modelId: z.string().min(1),
      maxConcurrency: z.number().int().positive(),
      inputPricePerMillion: z.number().nonnegative().nullable(),
      outputPricePerMillion: z.number().nonnegative().nullable(),
      currency: z.string().min(1)
    })
    .optional(),
  metrics: z
    .object({
      actualInputTokens: z.number().int().nonnegative(),
      actualOutputTokens: z.number().int().nonnegative(),
      actualCost: z.number().nonnegative().nullable(),
      latencyMs: z.number().nonnegative(),
      retryCount: z.number().int().nonnegative(),
      escalationCount: z.number().int().nonnegative(),
      integrationFailureCount: z.number().int().nonnegative(),
      acceptanceOutcome: z.enum(["pending", "accepted", "rejected", "failed", "cancelled"]),
      testOutcome: z.enum(["not_run", "passed", "failed", "skipped"])
    })
    .optional(),
  override: z
    .object({
      actor: z.enum(["user", "policy"]),
      reason: z.string().min(1)
    })
    .nullable()
});

export const codingWorkUnitSchema = z
  .object({
    id: z.string().min(1),
    workflowId: z.string().min(1),
    projectId: z.string().min(1),
    parentWorkUnitId: z.string().min(1).nullable(),
    layerIndex: z.number().int().nonnegative(),
    title: z.string().min(1),
    objective: z.string().min(1),
    ownedNodeIds: z.array(z.string().min(1)),
    readHaloNodeIds: z.array(z.string().min(1)),
    boundaryEdgeIds: z.array(z.string().min(1)),
    dependencyWorkUnitIds: z.array(z.string().min(1)),
    coordinationWorkUnitIds: z.array(z.string().min(1)),
    plannedWriteScopes: z.array(sourceWriteScopeSchema),
    expectedOutputs: z.array(expectedOutputSchema),
    recommendedScale: agentScaleSchema,
    selectedScale: agentScaleSchema,
    routingDecisionId: z.string().min(1),
    contextBudget: contextBudgetSchema,
    baseRevision: workflowRevisionSchema,
    status: workUnitStatusSchema
  })
  .superRefine((unit, context) => {
    addDuplicateIssues(unit.ownedNodeIds, context, ["ownedNodeIds"], "owned node");
    addDuplicateIssues(unit.readHaloNodeIds, context, ["readHaloNodeIds"], "read-halo node");
    addDuplicateIssues(unit.boundaryEdgeIds, context, ["boundaryEdgeIds"], "boundary edge");
    addDuplicateIssues(unit.dependencyWorkUnitIds, context, ["dependencyWorkUnitIds"], "dependency");
    addDuplicateIssues(unit.coordinationWorkUnitIds, context, ["coordinationWorkUnitIds"], "coordination unit");
    const owned = new Set(unit.ownedNodeIds);
    if (unit.readHaloNodeIds.some((nodeId) => owned.has(nodeId))) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Owned and read-halo node IDs cannot overlap." });
    }
    if (unit.dependencyWorkUnitIds.includes(unit.id) || unit.coordinationWorkUnitIds.includes(unit.id) || unit.parentWorkUnitId === unit.id) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "A work unit cannot reference itself as a parent, dependency, or coordination unit." });
    }
  });

export const workUnitBoundaryEdgeSchema = z.object({
  id: z.string().min(1),
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  kind: z.enum(WORK_UNIT_GRAPH_EDGE_KINDS)
});

export const partitionOmissionSchema = z.object({
  entityType: z.enum(["node", "edge"]),
  entityId: z.string().min(1),
  reason: z.enum(["relevance", "budget", "unsupported", "stale", "index_incomplete"]),
  detail: z.string().min(1)
});

export const partitionEdgeClassificationSchema = z.object({
  edgeId: z.string().min(1),
  sourceWorkUnitId: z.string().min(1).nullable(),
  targetWorkUnitId: z.string().min(1).nullable(),
  classification: workflowEdgeClassificationSchema,
  reason: z.string().min(1),
  weight: z.number().positive(),
  cut: z.boolean()
});

export const ignoredPartitionEdgeSchema = z.object({
  id: z.string().min(1),
  edgeId: z.string().min(1),
  classification: workflowEdgeClassificationSchema,
  reason: z.string().min(1),
  approvedBy: z.enum(["policy", "user"]),
  approvalReference: z.string().min(1)
});

export const partitionSccResolutionSchema = z.object({
  memberWorkUnitIds: z.array(z.string().min(1)).min(2),
  resolution: z.enum(["merged", "coordinated_integration"]),
  integrationWorkUnitId: z.string().min(1).nullable()
});

export const partitioningDiagnosticsSchema = z
  .object({
    policyVersion: z.string().min(1),
    inputHash: z.string().min(1),
    scopeNodeId: z.string().min(1),
    targetNodeIds: z.array(z.string().min(1)).min(1),
    includedNodeIds: z.array(z.string().min(1)),
    includedEdgeIds: z.array(z.string().min(1)),
    omissions: z.array(partitionOmissionSchema),
    edgeClassifications: z.array(partitionEdgeClassificationSchema),
    ignoredEdges: z.array(ignoredPartitionEdgeSchema),
    sccResolutions: z.array(partitionSccResolutionSchema),
    estimatedTokensByWorkUnit: z.record(z.number().int().nonnegative()),
    totalEstimatedTokens: z.number().int().nonnegative(),
    internalRelationshipEdges: z.number().int().nonnegative(),
    cutRelationshipEdges: z.number().int().nonnegative(),
    relatedEdgeLocalityRatio: z.number().min(0).max(1)
  })
  .superRefine((diagnostics, context) => {
    for (const [values, label, path] of [
      [diagnostics.targetNodeIds, "target node", "targetNodeIds"],
      [diagnostics.includedNodeIds, "included node", "includedNodeIds"],
      [diagnostics.includedEdgeIds, "included edge", "includedEdgeIds"]
    ] as const) {
      addDuplicateIssues([...values], context, [path], label);
    }
    const reconciledTokens = Object.values(diagnostics.estimatedTokensByWorkUnit).reduce((total, value) => total + value, 0);
    if (reconciledTokens !== diagnostics.totalEstimatedTokens) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Partition token estimates do not reconcile to the reported total." });
    }
    const relationshipTotal = diagnostics.internalRelationshipEdges + diagnostics.cutRelationshipEdges;
    const expectedRatio = relationshipTotal === 0 ? 1 : diagnostics.internalRelationshipEdges / relationshipTotal;
    if (Math.abs(expectedRatio - diagnostics.relatedEdgeLocalityRatio) > 1e-9) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Partition relationship-locality metrics do not reconcile." });
    }
  });

export const codingWorkflowOrchestrationSchema = z
  .object({
    schemaVersion: z.literal(1),
    featureVersion: z.string().min(1),
    workflowId: z.string().min(1),
    projectId: z.string().min(1),
    revision: workflowRevisionSchema,
    workUnits: z.array(codingWorkUnitSchema),
    boundaryEdges: z.array(workUnitBoundaryEdgeSchema),
    interfaceContracts: z.array(interfaceContractSchema),
    routingDecisions: z.array(modelRoutingDecisionSchema),
    partitionConstraints: codingWorkflowPartitionConstraintsSchema.optional(),
    executionPolicy: codingWorkflowExecutionPolicySchema.optional(),
    warnings: z.array(z.string()),
    partitioning: partitioningDiagnosticsSchema.optional()
  })
  .superRefine((graph, context) => {
    const unitsById = uniqueById(graph.workUnits, context, ["workUnits"], "work unit");
    const edgesById = uniqueById(graph.boundaryEdges, context, ["boundaryEdges"], "boundary edge");
    const decisionsById = uniqueById(graph.routingDecisions, context, ["routingDecisions"], "routing decision");
    uniqueById(graph.interfaceContracts, context, ["interfaceContracts"], "interface contract");
    const ownerByNodeId = new Map<string, string>();
    const childrenByUnitId = new Map<string, string[]>();
    const decisionByWorkUnitId = new Map<string, string>();

    for (const decision of graph.routingDecisions) {
      const existing = decisionByWorkUnitId.get(decision.workUnitId);
      if (existing) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["routingDecisions", decision.id],
          message: `Work unit ${decision.workUnitId} has multiple routing decisions.`
        });
      } else {
        decisionByWorkUnitId.set(decision.workUnitId, decision.id);
      }
      if (!unitsById.has(decision.workUnitId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["routingDecisions", decision.id],
          message: `Routing decision references missing work unit ${decision.workUnitId}.`
        });
      }
    }

    for (const unit of graph.workUnits) {
      if (unit.workflowId !== graph.workflowId || unit.projectId !== graph.projectId) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["workUnits", unit.id], message: "Work units must belong to the orchestration workflow and project." });
      }
      if (!sameRevision(unit.baseRevision, graph.revision)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["workUnits", unit.id, "baseRevision"], message: "Work-unit revisions must match the orchestration revision." });
      }
      for (const nodeId of unit.ownedNodeIds) {
        const owner = ownerByNodeId.get(nodeId);
        if (owner && owner !== unit.id) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ["workUnits", unit.id, "ownedNodeIds"], message: `Duplicate ownership for node ${nodeId}.` });
        } else {
          ownerByNodeId.set(nodeId, unit.id);
        }
      }
      if (unit.parentWorkUnitId) {
        if (!unitsById.has(unit.parentWorkUnitId)) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ["workUnits", unit.id, "parentWorkUnitId"], message: `Dangling parent work unit ${unit.parentWorkUnitId}.` });
        } else {
          const children = childrenByUnitId.get(unit.parentWorkUnitId) ?? [];
          children.push(unit.id);
          childrenByUnitId.set(unit.parentWorkUnitId, children);
        }
      }
      for (const dependencyId of unit.dependencyWorkUnitIds) {
        const dependency = unitsById.get(dependencyId);
        if (!dependency) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ["workUnits", unit.id, "dependencyWorkUnitIds"], message: `Dangling dependency ${dependencyId}.` });
        } else if (dependency.layerIndex >= unit.layerIndex) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ["workUnits", unit.id, "dependencyWorkUnitIds"], message: `Dependency ${dependencyId} must be in an earlier layer.` });
        }
      }
      for (const coordinationId of unit.coordinationWorkUnitIds) {
        if (!unitsById.has(coordinationId)) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ["workUnits", unit.id, "coordinationWorkUnitIds"], message: `Dangling coordination unit ${coordinationId}.` });
        }
      }
      const decision = decisionsById.get(unit.routingDecisionId);
      if (!decision || decision.workUnitId !== unit.id) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["workUnits", unit.id, "routingDecisionId"], message: `Routing decision ${unit.routingDecisionId} does not belong to this work unit.` });
      }
    }

    for (const unit of graph.workUnits) {
      const owned = new Set(unit.ownedNodeIds);
      const childIds = childrenByUnitId.get(unit.id) ?? [];
      for (const edgeId of unit.boundaryEdgeIds) {
        const edge = edgesById.get(edgeId);
        if (!edge) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ["workUnits", unit.id, "boundaryEdgeIds"], message: `Dangling boundary edge ${edgeId}.` });
          continue;
        }
        const directlyCrossesOwnership = owned.has(edge.sourceNodeId) !== owned.has(edge.targetNodeId);
        const childOwners = childIds.filter((childId) => {
          const childOwned = new Set(unitsById.get(childId)?.ownedNodeIds ?? []);
          return childOwned.has(edge.sourceNodeId) || childOwned.has(edge.targetNodeId);
        });
        const crossesChildren = childOwners.length === 2 && childOwners[0] !== childOwners[1];
        if (!directlyCrossesOwnership && !crossesChildren) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["workUnits", unit.id, "boundaryEdgeIds"],
            message: `Boundary edge ${edgeId} must cross owned/non-owned nodes or two child units.`
          });
        }
      }
    }

    for (const contract of graph.interfaceContracts) {
      const producer = unitsById.get(contract.producerWorkUnitId);
      const consumer = unitsById.get(contract.consumerWorkUnitId);
      const edge = edgesById.get(contract.edgeId);
      if (contract.workflowId !== graph.workflowId || !producer || !consumer || !edge) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["interfaceContracts", contract.id], message: "Interface contract references must resolve inside the workflow." });
        continue;
      }
      const producerOwned = new Set(producer.ownedNodeIds);
      const consumerOwned = new Set(consumer.ownedNodeIds);
      const endpointsCrossUnits =
        (producerOwned.has(edge.sourceNodeId) && consumerOwned.has(edge.targetNodeId)) ||
        (producerOwned.has(edge.targetNodeId) && consumerOwned.has(edge.sourceNodeId));
      if (!endpointsCrossUnits || edge.kind !== contract.edgeKind) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["interfaceContracts", contract.id], message: "Interface contract edge evidence must cross its producer and consumer units." });
      }
    }

    if (graph.partitioning) {
      for (const nodeId of graph.partitioning.targetNodeIds) {
        if (!ownerByNodeId.has(nodeId)) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ["partitioning", "targetNodeIds"], message: `Target node ${nodeId} has no work-unit owner.` });
        }
      }
      const contractEdgeIds = new Set(graph.interfaceContracts.map((contract) => contract.edgeId));
      const ignoredEdgeIds = new Set(graph.partitioning.ignoredEdges.map((edge) => edge.edgeId));
      for (const edge of graph.boundaryEdges) {
        if (!contractEdgeIds.has(edge.id) && !ignoredEdgeIds.has(edge.id)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["partitioning", "edgeClassifications"],
            message: `Cut edge ${edge.id} requires an interface contract or approved ignored reason.`
          });
        }
      }
      for (const classification of graph.partitioning.edgeClassifications) {
        for (const workUnitId of [classification.sourceWorkUnitId, classification.targetWorkUnitId]) {
          if (workUnitId && !unitsById.has(workUnitId)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["partitioning", "edgeClassifications"],
              message: `Edge classification ${classification.edgeId} references missing work unit ${workUnitId}.`
            });
          }
        }
        if (classification.classification === "write_conflict" && classification.sourceWorkUnitId && classification.targetWorkUnitId) {
          const source = unitsById.get(classification.sourceWorkUnitId);
          const target = unitsById.get(classification.targetWorkUnitId);
          if (source && target && source.layerIndex === target.layerIndex) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["partitioning", "edgeClassifications"],
              message: `Write-conflicting units ${source.id} and ${target.id} cannot share a layer.`
            });
          }
        }
      }
      const dependencyGraph = new Map(graph.workUnits.map((unit) => [unit.id, unit.dependencyWorkUnitIds]));
      if (hasDirectedCycle(dependencyGraph)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["workUnits"], message: "Work-unit dependency graph must be acyclic after SCC handling." });
      }
    }
  });

export const contractUpdateSchema = z.object({
  contractId: z.string().min(1),
  proposed: contractSnapshotSchema,
  rationale: z.string().min(1)
});

export const discoveredDependencySchema = z.object({
  targetWorkUnitId: z.string().min(1).nullable(),
  edgeId: z.string().min(1).nullable(),
  kind: workflowEdgeClassificationSchema,
  reason: z.string().min(1)
});

export const workUnitTestArtifactSchema = z.object({
  path: workspaceRelativePathSchema,
  content: z.string(),
  command: z.string().min(1).nullable(),
  description: z.string().min(1)
});

export const workUnitProposalSchema = z.object({
  workUnitId: z.string().min(1),
  baseRevision: workflowRevisionSchema,
  diff: z.string(),
  actualWriteScopes: z.array(sourceWriteScopeSchema),
  contractUpdates: z.array(contractUpdateSchema),
  discoveredDependencies: z.array(discoveredDependencySchema),
  testsProposed: z.array(workUnitTestArtifactSchema),
  assumptions: z.array(z.string().min(1)),
  unresolvedIssues: z.array(z.string().min(1)),
  confidence: z.enum(["low", "medium", "high"])
});

export const integrationCheckSchema = z.object({
  id: z.string().min(1),
  workflowId: z.string().min(1),
  layerIndex: z.number().int().nonnegative(),
  itemId: z.string().min(1).nullable(),
  checkKind: integrationCheckKindSchema,
  status: z.enum(["pending", "running", "passed", "failed", "blocked", "cancelled"]),
  diagnostics: z.record(z.unknown()),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export type AgentScale = z.infer<typeof agentScaleSchema>;
export type WorkUnitStatus = z.infer<typeof workUnitStatusSchema>;
export type WorkflowEdgeClassification = z.infer<typeof workflowEdgeClassificationSchema>;
export type ContextBudget = z.infer<typeof contextBudgetSchema>;
export type SourceWriteScope = z.infer<typeof sourceWriteScopeSchema>;
export type ExpectedOutput = z.infer<typeof expectedOutputSchema>;
export type WorkflowRevision = z.infer<typeof workflowRevisionSchema>;
export type SourceEvidenceRef = z.infer<typeof sourceEvidenceRefSchema>;
export type ContractSnapshot = z.infer<typeof contractSnapshotSchema>;
export type InterfaceContract = z.infer<typeof interfaceContractSchema>;
export type RoutingFeatures = z.infer<typeof routingFeaturesSchema>;
export type ModelRoutingDecision = z.infer<typeof modelRoutingDecisionSchema>;
export type CodingWorkUnit = z.infer<typeof codingWorkUnitSchema>;
export type WorkUnitBoundaryEdge = z.infer<typeof workUnitBoundaryEdgeSchema>;
export type PartitionOmission = z.infer<typeof partitionOmissionSchema>;
export type PartitionEdgeClassification = z.infer<typeof partitionEdgeClassificationSchema>;
export type IgnoredPartitionEdge = z.infer<typeof ignoredPartitionEdgeSchema>;
export type PartitionSccResolution = z.infer<typeof partitionSccResolutionSchema>;
export type PartitioningDiagnostics = z.infer<typeof partitioningDiagnosticsSchema>;
export type CodingWorkflowOrchestration = z.infer<typeof codingWorkflowOrchestrationSchema>;
export type ContractUpdate = z.infer<typeof contractUpdateSchema>;
export type DiscoveredDependency = z.infer<typeof discoveredDependencySchema>;
export type WorkUnitTestArtifact = z.infer<typeof workUnitTestArtifactSchema>;
export type WorkUnitProposal = z.infer<typeof workUnitProposalSchema>;
export type IntegrationCheckKind = z.infer<typeof integrationCheckKindSchema>;
export type IntegrationCheck = z.infer<typeof integrationCheckSchema>;
export type CodingWorkflowPartitionConstraints = z.infer<typeof codingWorkflowPartitionConstraintsSchema>;
export type CodingWorkflowExecutionPolicy = z.infer<typeof codingWorkflowExecutionPolicySchema>;

function addDuplicateIssues(values: string[], context: z.RefinementCtx, path: Array<string | number>, label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path, message: `Duplicate ${label}: ${value}.` });
    }
    seen.add(value);
  }
}

function uniqueById<T extends { id: string }>(
  values: T[],
  context: z.RefinementCtx,
  path: Array<string | number>,
  label: string
): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    if (result.has(value.id)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path, message: `Duplicate ${label} id: ${value.id}.` });
    } else {
      result.set(value.id, value);
    }
  }
  return result;
}

function sameRevision(left: z.infer<typeof workflowRevisionSchema>, right: z.infer<typeof workflowRevisionSchema>): boolean {
  return (
    left.indexRevision === right.indexRevision &&
    left.workspaceRevision === right.workspaceRevision &&
    left.graphRevision === right.graphRevision &&
    left.contextCompilerVersion === right.contextCompilerVersion &&
    left.routingFeatureVersion === right.routingFeatureVersion &&
    left.capturedAt === right.capturedAt &&
    JSON.stringify(left.sourceHashes) === JSON.stringify(right.sourceHashes)
  );
}

function hasDirectedCycle(graph: Map<string, string[]>): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    for (const dependencyId of graph.get(nodeId) ?? []) {
      if (visit(dependencyId)) return true;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };
  return [...graph.keys()].some(visit);
}
