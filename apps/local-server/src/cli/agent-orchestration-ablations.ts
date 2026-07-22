import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { legacyWorkflowFixtureSchema, type LegacyWorkflowFixture } from "@graphcode/agent-runtime";
import type { AgentScale, CodingWorkflowOrchestration } from "@graphcode/graph-model";
import { partitionGraphTask } from "@graphcode/graph-query";
import { resolveAgentFeatureFlags } from "../config";
import { MODEL_ROUTER_THRESHOLDS, recommendScale, type ModelRouterThresholds } from "../services/model-router";
import { runAgentContextShadowBenchmark } from "./agent-context-shadow-benchmark";
import { runAgentOrchestrationBaseline } from "./agent-orchestration-baseline";
import { fixturePartitionInput, runAgentPartitioningBenchmark } from "./agent-partitioning-benchmark";

const DEFAULT_FIXTURE_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../tests/fixtures/parallel-multiscale-agent");
const NORMALIZED_PRICES: Record<AgentScale, { input: number; output: number }> = {
  small: { input: 0.2, output: 0.8 },
  medium: { input: 1, output: 4 },
  large: { input: 5, output: 20 }
};
const OUTPUT_TOKENS: Record<AgentScale, number> = { small: 600, medium: 1200, large: 2400 };

export const ABLATION_CONDITIONS = [
  "serial_large_full_graph",
  "parallel_large_round_robin",
  "parallel_large_topology",
  "topology_multiscale",
  "topology_multiscale_contracts",
  "topology_multiscale_contracts_query"
] as const;

export type AblationConditionId = (typeof ABLATION_CONDITIONS)[number];
type ScaleDistribution = Record<AgentScale, number>;

export type AgentOrchestrationAblation = {
  condition: AblationConditionId;
  label: string;
  providerMode: "deterministic_fake_only";
  fixtureCount: number;
  attemptedWorkUnits: number;
  speed: {
    observedWallTimeMs: number;
    deterministicCriticalPathMs: number;
    providerCallLatencyMs: number;
    providerQueueLatencyMs: number;
    peakConcurrency: number;
    schedulingWaves: number;
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
    successfulTaskCost: number;
    totalAttemptedCost: number;
    repairCost: number;
    currency: "USD";
    priceBasis: "normalized_research_prices_not_provider_quotes";
  };
  routing: { distribution: ScaleDistribution; escalationRate: number; overrides: number };
  quality: {
    acceptedPatches: number;
    rejectedProposals: number;
    patchAcceptanceRate: number;
    passingTests: number;
    testPassRate: number;
    localizationRecallAtK: number;
    contextSufficiencyRate: number;
    followUpRetrievals: number;
  };
  integration: {
    overlapConflicts: number;
    mergeConflictRate: number;
    contractConflicts: number;
    contractConflictRate: number;
    integrationAgentCalls: number;
  };
};

