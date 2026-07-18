import fs from "node:fs";
import path from "node:path";

export const DEFAULT_SERVER_PORT = 3010;
export const DEFAULT_SERVER_HOST = "127.0.0.1";

export type AgentFeatureFlags = {
  graphPartitionedWorkflows: boolean;
  workUnitContext: boolean;
  modelRouterV2: boolean;
  edgeContracts: boolean;
  integrationGate: boolean;
};

export function resolveAgentFeatureFlags(env: NodeJS.ProcessEnv = process.env): AgentFeatureFlags {
  return {
    graphPartitionedWorkflows: defaultOnFlag(env.GRAPHCODE_GRAPH_PARTITIONED_WORKFLOWS),
    workUnitContext: defaultOnFlag(env.GRAPHCODE_WORK_UNIT_CONTEXT),
    modelRouterV2: defaultOnFlag(env.GRAPHCODE_MODEL_ROUTER_V2),
    edgeContracts: defaultOnFlag(env.GRAPHCODE_EDGE_CONTRACTS),
    integrationGate: defaultOnFlag(env.GRAPHCODE_INTEGRATION_GATE)
  };
}

export function resolveDbPath(input = process.env.GRAPHCODE_DB_PATH): string {
  const dbPath = input && input.length > 0 ? input : path.join(resolveRepoRoot(), ".graphcode", "graphcode.sqlite");
  return path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
}

export function resolveServerPort(input = process.env.GRAPHCODE_SERVER_PORT ?? process.env.PORT): number {
  if (!input) {
    return DEFAULT_SERVER_PORT;
  }

  const port = Number.parseInt(input, 10);
  return Number.isFinite(port) && port > 0 ? port : DEFAULT_SERVER_PORT;
}

export function resolveServerHost(input = process.env.GRAPHCODE_SERVER_HOST): string {
  return input?.trim() || DEFAULT_SERVER_HOST;
}

export function resolveRepoRoot(startDir = process.cwd()): string {
  let current = path.resolve(startDir);

  while (true) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(startDir);
    }
    current = parent;
  }
}

function defaultOnFlag(value: string | undefined): boolean {
  if (value === undefined) return true;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return false;
}
