import { describe, expect, it } from "vitest";
import type { CodingWorkUnit, RoutingFeatures } from "@graphcode/graph-model";
import { emptyRoutingMetrics, MODEL_ROUTER_FEATURE_VERSION, routeWorkUnit, type ModelRoutingCatalog } from "./model-router";

const catalog: ModelRoutingCatalog = {
  small: {
    providerId: "fast-provider",
    modelId: "small-model",
    maxConcurrency: 4,
    inputPricePerMillion: 0.2,
    outputPricePerMillion: 0.8,
    currency: "USD"
  },
  medium: {
    providerId: "balanced-provider",
    modelId: "medium-model",
    maxConcurrency: 2,
    inputPricePerMillion: 1,
    outputPricePerMillion: 4,
    currency: "USD"
  },
  large: {
    providerId: "deep-provider",
    modelId: "large-model",
    maxConcurrency: 1,
    inputPricePerMillion: 3,
    outputPricePerMillion: 12,
    currency: "USD"
  }
};

function workUnit(overrides: Partial<CodingWorkUnit> = {}): CodingWorkUnit {
  return {
    id: "unit-1",
    workflowId: "workflow-1",
    projectId: "project-1",
    parentWorkUnitId: null,
    layerIndex: 0,
    title: "Unit",
    objective: "Change one local function",
    ownedNodeIds: ["node-1"],
    readHaloNodeIds: [],
    boundaryEdgeIds: [],
    dependencyWorkUnitIds: [],
    coordinationWorkUnitIds: [],
    plannedWriteScopes: [{ path: "src/unit.ts", startLine: 10, endLine: 20, symbolId: "node-1", permission: "edit" }],
    expectedOutputs: [{ kind: "diff", description: "Patch", required: true, path: null }],
    recommendedScale: "small",
    selectedScale: "small",
    routingDecisionId: "route-unit-1",
    contextBudget: {
      maxInputTokens: 16000,
      maxSourceTokens: 8000,
      maxGraphTokens: 4000,
      maxContractTokens: 2000,
      maxFiles: 4,
      maxNodes: 64,
      maxEdges: 128
    },
    baseRevision: {
      indexRevision: "index-1",
      workspaceRevision: "workspace-1",
      graphRevision: 1,
      sourceHashes: { "src/unit.ts": "hash-1" },
      contextCompilerVersion: "ma3-context-v1",
      routingFeatureVersion: MODEL_ROUTER_FEATURE_VERSION,
      capturedAt: "2026-07-18T12:00:00.000Z"
    },
    status: "pending",
    ...overrides
  };
}

function features(overrides: Partial<RoutingFeatures> = {}): RoutingFeatures {
  return {
    ownedSymbolCount: 1,
    estimatedSourceTokens: 600,
    controlFlowComplexity: 2,
    cutEdgeCount: 1,
    cutEdgeWeight: 1,
    crossFileRelationshipCount: 0,
    crossPackageRelationshipCount: 0,
    upstreamWorkUnitCount: 0,
    downstreamWorkUnitCount: 1,
    interfaceChangeRequested: false,
    publicApiInvolvement: false,
    sharedStateInvolvement: false,
    testAvailability: "available",
    blastRadius: "local",
    languageConfidence: 0.95,
    indexState: "complete",
    taskAmbiguity: "low",
    planningConfidence: 0.9,
    risks: [],
    ...overrides
  };
}

describe("deterministic MA-4 model router", () => {
  it("selects the configured small provider/model only through the strict safety gate", () => {
    const decision = routeWorkUnit({
      workUnit: workUnit(),
      features: features(),
      catalog,
      estimatedInputTokens: 1000,
      estimatedOutputTokens: 250
    });

    expect(decision.selectedScale).toBe("small");
    expect(decision.assignment).toMatchObject({ providerId: "fast-provider", modelId: "small-model" });
    expect(decision.estimatedCost).toBeCloseTo(0.0004);
  });

  it("routes uncertain ordinary work to medium and risk-bearing work to large", () => {
    const medium = routeWorkUnit({
      workUnit: workUnit(),
      features: features({ testAvailability: "unknown", taskAmbiguity: "unknown" }),
      catalog,
      estimatedInputTokens: 2000,
      estimatedOutputTokens: 400
    });
    const large = routeWorkUnit({
      workUnit: workUnit(),
      features: features({ blastRadius: "cross_package", crossPackageRelationshipCount: 2, risks: ["security", "cross_package"] }),
      catalog,
      estimatedInputTokens: 8000,
      estimatedOutputTokens: 1000
    });

    expect(medium.selectedScale).toBe("medium");
    expect(medium.assignment?.modelId).toBe("medium-model");
    expect(large.selectedScale).toBe("large");
    expect(large.assignment?.providerId).toBe("deep-provider");
    expect(large.reasons.join(" ")).toMatch(/cross_package|High-risk/);
  });

  it("recomputes recommendations without silently replacing a persisted user override or metrics", () => {
    const original = routeWorkUnit({
      workUnit: workUnit(),
      features: features(),
      catalog,
      estimatedInputTokens: 1000,
      estimatedOutputTokens: 250,
      override: { selectedScale: "medium", actor: "user", reason: "Use the validated team model." }
    });
    original.metrics = { ...emptyRoutingMetrics(), actualInputTokens: 800, acceptanceOutcome: "accepted", testOutcome: "passed" };

    const rerouted = routeWorkUnit({
      workUnit: workUnit(),
      features: features({ risks: ["migration"], blastRadius: "repository" }),
      catalog,
      estimatedInputTokens: 3000,
      estimatedOutputTokens: 500,
      existingDecision: original
    });

    expect(rerouted.recommendedScale).toBe("large");
    expect(rerouted.selectedScale).toBe("medium");
    expect(rerouted.assignment?.modelId).toBe("medium-model");
    expect(rerouted.override).toEqual({ actor: "user", reason: "Use the validated team model." });
    expect(rerouted.metrics).toEqual(original.metrics);
  });
});