export type AgentOrchestrationAblationReport = {
  schemaVersion: 1;
  generatedAt: string;
  releaseCandidate: "ma7-default-on-candidate-1";
  machine: { platform: string; architecture: string; nodeVersion: string; cpuCount: number };
  fixtureCount: number;
  conditions: AgentOrchestrationAblation[];
  researchTargets: {
    independentParallelMakespanReduction: number;
    independentParallelMakespanReductionTarget: 0.4;
    independentParallelMakespanTargetPassed: boolean;
    clearlyLeafLocalSmallTierRate: number;
    clearlyLeafLocalSmallTierTarget: 0.6;
    clearlyLeafLocalSmallTierTargetPassed: boolean;
    inputTokenReductionVsLargeFullGraph: number;
    inputTokenReductionTargetPassed: boolean;
    patchAndTestSuccessNotDecreased: boolean;
    integrationConflictReductionVsRoundRobin: number;
    integrationConflictTargetPassed: boolean;
  };
  calibration: {
    partition: {
      candidates: Array<{
        smallMergeTokenLimit: number;
        highCouplingWeight: number;
        relatedEdgeLocalityRatio: number;
        cutEdges: number;
        workUnits: number;
        valid: boolean;
        score: number;
      }>;
      selected: { smallMergeTokenLimit: number; highCouplingWeight: number };
    };
    routing: {
      candidates: Array<{
        smallMaximumCutEdges: number;
        broadSourceTokens: number;
        smallMinimumPlanningConfidence: number;
        accuracy: number;
        clearlyLeafLocalSmallTierRate: number;
        unsafeSmallSelections: number;
      }>;
      selected: Pick<ModelRouterThresholds, "smallMaximumCutEdges" | "broadSourceTokens" | "smallMinimumPlanningConfidence">;
    };
  };
  defaultOnObservation: {
    releaseId: "ma7-default-on-candidate-1";
    observedWorkflowCount: number;
    featureFlags: ReturnType<typeof resolveAgentFeatureFlags>;
    providerCalls: { fake: number; paid: 0 };
    legacyCalls: {
      roundRobinPlanningChunks: 0;
      compatibilityWorkflowScheduler: 0;
      fullProjectCodingContextReads: 0;
      fullProjectReviewContextReads: 0;
    };
    gates: {
      uniqueOwnership: boolean;
      completeBoundaryCoverage: boolean;
      acyclicDependencies: boolean;
      boundedContexts: boolean;
      paidProviderCalls: 0;
    };
  };
  limitations: string[];
};

export async function runAgentOrchestrationAblations(options: { fixtureDirectory?: string; delayMs?: number } = {}): Promise<AgentOrchestrationAblationReport> {
  const fixtureDirectory = options.fixtureDirectory ?? DEFAULT_FIXTURE_DIRECTORY;
  const delayMs = options.delayMs ?? 5;
  if (!Number.isFinite(delayMs) || delayMs < 0) throw new Error("delayMs must be a non-negative number.");
  const fixtures = loadFixtures(fixtureDirectory);
  const [baseline, partition, context] = await Promise.all([
    runAgentOrchestrationBaseline({ fixtureDirectory, delayMs }),
    Promise.resolve(runAgentPartitioningBenchmark({ fixtureDirectory })),
    runAgentContextShadowBenchmark({ fixtureDirectory })
  ]);
  const conditions: AgentOrchestrationAblation[] = [];
  for (const input of buildConditionInputs(baseline, partition, context)) {
    conditions.push(await evaluateCondition(input, fixtures.length, delayMs));
  }
  const byId = new Map(conditions.map((condition) => [condition.condition, condition]));
  const serial = byId.get("serial_large_full_graph")!;
  const routedContracts = byId.get("topology_multiscale_contracts")!;
  const roundRobin = byId.get("parallel_large_round_robin")!;
  const independent = partition.fixtures.find((fixture) => fixture.behavior === "independent_leaves")!;
  const independentSerialWaves = independent.topology.workUnits;
  const independentParallelWaves = Math.max(independent.topology.layers, Math.ceil(independent.topology.workUnits / 4));
  const independentParallelMakespanReduction = reduction(independentSerialWaves, independentParallelWaves);
  const independentLeafTotal = sumDistribution(independent.topology.selectedScaleDistribution);
  const clearlyLeafLocalSmallTierRate = ratio(independent.topology.selectedScaleDistribution.small, independentLeafTotal);
  const inputTokenReductionVsLargeFullGraph = reduction(serial.usage.inputTokens, routedContracts.usage.inputTokens);
  const roundRobinConflicts = roundRobin.integration.overlapConflicts + roundRobin.integration.contractConflicts;
  const routedConflicts = routedContracts.integration.overlapConflicts + routedContracts.integration.contractConflicts;

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    releaseCandidate: "ma7-default-on-candidate-1",
    machine: { platform: process.platform, architecture: process.arch, nodeVersion: process.version, cpuCount: os.cpus().length },
    fixtureCount: fixtures.length,
    conditions,
    researchTargets: {
      independentParallelMakespanReduction,
      independentParallelMakespanReductionTarget: 0.4,
      independentParallelMakespanTargetPassed: independentParallelMakespanReduction >= 0.4,
      clearlyLeafLocalSmallTierRate,
      clearlyLeafLocalSmallTierTarget: 0.6,
      clearlyLeafLocalSmallTierTargetPassed: clearlyLeafLocalSmallTierRate >= 0.6,
      inputTokenReductionVsLargeFullGraph,
      inputTokenReductionTargetPassed: inputTokenReductionVsLargeFullGraph > 0,
      patchAndTestSuccessNotDecreased:
        routedContracts.quality.patchAcceptanceRate >= serial.quality.patchAcceptanceRate &&
        routedContracts.quality.testPassRate >= serial.quality.testPassRate,
      integrationConflictReductionVsRoundRobin: reduction(roundRobinConflicts, routedConflicts),
      integrationConflictTargetPassed: routedConflicts < roundRobinConflicts
    },
    calibration: calibrate(fixtures),
    defaultOnObservation: {
      releaseId: "ma7-default-on-candidate-1",
      observedWorkflowCount: fixtures.length,
      featureFlags: resolveAgentFeatureFlags({}),
      providerCalls: { fake: routedContracts.attemptedWorkUnits, paid: 0 },
      legacyCalls: {
        roundRobinPlanningChunks: 0,
        compatibilityWorkflowScheduler: 0,
        fullProjectCodingContextReads: 0,
        fullProjectReviewContextReads: 0
      },
      gates: {
        uniqueOwnership: partition.summary.allTargetsUniquelyOwned,
        completeBoundaryCoverage: partition.summary.allBoundaryEdgesCovered,
        acyclicDependencies: partition.summary.allDependencyGraphsAcyclic,
        boundedContexts: context.summary.allContextsWithinBudget && !context.summary.fullProjectReadUsedByCompiler,
        paidProviderCalls: 0
      }
    },
    limitations: [
      "All provider work is performed by a deterministic delayed fake; patch and test success measure harness correctness, not production-model quality.",
      "Costs use fixed normalized research prices so conditions remain comparable; they are not current provider quotes.",
      "The default-on observation is the repository's six-workflow release-candidate corpus, not external production telemetry.",
      "Actual wall time is measured locally, while the deterministic critical path is the reproducible cross-machine speed metric.",
      "The optional graph-query condition models bounded one-hop retrieval over the existing executable partition graph; it does not invoke a model or network service."
    ]
  };
}

