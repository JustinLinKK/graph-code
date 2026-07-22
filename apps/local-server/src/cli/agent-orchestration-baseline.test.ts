import { describe, expect, it } from "vitest";
import { runAgentOrchestrationBaseline } from "./agent-orchestration-baseline";

describe("parallel multi-scale MA-0 baseline CLI", () => {
  it("reports locality, scheduling, context, routing, and outcome gaps without calling a paid model", async () => {
    const baseline = await runAgentOrchestrationBaseline({ delayMs: 5 });

    expect(baseline.fixtureCount).toBe(6);
    expect(baseline.fixtures.find((fixture) => fixture.behavior === "shared_interface")?.planning.orphanEdgeIds).toContain(
      "producer-consumer-call"
    );
    expect(baseline.fixtures.find((fixture) => fixture.behavior === "shared_interface")?.workflow.relationshipEdgesIgnoredByLayers).toContain(
      "producer-consumer-call"
    );
    expect(baseline.fixtures.find((fixture) => fixture.behavior === "same_file_functions")?.workflow.sameFileParallelPairs).toContainEqual([
      "shared-first",
      "shared-second"
    ]);
    expect(baseline.codingContext.map((entry) => entry.mode)).toEqual(["small", "medium", "large"]);
    expect(baseline.codingContext[0].promptCharacters).toBeLessThan(baseline.codingContext[1].promptCharacters);
    expect(baseline.codingContext[1].promptCharacters).toBeLessThan(baseline.codingContext[2].promptCharacters);
    expect(baseline.modelTierDistribution.small).toBeGreaterThan(0);
    expect(baseline.modelTierDistribution.medium).toBeGreaterThan(0);
    expect(baseline.modelTierDistribution.large).toBeGreaterThan(0);
    expect(baseline.schedule.serial.peakConcurrency).toBe(1);
    expect(baseline.schedule.parallel.peakConcurrency).toBe(4);
    expect(baseline.schedule.observedSpeedup).toBeGreaterThan(1.5);
    expect(baseline.currentOutcomeCoverage).toEqual({
      proposals: { succeeded: 4, failed: 0 },
      tests: "not_recorded_by_legacy_workflow",
      integration: "manual_layer_apply_only",
      estimatedCost: null
    });
  }, 30000);
});
