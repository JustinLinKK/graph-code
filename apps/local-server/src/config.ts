import fs from "node:fs";
import path from "node:path";

export const DEFAULT_SERVER_PORT = 3010;
export const DEFAULT_SERVER_HOST = "127.0.0.1";

export function resolveDbPath(input = process.env.GRAPHCODE_DB_PATH): string {
  const dbPath = input && input.length > 0 ? input : path.join(resolveRepoRoot(), ".graphcode", "graphcode.sqlite");
  return path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
}

export function resolveServerPort(input = process.env.PORT): number {
  if (!input) {
    return DEFAULT_SERVER_PORT;
  }

  const port = Number.parseInt(input, 10);
  return Number.isFinite(port) ? port : DEFAULT_SERVER_PORT;
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
