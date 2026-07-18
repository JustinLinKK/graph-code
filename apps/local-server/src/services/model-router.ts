import {
  AGENT_SCALES,
  modelRoutingDecisionSchema,
  type AgentScale,
  type CodingWorkUnit,
  type ModelRoutingDecision,
  type RoutingFeatures
} from "@graphcode/graph-model";

export const MODEL_ROUTER_FEATURE_VERSION = "ma4-deterministic-router-v1";

export type ModelTierConfiguration = {
  providerId: string;
  modelId: string;
  maxConcurrency: number;
  inputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
  currency: string;
};

export type ModelRoutingCatalog = Record<AgentScale, ModelTierConfiguration>;

export type ModelScaleOverride = {
  selectedScale: AgentScale;
  actor: "user" | "policy";
  reason: string;
};

export type ModelRouterThresholds = {
  highCutEdgeCount: number;
  highCutEdgeWeight: number;
  broadOwnedSymbolCount: number;
  broadSourceTokens: number;
  broadCrossFileRelationshipCount: number;
  broadDependencyDegree: number;
  smallMaximumWriteScopes: number;
  smallMaximumCutEdges: number;
  smallMaximumCutEdgeWeight: number;
  smallMaximumCrossFileRelationships: number;
  smallMinimumLanguageConfidence: number;
  smallMinimumPlanningConfidence: number;
};

export const MODEL_ROUTER_THRESHOLDS: ModelRouterThresholds = {
  highCutEdgeCount: 5,
  highCutEdgeWeight: 8,
  broadOwnedSymbolCount: 12,
  broadSourceTokens: 12000,
  broadCrossFileRelationshipCount: 4,
  broadDependencyDegree: 8,
  smallMaximumWriteScopes: 2,
  smallMaximumCutEdges: 2,
  smallMaximumCutEdgeWeight: 2,
  smallMaximumCrossFileRelationships: 1,
  smallMinimumLanguageConfidence: 0.75,
  smallMinimumPlanningConfidence: 0.7
};

export function routeWorkUnit(input: {
  workUnit: CodingWorkUnit;
  features: RoutingFeatures;
  catalog: ModelRoutingCatalog;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  existingDecision?: ModelRoutingDecision;
  override?: ModelScaleOverride | null;
  thresholds?: ModelRouterThresholds;
}): ModelRoutingDecision {
  assertCatalog(input.catalog);
  const recommendation = recommendScale(input.workUnit, input.features, input.thresholds);
  const retainedOverride = input.override === undefined ? input.existingDecision?.override ?? null : input.override;
  const selectedScale =
    input.override === undefined && input.existingDecision?.override
      ? input.existingDecision.selectedScale
      : input.override
        ? input.override.selectedScale
        : recommendation.scale;
  const tier = input.catalog[selectedScale];
  const decision = {
    id: input.existingDecision?.id ?? input.workUnit.routingDecisionId,
    workUnitId: input.workUnit.id,
    recommendedScale: recommendation.scale,
    selectedScale,
    featureVersion: MODEL_ROUTER_FEATURE_VERSION,
    features: input.features,
    reasons: [
      ...recommendation.reasons,
      ...(retainedOverride ? [`${retainedOverride.actor} override retained: ${retainedOverride.reason}`] : [])
    ],
    estimatedInputTokens: nonnegativeInteger(input.estimatedInputTokens, "Estimated input tokens"),
    estimatedOutputTokens: nonnegativeInteger(input.estimatedOutputTokens, "Estimated output tokens"),
    estimatedCost: estimateCost(
      input.estimatedInputTokens,
      input.estimatedOutputTokens,
      tier.inputPricePerMillion,
      tier.outputPricePerMillion
    ),
    assignment: { ...tier },
    ...(input.existingDecision?.metrics ? { metrics: input.existingDecision.metrics } : {}),
    override: retainedOverride ? { actor: retainedOverride.actor, reason: retainedOverride.reason } : null
  };
  return modelRoutingDecisionSchema.parse(decision);
}

