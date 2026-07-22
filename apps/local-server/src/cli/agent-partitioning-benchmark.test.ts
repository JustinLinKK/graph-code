import { describe, expect, it } from "vitest";
import { runAgentPartitioningBenchmark } from "./agent-partitioning-benchmark";

describe("parallel multi-scale MA-2 partitioning benchmark", () => {
  it("improves fixture relationship locality with complete, deterministic partition validation", () => {
    const benchmark = runAgentPartitioningBenchmark();

    expect(benchmark.fixtureCount).toBe(6);
    expect(benchmark.summary.relationshipEdges).toBeGreaterThan(0);
    expect(benchmark.summary.topologyRelatedEdgeLocalityRatio).toBeGreaterThan(benchmark.summary.legacyEndpointCoLocationRatio);
    expect(benchmark.summary.localityImprovementPercentagePoints).toBeGreaterThan(0);
    expect(benchmark.summary.allTargetsUniquelyOwned).toBe(true);
    expect(benchmark.summary.allBoundaryEdgesCovered).toBe(true);
    expect(benchmark.summary.allDependencyGraphsAcyclic).toBe(true);
    expect(benchmark.summary.allOutputsDeterministic).toBe(true);
    expect(benchmark.fixtures.find((fixture) => fixture.behavior === "cross_package")?.topology.interfaceContracts).toBeGreaterThan(0);
    expect(benchmark.fixtures.find((fixture) => fixture.behavior === "same_file_functions")?.topology.relatedEdgeLocalityRatio).toBe(1);
  });
});