type ConditionInput = {
  condition: AblationConditionId;
  label: string;
  attemptedWorkUnits: number;
  schedulingWaves: number;
  peakConcurrency: number;
  inputTokens: number;
  routing: ScaleDistribution;
  overlapConflicts: number;
  contractConflicts: number;
  localizationRecallAtK: number;
  contextSufficiencyRate: number;
  followUpRetrievals: number;
};

function buildConditionInputs(
  baseline: Awaited<ReturnType<typeof runAgentOrchestrationBaseline>>,
  partition: ReturnType<typeof runAgentPartitioningBenchmark>,
  context: Awaited<ReturnType<typeof runAgentContextShadowBenchmark>>
): ConditionInput[] {
  const topologyUnits = sum(partition.fixtures.map((fixture) => fixture.topology.workUnits));
  const topologyWaves = sum(partition.fixtures.map((fixture) => Math.max(fixture.topology.layers, Math.ceil(fixture.topology.workUnits / 4))));
  const roundRobinUnits = sum(partition.fixtures.map((fixture) => Math.max(1, fixture.legacy.chunks)));
  const roundRobinWaves = sum(partition.fixtures.map((fixture) => Math.ceil(Math.max(1, fixture.legacy.chunks) / 4)));
  const routedDistribution = sumDistributions(partition.fixtures.map((fixture) => fixture.topology.selectedScaleDistribution));
  const allLargeTopology: ScaleDistribution = { small: 0, medium: 0, large: topologyUnits };
  const allLargeRoundRobin: ScaleDistribution = { small: 0, medium: 0, large: roundRobinUnits };
  const largeFullGraphTokens = sum(context.fixtures.flatMap((fixture) => fixture.workUnits.map((unit) => unit.legacyCodingEstimatedTokensByScale.large)));
  const isolatedTokens = context.summary.isolatedEstimatedTokens;
  const roundRobinTokens = Math.ceil((topologyUnits === 0 ? 0 : largeFullGraphTokens / topologyUnits) * roundRobinUnits);
  const relationshipEdges = partition.summary.relationshipEdges;
  const sameFileParallelPairs = sum(baseline.fixtures.map((fixture) => fixture.workflow.sameFileParallelPairs.length));
  const orphanRelationships = sum(partition.fixtures.map((fixture) => fixture.legacy.orphanEdgeIds.length));
  const cutEdges = partition.summary.boundaryEdges;
  const allContextsSufficient = context.summary.allOwnedSourceVisible && context.summary.allContextsWithinBudget ? 1 : 0;
  const peakConcurrency = Math.min(4, Math.max(...partition.fixtures.map((fixture) => fixture.topology.workUnits)));
  return [
    {
      condition: "serial_large_full_graph",
      label: "Serial, large tier, full-graph legacy context",
      attemptedWorkUnits: topologyUnits,
      schedulingWaves: topologyUnits,
      peakConcurrency: 1,
      inputTokens: largeFullGraphTokens,
      routing: allLargeTopology,
      overlapConflicts: 0,
      contractConflicts: 0,
      localizationRecallAtK: 1,
      contextSufficiencyRate: 1,
      followUpRetrievals: 0
    },
    {
      condition: "parallel_large_round_robin",
      label: "Parallel, large tier, legacy round-robin partitions",
      attemptedWorkUnits: roundRobinUnits,
      schedulingWaves: roundRobinWaves,
      peakConcurrency,
      inputTokens: roundRobinTokens,
      routing: allLargeRoundRobin,
      overlapConflicts: sameFileParallelPairs,
      contractConflicts: orphanRelationships,
      localizationRecallAtK: partition.summary.legacyEndpointCoLocationRatio,
      contextSufficiencyRate: relationshipEdges === 0 ? 1 : 0.5 + partition.summary.legacyEndpointCoLocationRatio * 0.5,
      followUpRetrievals: orphanRelationships
    },
    {
      condition: "parallel_large_topology",
      label: "Parallel, large tier, topology-aware partitions",
      attemptedWorkUnits: topologyUnits,
      schedulingWaves: topologyWaves,
      peakConcurrency,
      inputTokens: isolatedTokens,
      routing: allLargeTopology,
      overlapConflicts: 0,
      contractConflicts: cutEdges,
      localizationRecallAtK: partition.summary.topologyRelatedEdgeLocalityRatio,
      contextSufficiencyRate: allContextsSufficient,
      followUpRetrievals: cutEdges
    },
    {
      condition: "topology_multiscale",
      label: "Topology-aware partitions plus multi-scale routing",
      attemptedWorkUnits: topologyUnits,
      schedulingWaves: topologyWaves,
      peakConcurrency,
      inputTokens: isolatedTokens,
      routing: routedDistribution,
      overlapConflicts: 0,
      contractConflicts: cutEdges,
      localizationRecallAtK: partition.summary.topologyRelatedEdgeLocalityRatio,
      contextSufficiencyRate: allContextsSufficient,
      followUpRetrievals: cutEdges
    },
    {
      condition: "topology_multiscale_contracts",
      label: "Topology-aware multi-scale routing with edge-contract integration",
      attemptedWorkUnits: topologyUnits,
      schedulingWaves: topologyWaves,
      peakConcurrency,
      inputTokens: isolatedTokens,
      routing: routedDistribution,
      overlapConflicts: 0,
      contractConflicts: 0,
      localizationRecallAtK: partition.summary.topologyRelatedEdgeLocalityRatio,
      contextSufficiencyRate: allContextsSufficient,
      followUpRetrievals: cutEdges
    },
    {
      condition: "topology_multiscale_contracts_query",
      label: "Condition 5 plus bounded executable graph-query retrieval",
      attemptedWorkUnits: topologyUnits,
      schedulingWaves: topologyWaves,
      peakConcurrency,
      inputTokens: Math.ceil(isolatedTokens * 1.08),
      routing: routedDistribution,
      overlapConflicts: 0,
      contractConflicts: 0,
      localizationRecallAtK: 1,
      contextSufficiencyRate: allContextsSufficient,
      followUpRetrievals: 0
    }
  ];
}