export function recommendScale(
  workUnit: CodingWorkUnit,
  features: RoutingFeatures,
  thresholds: ModelRouterThresholds = MODEL_ROUTER_THRESHOLDS
): { scale: AgentScale; reasons: string[] } {
  const highRiskReasons: string[] = [];
  if (features.blastRadius === "cross_package" || features.blastRadius === "repository") {
    highRiskReasons.push(`Blast radius is ${features.blastRadius}.`);
  }
  if (features.crossPackageRelationshipCount > 0 || features.risks.includes("cross_package")) {
    highRiskReasons.push("Work crosses a package ownership boundary.");
  }
  if (features.cutEdgeCount >= thresholds.highCutEdgeCount || features.cutEdgeWeight >= thresholds.highCutEdgeWeight) {
    highRiskReasons.push(`Boundary load is high (${features.cutEdgeCount} cut edges, weight ${features.cutEdgeWeight}).`);
  }
  if (features.interfaceChangeRequested || features.publicApiInvolvement || features.risks.includes("public_contract")) {
    highRiskReasons.push("A public interface, schema, or protocol may change.");
  }
  if (features.sharedStateInvolvement || features.risks.includes("shared_state")) {
    highRiskReasons.push("Shared state requires broad coordination.");
  }
  if (features.indexState !== "complete" || features.risks.includes("incomplete_index")) {
    highRiskReasons.push(`Index evidence is ${features.indexState}.`);
  }
  const severeRisks = features.risks.filter((risk) => ["security", "migration", "concurrency"].includes(risk));
  if (severeRisks.length > 0) highRiskReasons.push(`High-risk concerns: ${severeRisks.join(", ")}.`);
  if (features.taskAmbiguity === "high" || (features.planningConfidence !== null && features.planningConfidence < 0.45)) {
    highRiskReasons.push("Planning evidence is ambiguous or low confidence.");
  }
  if (
    features.ownedSymbolCount > thresholds.broadOwnedSymbolCount ||
    features.estimatedSourceTokens > thresholds.broadSourceTokens ||
    features.crossFileRelationshipCount > thresholds.broadCrossFileRelationshipCount ||
    features.upstreamWorkUnitCount + features.downstreamWorkUnitCount > thresholds.broadDependencyDegree
  ) {
    highRiskReasons.push("The unit exceeds the broad-change routing threshold.");
  }
  if (highRiskReasons.length > 0) return { scale: "large", reasons: highRiskReasons };

  const writePaths = new Set(workUnit.plannedWriteScopes.map((scope) => scope.path));
  const narrowKnownWriteScope =
    workUnit.plannedWriteScopes.length > 0 &&
    workUnit.plannedWriteScopes.length <= thresholds.smallMaximumWriteScopes &&
    writePaths.size <= thresholds.smallMaximumWriteScopes &&
    workUnit.plannedWriteScopes.every(
      (scope) => scope.permission === "edit" && (scope.symbolId !== null || (scope.startLine !== null && scope.endLine !== null))
    );
  const lowBoundaryLoad =
    features.cutEdgeCount <= thresholds.smallMaximumCutEdges && features.cutEdgeWeight <= thresholds.smallMaximumCutEdgeWeight;
  const leafLocal =
    features.blastRadius === "local" &&
    features.upstreamWorkUnitCount === 0 &&
    features.crossPackageRelationshipCount === 0 &&
    features.crossFileRelationshipCount <= thresholds.smallMaximumCrossFileRelationships;
  const sufficientEvidence =
    features.indexState === "complete" &&
    features.testAvailability === "available" &&
    features.taskAmbiguity === "low" &&
    (features.languageConfidence === null || features.languageConfidence >= thresholds.smallMinimumLanguageConfidence) &&
    (features.planningConfidence === null || features.planningConfidence >= thresholds.smallMinimumPlanningConfidence);
  const allowedSmallRisks = features.risks.every((risk) => risk === "cross_file");
  if (leafLocal && narrowKnownWriteScope && lowBoundaryLoad && sufficientEvidence && allowedSmallRisks) {
    return {
      scale: "small",
      reasons: ["Leaf-local unit has a narrow known write scope, low boundary load, complete index evidence, and deterministic validation."]
    };
  }

  const reasons = ["No high-risk rule applies, but the strict small-tier safety gate is not fully satisfied."];
  if (!narrowKnownWriteScope) reasons.push("Write scope is not narrow and symbol- or range-bounded.");
  if (!sufficientEvidence) reasons.push("Index, test, ambiguity, or confidence evidence is insufficient for the small tier.");
  return { scale: "medium", reasons };
}

export function recordRoutingMetrics(
  decision: ModelRoutingDecision,
  metrics: ModelRoutingDecision["metrics"]
): ModelRoutingDecision {
  if (!metrics) return decision;
  return modelRoutingDecisionSchema.parse({ ...decision, metrics });
}

export function emptyRoutingMetrics(): NonNullable<ModelRoutingDecision["metrics"]> {
  return {
    actualInputTokens: 0,
    actualOutputTokens: 0,
    actualCost: null,
    latencyMs: 0,
    retryCount: 0,
    escalationCount: 0,
    integrationFailureCount: 0,
    acceptanceOutcome: "pending",
    testOutcome: "not_run"
  };
}

function estimateCost(inputTokens: number, outputTokens: number, inputPrice: number | null, outputPrice: number | null): number | null {
  if (inputPrice === null || outputPrice === null) return null;
  return (nonnegativeInteger(inputTokens, "Estimated input tokens") * inputPrice + nonnegativeInteger(outputTokens, "Estimated output tokens") * outputPrice) / 1_000_000;
}

function nonnegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative integer.`);
  return value;
}

function assertCatalog(catalog: ModelRoutingCatalog): void {
  for (const scale of AGENT_SCALES) {
    const tier = catalog[scale];
    if (!tier.providerId.trim() || !tier.modelId.trim() || !tier.currency.trim()) {
      throw new Error(`${scale} routing configuration requires provider, model, and currency identifiers.`);
    }
    if (!Number.isInteger(tier.maxConcurrency) || tier.maxConcurrency < 1) {
      throw new RangeError(`${scale} routing configuration requires positive maxConcurrency.`);
    }
  }
}
