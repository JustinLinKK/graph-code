import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SERVER_PORT, resolveAgentFeatureFlags, resolveDbPath, resolveServerPort } from "./config";

describe("local server config", () => {
  it("prefers the explicit GraphCode server port and rejects invalid values", () => {
    expect(resolveServerPort("4123")).toBe(4123);
    expect(resolveServerPort("not-a-port")).toBe(DEFAULT_SERVER_PORT);
    expect(resolveServerPort("-1")).toBe(DEFAULT_SERVER_PORT);
  });

  it("resolves relative database overrides from the current working directory", () => {
    expect(resolveDbPath(path.join(".graphcode", "custom.sqlite"))).toBe(path.resolve(".graphcode", "custom.sqlite"));
  });

  it("enables the observed MA-7 workflow by default and parses explicit rollback flags", () => {
    expect(resolveAgentFeatureFlags({})).toEqual({
      graphPartitionedWorkflows: true,
      workUnitContext: true,
      modelRouterV2: true,
      edgeContracts: true,
      integrationGate: true
    });
    expect(
      resolveAgentFeatureFlags({
        GRAPHCODE_GRAPH_PARTITIONED_WORKFLOWS: "false",
        GRAPHCODE_WORK_UNIT_CONTEXT: "0",
        GRAPHCODE_MODEL_ROUTER_V2: "no",
        GRAPHCODE_EDGE_CONTRACTS: "off",
        GRAPHCODE_INTEGRATION_GATE: "true"
      })
    ).toEqual({
      graphPartitionedWorkflows: false,
      workUnitContext: false,
      modelRouterV2: false,
      edgeContracts: false,
      integrationGate: true
    });
    expect(resolveAgentFeatureFlags({ GRAPHCODE_MODEL_ROUTER_V2: "typo" }).modelRouterV2).toBe(false);
  });
});