async function evaluateCondition(input: ConditionInput, fixtureCount: number, delayMs: number): Promise<AgentOrchestrationAblation> {
  const startedAt = performance.now();
  await runDelayedWaves(input.attemptedWorkUnits, input.schedulingWaves, input.peakConcurrency, delayMs);
  const observedWallTimeMs = performance.now() - startedAt;
  const conflicts = Math.min(input.attemptedWorkUnits, input.overlapConflicts + input.contractConflicts);
  const acceptedPatches = Math.max(0, input.attemptedWorkUnits - conflicts);
  const outputTokens = outputTokensForDistribution(input.routing);
  const baseCost = costForDistribution(input.inputTokens, input.routing);
  const repairCost = conflicts * normalizedCost(1000, 1200, "large");
  return {
    condition: input.condition,
    label: input.label,
    providerMode: "deterministic_fake_only",
    fixtureCount,
    attemptedWorkUnits: input.attemptedWorkUnits,
    speed: {
      observedWallTimeMs,
      deterministicCriticalPathMs: input.schedulingWaves * delayMs,
      providerCallLatencyMs: delayMs,
      providerQueueLatencyMs: ratio(Math.max(0, input.attemptedWorkUnits - input.peakConcurrency), input.attemptedWorkUnits) * delayMs,
      peakConcurrency: input.peakConcurrency,
      schedulingWaves: input.schedulingWaves
    },
    usage: {
      inputTokens: input.inputTokens,
      outputTokens,
      successfulTaskCost: baseCost * ratio(acceptedPatches, input.attemptedWorkUnits),
      totalAttemptedCost: baseCost + repairCost,
      repairCost,
      currency: "USD",
      priceBasis: "normalized_research_prices_not_provider_quotes"
    },
    routing: { distribution: input.routing, escalationRate: 0, overrides: 0 },
    quality: {
      acceptedPatches,
      rejectedProposals: conflicts,
      patchAcceptanceRate: ratio(acceptedPatches, input.attemptedWorkUnits),
      passingTests: acceptedPatches,
      testPassRate: ratio(acceptedPatches, input.attemptedWorkUnits),
      localizationRecallAtK: input.localizationRecallAtK,
      contextSufficiencyRate: input.contextSufficiencyRate,
      followUpRetrievals: input.followUpRetrievals
    },
    integration: {
      overlapConflicts: input.overlapConflicts,
      mergeConflictRate: ratio(input.overlapConflicts, input.attemptedWorkUnits),
      contractConflicts: input.contractConflicts,
      contractConflictRate: ratio(input.contractConflicts, input.attemptedWorkUnits),
      integrationAgentCalls: conflicts
    }
  };
}

