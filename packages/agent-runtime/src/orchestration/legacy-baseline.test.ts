import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  benchmarkLegacyConflictSchedule,
  buildLegacyRoundRobinPlanningChunks,
  fixtureToLegacyPlanningGraph,
  inspectLegacyRoundRobinPlanningChunks,
  legacyWorkflowFixtureSchema,
  type LegacyScheduleItem,
  type LegacyWorkflowFixture
} from "./legacy-baseline";

const fixtureDirectory = fileURLToPath(new URL("../../../../tests/fixtures/parallel-multiscale-agent/", import.meta.url));

function loadFixtures(): LegacyWorkflowFixture[] {
  return fs
    .readdirSync(fixtureDirectory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => legacyWorkflowFixtureSchema.parse(JSON.parse(fs.readFileSync(`${fixtureDirectory}/${name}`, "utf8"))));
}

describe("legacy parallel multi-scale baseline", () => {
  it("validates the complete behavioral fixture corpus", () => {
    const fixtures = loadFixtures();

    expect(fixtures.map((fixture) => fixture.behavior).sort()).toEqual([
      "cross_package",
      "cycle",
      "independent_leaves",
      "parent_integration",
      "same_file_functions",
      "shared_interface"
    ]);
    expect(fixtures.every((fixture) => fixture.nodes.some((node) => node.id === fixture.scopeNodeId))).toBe(true);
  });

  it("captures the current round-robin behavior that separates an edge from an endpoint", () => {
    const fixture = loadFixtures().find((candidate) => candidate.behavior === "shared_interface")!;
    const graph = fixtureToLegacyPlanningGraph(fixture);

    const chunks = buildLegacyRoundRobinPlanningChunks(graph, 2);
    const inspection = inspectLegacyRoundRobinPlanningChunks(graph, 2);

    expect(chunks).toHaveLength(2);
    expect(inspection.orphanEdgeIds).toEqual(["producer-consumer-call"]);
    expect(inspection.endpointCoLocationRatio).toBe(0);
    const edgeChunk = inspection.chunks.find((chunk) => chunk.edgeIds.includes("producer-consumer-call"));
    expect(edgeChunk?.nodeIds).toContain("producer");
    expect(edgeChunk?.nodeIds).not.toContain("consumer");
  });

  it("reproduces serial and legacy conflict-group parallel makespan with a delayed fake provider", async () => {
    const items: LegacyScheduleItem[] = ["a", "b", "c", "d"].map((id) => ({
      id,
      conflictGroup: `group-${id}`,
      mode: "small",
      contextCharacters: 4000
    }));

    const serial = await benchmarkLegacyConflictSchedule(items, { execution: "serial", delayMs: 20 });
    const parallel = await benchmarkLegacyConflictSchedule(items, { execution: "parallel_conflict_groups", delayMs: 20 });

    expect(serial.theoreticalWaves).toBe(4);
    expect(serial.peakConcurrency).toBe(1);
    expect(parallel.theoreticalWaves).toBe(1);
    expect(parallel.peakConcurrency).toBe(4);
    expect(parallel.proposalResult).toEqual({ succeeded: 4, failed: 0 });
    expect(parallel.testResult).toBe("not_recorded_by_legacy_workflow");
    expect(parallel.integrationResult).toBe("manual_layer_apply_only");
    expect(parallel.makespanMs).toBeLessThan(serial.makespanMs * 0.75);
  });

  it("rejects malformed fixture edges before they can enter an ablation", () => {
    const fixture = loadFixtures()[0];

    expect(() =>
      legacyWorkflowFixtureSchema.parse({
        ...fixture,
        edges: [{ id: "broken", sourceNodeId: fixture.nodes[0].id, targetNodeId: "missing", kind: "calls", label: null }]
      })
    ).toThrow(/missing endpoint/);
  });
});
