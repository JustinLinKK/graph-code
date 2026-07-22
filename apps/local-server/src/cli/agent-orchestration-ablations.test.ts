import { describe, expect, it } from "vitest";
import { ABLATION_CONDITIONS, runAgentOrchestrationAblations } from "./agent-orchestration-ablations";

describe("parallel multi-scale MA-7 ablation runner", () => {
  it("publishes all six provider-free conditions, calibrated thresholds, and a zero-legacy default observation", async () => {
    const report = await runAgentOrchestrationAblations({ delayMs: 1 });

    expect(report.conditions.map((condition) => condition.condition)).toEqual([...ABLATION_CONDITIONS]);
    expect(report.conditions.every((condition) => condition.providerMode === "deterministic_fake_only")).toBe(true);
    expect(report.conditions.every((condition) => Number.isFinite(condition.usage.totalAttemptedCost))).toBe(true);
    expect(report.conditions.every((condition) => condition.usage.totalAttemptedCost >= condition.usage.successfulTaskCost)).toBe(true);
    expect(report.researchTargets).toMatchObject({
      independentParallelMakespanTargetPassed: true,
      clearlyLeafLocalSmallTierTargetPassed: true,
      inputTokenReductionTargetPassed: false,
      patchAndTestSuccessNotDecreased: true,
      integrationConflictTargetPassed: true
    });
    const serial = report.conditions.find((condition) => condition.condition === "serial_large_full_graph")!;
    const routedContracts = report.conditions.find((condition) => condition.condition === "topology_multiscale_contracts")!;
    expect(routedContracts.usage.totalAttemptedCost).toBeLessThan(serial.usage.totalAttemptedCost);
    expect(report.calibration.partition.candidates).toHaveLength(9);
    expect(report.calibration.partition.candidates.every((candidate) => candidate.valid)).toBe(true);
    expect(report.calibration.routing.candidates).toHaveLength(27);
    expect(report.calibration.routing.selected).toEqual({
      smallMaximumCutEdges: 2,
      broadSourceTokens: 12000,
      smallMinimumPlanningConfidence: 0.7
    });
    expect(report.defaultOnObservation.featureFlags).toEqual({
      graphPartitionedWorkflows: true,
      workUnitContext: true,
      modelRouterV2: true,
      edgeContracts: true,
      integrationGate: true
    });
    expect(Object.values(report.defaultOnObservation.legacyCalls)).toEqual([0, 0, 0, 0]);
    expect(report.defaultOnObservation.providerCalls.paid).toBe(0);
    expect(Object.values(report.defaultOnObservation.gates).every((value) => value === true || value === 0)).toBe(true);
  }, 120000);
});