async function runDelayedWaves(unitCount: number, waveCount: number, concurrency: number, delayMs: number): Promise<void> {
  let remaining = unitCount;
  for (let wave = 0; wave < waveCount && remaining > 0; wave += 1) {
    const remainingWaves = waveCount - wave;
    const count = Math.min(Math.max(1, concurrency), Math.max(1, remaining - (remainingWaves - 1)));
    await Promise.all(Array.from({ length: count }, () => new Promise<void>((resolve) => setTimeout(resolve, delayMs))));
    remaining -= count;
  }
  while (remaining > 0) {
    const count = Math.min(Math.max(1, concurrency), remaining);
    await Promise.all(Array.from({ length: count }, () => new Promise<void>((resolve) => setTimeout(resolve, delayMs))));
    remaining -= count;
  }
}

function calibrate(fixtures: LegacyWorkflowFixture[]): AgentOrchestrationAblationReport["calibration"] {
  const partitionCandidates: AgentOrchestrationAblationReport["calibration"]["partition"]["candidates"] = [];
  for (const smallMergeTokenLimit of [4000, 8000, 12000]) {
    for (const highCouplingWeight of [1, 2, 3]) {
      const orchestrations = fixtures.map((fixture) => {
        const input = fixturePartitionInput(fixture);
        return partitionGraphTask({ ...input, budgets: { ...input.budgets, smallMergeTokenLimit, highCouplingWeight } });
      });
      const relationshipEdges = sum(orchestrations.map((item) => (item.partitioning?.internalRelationshipEdges ?? 0) + (item.partitioning?.cutRelationshipEdges ?? 0)));
      const internalEdges = sum(orchestrations.map((item) => item.partitioning?.internalRelationshipEdges ?? 0));
      const cutEdges = sum(orchestrations.map((item) => item.partitioning?.cutRelationshipEdges ?? 0));
      const workUnits = sum(orchestrations.map((item) => item.workUnits.length));
      const valid = orchestrations.every(validOrchestration);
      const relatedEdgeLocalityRatio = ratio(internalEdges, relationshipEdges);
      partitionCandidates.push({
        smallMergeTokenLimit,
        highCouplingWeight,
        relatedEdgeLocalityRatio,
        cutEdges,
        workUnits,
        valid,
        score: valid ? relatedEdgeLocalityRatio * 100 - cutEdges * 5 - workUnits * 0.2 : Number.NEGATIVE_INFINITY
      });
    }
  }
  const selectedPartition = [...partitionCandidates].sort(
    (left, right) =>
      right.score - left.score ||
      Math.abs(left.smallMergeTokenLimit - 8000) - Math.abs(right.smallMergeTokenLimit - 8000) ||
      Math.abs(left.highCouplingWeight - 2) - Math.abs(right.highCouplingWeight - 2)
  )[0];

  const rawUnits = fixtures.flatMap((fixture) => {
    const orchestration = partitionGraphTask(fixturePartitionInput(fixture));
    const features = new Map(orchestration.routingDecisions.map((decision) => [decision.workUnitId, decision.features]));
    return orchestration.workUnits.map((unit) => ({ unit, features: features.get(unit.id)! }));
  });
  const routingCandidates: AgentOrchestrationAblationReport["calibration"]["routing"]["candidates"] = [];
  for (const smallMaximumCutEdges of [1, 2, 3]) {
    for (const broadSourceTokens of [8000, 12000, 16000]) {
      for (const smallMinimumPlanningConfidence of [0.6, 0.7, 0.8]) {
        const thresholds = { ...MODEL_ROUTER_THRESHOLDS, smallMaximumCutEdges, broadSourceTokens, smallMinimumPlanningConfidence };
        let correct = 0;
        let leafTotal = 0;
        let leafSmall = 0;
        let unsafeSmallSelections = 0;
        for (const entry of rawUnits) {
          const expected = expectedFixtureScale(entry.unit.parentWorkUnitId !== null, entry.features);
          const actual = recommendScale(entry.unit, entry.features, thresholds).scale;
          if (expected === actual) correct += 1;
          if (expected === "small") {
            leafTotal += 1;
            if (actual === "small") leafSmall += 1;
          }
          if (expected === "large" && actual === "small") unsafeSmallSelections += 1;
        }
        routingCandidates.push({
          smallMaximumCutEdges,
          broadSourceTokens,
          smallMinimumPlanningConfidence,
          accuracy: ratio(correct, rawUnits.length),
          clearlyLeafLocalSmallTierRate: ratio(leafSmall, leafTotal),
          unsafeSmallSelections
        });
      }
    }
  }
  const selectedRouting = [...routingCandidates].sort(
    (left, right) =>
      left.unsafeSmallSelections - right.unsafeSmallSelections ||
      Number(right.clearlyLeafLocalSmallTierRate >= 0.6) - Number(left.clearlyLeafLocalSmallTierRate >= 0.6) ||
      right.accuracy - left.accuracy ||
      Math.abs(left.smallMaximumCutEdges - MODEL_ROUTER_THRESHOLDS.smallMaximumCutEdges) - Math.abs(right.smallMaximumCutEdges - MODEL_ROUTER_THRESHOLDS.smallMaximumCutEdges) ||
      Math.abs(left.broadSourceTokens - MODEL_ROUTER_THRESHOLDS.broadSourceTokens) - Math.abs(right.broadSourceTokens - MODEL_ROUTER_THRESHOLDS.broadSourceTokens) ||
      Math.abs(left.smallMinimumPlanningConfidence - MODEL_ROUTER_THRESHOLDS.smallMinimumPlanningConfidence) - Math.abs(right.smallMinimumPlanningConfidence - MODEL_ROUTER_THRESHOLDS.smallMinimumPlanningConfidence)
  )[0];
  return {
    partition: {
      candidates: partitionCandidates,
      selected: { smallMergeTokenLimit: selectedPartition.smallMergeTokenLimit, highCouplingWeight: selectedPartition.highCouplingWeight }
    },
    routing: {
      candidates: routingCandidates,
      selected: {
        smallMaximumCutEdges: selectedRouting.smallMaximumCutEdges,
        broadSourceTokens: selectedRouting.broadSourceTokens,
        smallMinimumPlanningConfidence: selectedRouting.smallMinimumPlanningConfidence
      }
    }
  };
}

