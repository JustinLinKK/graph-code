import { describe, expect, it } from "vitest";
import { runAgentContextShadowBenchmark } from "./agent-context-shadow-benchmark";

describe("parallel multi-scale MA-3 context shadow benchmark", () => {
  it("compiles bounded owned-source contexts and measures both legacy prompts without provider calls", async () => {
    const benchmark = await runAgentContextShadowBenchmark();

    expect(benchmark.fixtureCount).toBe(6);
    expect(benchmark.workUnitCount).toBeGreaterThan(0);
    expect(benchmark.summary.isolatedEstimatedTokens).toBeGreaterThan(0);
    expect(benchmark.summary.legacyCodingEstimatedTokens).toBeGreaterThan(0);
    expect(benchmark.summary.legacyReviewEstimatedTokens).toBeGreaterThan(0);
    expect(benchmark.summary.allOwnedSourceVisible).toBe(true);
    expect(benchmark.summary.allContextsWithinBudget).toBe(true);
    expect(benchmark.summary.fullProjectReadUsedByCompiler).toBe(false);
    expect(benchmark.summary.providerCalls).toBe(0);
    expect(benchmark.fixtures.every((fixture) => fixture.workUnits.every((unit) => unit.fullProjectReadUsedByCompiler === false))).toBe(true);
  }, 30000);
});