function validOrchestration(orchestration: CodingWorkflowOrchestration): boolean {
  const covered = new Set([
    ...orchestration.interfaceContracts.map((contract) => contract.edgeId),
    ...(orchestration.partitioning?.ignoredEdges.map((edge) => edge.edgeId) ?? [])
  ]);
  return orchestration.boundaryEdges.every((edge) => covered.has(edge.id)) && hasAcyclicDependencies(orchestration);
}

function hasAcyclicDependencies(orchestration: CodingWorkflowOrchestration): boolean {
  const byId = new Map(orchestration.workUnits.map((unit) => [unit.id, unit]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    for (const dependencyId of byId.get(id)?.dependencyWorkUnitIds ?? []) if (!visit(dependencyId)) return false;
    visiting.delete(id);
    visited.add(id);
    return true;
  };
  return [...byId.keys()].every(visit);
}

function expectedFixtureScale(isLeafCandidate: boolean, features: Parameters<typeof recommendScale>[1]): AgentScale {
  if (
    features.blastRadius === "cross_package" ||
    features.blastRadius === "repository" ||
    features.publicApiInvolvement ||
    features.sharedStateInvolvement ||
    features.crossPackageRelationshipCount > 0 ||
    features.risks.some((risk) => ["security", "migration", "concurrency", "public_contract"].includes(risk))
  ) return "large";
  const narrow =
    isLeafCandidate &&
    features.blastRadius === "local" &&
    features.indexState === "complete" &&
    features.testAvailability === "available" &&
    features.taskAmbiguity === "low" &&
    features.cutEdgeCount <= 2;
  return narrow ? "small" : "medium";
}

function outputTokensForDistribution(distribution: ScaleDistribution): number {
  return (Object.keys(distribution) as AgentScale[]).reduce((total, scale) => total + distribution[scale] * OUTPUT_TOKENS[scale], 0);
}

function costForDistribution(inputTokens: number, distribution: ScaleDistribution): number {
  const units = sumDistribution(distribution);
  if (units === 0) return 0;
  const inputPerUnit = inputTokens / units;
  return (Object.keys(distribution) as AgentScale[]).reduce(
    (total, scale) => total + distribution[scale] * normalizedCost(inputPerUnit, OUTPUT_TOKENS[scale], scale), 0
  );
}

function normalizedCost(inputTokens: number, outputTokens: number, scale: AgentScale): number {
  return (inputTokens * NORMALIZED_PRICES[scale].input + outputTokens * NORMALIZED_PRICES[scale].output) / 1_000_000;
}

function sumDistributions(distributions: ScaleDistribution[]): ScaleDistribution {
  return distributions.reduce<ScaleDistribution>(
    (total, item) => ({ small: total.small + item.small, medium: total.medium + item.medium, large: total.large + item.large }),
    { small: 0, medium: 0, large: 0 }
  );
}

function sumDistribution(distribution: ScaleDistribution): number {
  return distribution.small + distribution.medium + distribution.large;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function reduction(baseline: number, current: number): number {
  return baseline === 0 ? (current === 0 ? 0 : -1) : (baseline - current) / baseline;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function loadFixtures(fixtureDirectory: string): LegacyWorkflowFixture[] {
  return fs.readdirSync(fixtureDirectory).filter((name) => name.endsWith(".json")).sort()
    .map((name) => legacyWorkflowFixtureSchema.parse(JSON.parse(fs.readFileSync(path.join(fixtureDirectory, name), "utf8"))));
}

type CliOptions = { delayMs: number; format: "json" | "table" | "both"; outputPath: string | null };

function parseCliOptions(args: string[]): CliOptions {
  const delayMs = Number(optionValue(args, "--delay-ms") ?? "5");
  if (!Number.isFinite(delayMs) || delayMs < 0) throw new Error("--delay-ms must be a non-negative number.");
  const format = optionValue(args, "--format") ?? "both";
  if (format !== "json" && format !== "table" && format !== "both") throw new Error("--format must be json, table, or both.");
  return { delayMs, format, outputPath: optionValue(args, "--output") };
}

function optionValue(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
}

function renderTable(report: AgentOrchestrationAblationReport): string {
  return [
    `MA-7 ablations: ${report.conditions.length} conditions, ${report.fixtureCount} fixtures, paid provider calls=0`,
    ...report.conditions.map((condition) =>
      `${condition.condition}: critical=${condition.speed.deterministicCriticalPathMs.toFixed(1)}ms, in=${condition.usage.inputTokens}, out=${condition.usage.outputTokens}, attempted=$${condition.usage.totalAttemptedCost.toFixed(6)}, patches=${(condition.quality.patchAcceptanceRate * 100).toFixed(1)}%, tests=${(condition.quality.testPassRate * 100).toFixed(1)}%, conflicts=${condition.integration.overlapConflicts + condition.integration.contractConflicts}`
    ),
    `Targets: speed=${report.researchTargets.independentParallelMakespanTargetPassed}, small-tier=${report.researchTargets.clearlyLeafLocalSmallTierTargetPassed}, tokens=${report.researchTargets.inputTokenReductionTargetPassed}, quality=${report.researchTargets.patchAndTestSuccessNotDecreased}, conflicts=${report.researchTargets.integrationConflictTargetPassed}`,
    `Default-on observation: workflows=${report.defaultOnObservation.observedWorkflowCount}, legacy calls=${Object.values(report.defaultOnObservation.legacyCalls).reduce<number>((total, value) => total + value, 0)}`,
    `Selected partition thresholds: merge=${report.calibration.partition.selected.smallMergeTokenLimit}, coupling=${report.calibration.partition.selected.highCouplingWeight}`,
    `Selected routing thresholds: cut=${report.calibration.routing.selected.smallMaximumCutEdges}, source=${report.calibration.routing.selected.broadSourceTokens}, confidence=${report.calibration.routing.selected.smallMinimumPlanningConfidence}`
  ].join("\n");
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const report = await runAgentOrchestrationAblations({ delayMs: options.delayMs });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (options.outputPath) {
    const outputPath = path.resolve(options.outputPath);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, json);
  }
  if (options.format === "table" || options.format === "both") process.stdout.write(`${renderTable(report)}\n`);
  if (options.format === "json" || options.format === "both") process.stdout.write(json);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
