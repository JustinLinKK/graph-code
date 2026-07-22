import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { benchmarkAgentContext } from "@graphcode/agent-runtime";
import { scanRepositoryCodeGraph } from "@graphcode/parser";
import { openDatabase } from "../db/connection";
import { GraphRepository } from "../db/repository";
import { migrate } from "../db/schema";

const PROFILE_FILE_COUNTS = [500, 5_000, 25_000, 100_000] as const;
type ProfileFileCount = (typeof PROFILE_FILE_COUNTS)[number];

type BenchmarkResult = {
  schemaVersion: 1;
  profile: { name: string; sourceFiles: number; filesPerDirectory: number };
  machine: {
    platform: string;
    release: string;
    architecture: string;
    cpuModel: string;
    cpuCount: number;
    totalMemoryBytes: number;
    nodeVersion: string;
  };
  counts: {
    discovered: number;
    supported: number;
    indexed: number;
    unsupported: number;
    excluded: number;
    failed: number;
    silentlyOmitted: number;
    nodes: number;
    edges: number;
  };
  timingsMs: {
    generate: number;
    discovery: number;
    parse: number;
    link: number;
    persist: number;
    hierarchy: number;
    canvas: number;
    context: number;
    total: number;
  };
  payloadBytes: { hierarchy: number; canvas: number };
  agentContext: { promptCharacters: number; chunks: number; nodes: number; edges: number };
  resources: { peakRssBytes: number; sqliteBytes: number };
  completeness: ReturnType<typeof scanRepositoryCodeGraph>["scan"]["completeness"];
};

type CliOptions = {
  profiles: ProfileFileCount[];
  format: "json" | "table" | "both";
  outputPath: string | null;
  keepFixtures: boolean;
};

export async function runScalabilityBenchmark(options: CliOptions): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  for (const fileCount of options.profiles) {
    results.push(await benchmarkProfile(fileCount, options.keepFixtures));
  }
  return results;
}

async function benchmarkProfile(fileCount: ProfileFileCount, keepFixtures: boolean): Promise<BenchmarkResult> {
  const totalStartedAt = performance.now();
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), `graphcode-scale-${fileCount}-`));
  const workspaceRoot = path.join(fixtureRoot, "workspace");
  const dbPath = path.join(fixtureRoot, "graphcode.sqlite");
  const filesPerDirectory = 100;
  let database: ReturnType<typeof openDatabase> | null = null;
  try {
    const generateStartedAt = performance.now();
    generateSyntheticRepository(workspaceRoot, fileCount, filesPerDirectory);
    const generateMs = performance.now() - generateStartedAt;

    const snapshot = scanRepositoryCodeGraph(workspaceRoot);
    database = openDatabase(dbPath);
    migrate(database);
    const repository = new GraphRepository(database);
    repository.createProject({ id: "benchmark", name: `Scalability ${fileCount}`, rootPath: workspaceRoot });

    const persistStartedAt = performance.now();
    const persisted = repository.replaceScannedCodeGraph("benchmark", snapshot);
    const persistMs = performance.now() - persistStartedAt;

    const hierarchyStartedAt = performance.now();
    const hierarchy = repository.getHierarchy("benchmark");
    const hierarchyMs = performance.now() - hierarchyStartedAt;

    const canvasStartedAt = performance.now();
    const canvas = await repository.getCanvasGraph({ projectId: "benchmark", includeAttachments: true });
    const canvasMs = performance.now() - canvasStartedAt;

    const graph = { nodes: repository.listProjectNodes("benchmark"), edges: repository.listProjectEdges("benchmark") };
    const context = benchmarkAgentContext(graph);
    const counts = snapshot.scan.counts;
    const result: BenchmarkResult = {
      schemaVersion: 1,
      profile: { name: `files-${fileCount}`, sourceFiles: fileCount, filesPerDirectory },
      machine: machineSpec(),
      counts: {
        discovered: counts.discovered,
        supported: counts.supported,
        indexed: counts.indexed,
        unsupported: counts.unsupported,
        excluded: counts.excluded,
        failed: counts.failed,
        silentlyOmitted: Math.max(0, counts.discovered - counts.unsupported - counts.excluded - counts.indexed - counts.failed),
        nodes: persisted.nodeCount,
        edges: persisted.edgeCount
      },
      timingsMs: {
        generate: generateMs,
        discovery: snapshot.scan.telemetry.discoveryMs,
        parse: snapshot.scan.telemetry.parseMs,
        link: snapshot.scan.telemetry.linkMs,
        persist: persistMs,
        hierarchy: hierarchyMs,
        canvas: canvasMs,
        context: context.durationMs,
        total: performance.now() - totalStartedAt
      },
      payloadBytes: {
        hierarchy: Buffer.byteLength(JSON.stringify(hierarchy)),
        canvas: Buffer.byteLength(JSON.stringify(canvas))
      },
      agentContext: {
        promptCharacters: context.promptCharacters,
        chunks: context.chunks,
        nodes: context.nodes,
        edges: context.edges
      },
      resources: {
        peakRssBytes: Math.max(snapshot.scan.telemetry.peakRssBytes, process.memoryUsage().rss),
        sqliteBytes: fs.statSync(dbPath).size
      },
      completeness: snapshot.scan.completeness
    };
    return result;
  } finally {
    database?.close();
    if (!keepFixtures) {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    } else {
      process.stderr.write(`Kept benchmark fixture at ${fixtureRoot}\n`);
    }
  }
}

function generateSyntheticRepository(rootPath: string, fileCount: number, filesPerDirectory: number): void {
  fs.mkdirSync(rootPath, { recursive: true });
  for (let index = 0; index < fileCount; index += 1) {
    const directory = path.join(rootPath, "src", `group-${String(Math.floor(index / filesPerDirectory)).padStart(4, "0")}`);
    if (index % filesPerDirectory === 0) {
      fs.mkdirSync(directory, { recursive: true });
    }
    const previous = index > 0 ? `import { value as previous } from "../group-${String(Math.floor((index - 1) / filesPerDirectory)).padStart(4, "0")}/file-${String(index - 1).padStart(6, "0")}";\n` : "";
    fs.writeFileSync(
      path.join(directory, `file-${String(index).padStart(6, "0")}.ts`),
      `${previous}export const value = ${index}${index > 0 ? " + previous" : ""};\n`
    );
  }
}

function machineSpec(): BenchmarkResult["machine"] {
  const cpus = os.cpus();
  return {
    platform: process.platform,
    release: os.release(),
    architecture: process.arch,
    cpuModel: cpus[0]?.model ?? "unknown",
    cpuCount: cpus.length,
    totalMemoryBytes: os.totalmem(),
    nodeVersion: process.version
  };
}

function parseCliOptions(args: string[]): CliOptions {
  const profileValue = optionValue(args, "--profile") ?? "500";
  const profiles = profileValue === "all" ? [...PROFILE_FILE_COUNTS] : profileValue.split(",").map(parseProfile);
  const formatValue = optionValue(args, "--format") ?? "both";
  if (formatValue !== "json" && formatValue !== "table" && formatValue !== "both") {
    throw new Error("--format must be json, table, or both.");
  }
  return {
    profiles,
    format: formatValue,
    outputPath: optionValue(args, "--output"),
    keepFixtures: args.includes("--keep-fixtures")
  };
}

function optionValue(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
}

function parseProfile(value: string): ProfileFileCount {
  const parsed = Number(value.replaceAll("_", ""));
  if (!PROFILE_FILE_COUNTS.includes(parsed as ProfileFileCount)) {
    throw new Error(`Unknown profile ${value}; choose ${PROFILE_FILE_COUNTS.join(", ")} or all.`);
  }
  return parsed as ProfileFileCount;
}

function renderTable(results: BenchmarkResult[]): string {
  const headers = ["Profile", "Indexed", "Omitted", "Parse ms", "Persist ms", "Hierarchy ms", "Canvas ms", "Context chars", "Peak RSS MiB"];
  const rows = results.map((result) => [
    result.profile.name,
    String(result.counts.indexed),
    String(result.counts.silentlyOmitted),
    result.timingsMs.parse.toFixed(1),
    result.timingsMs.persist.toFixed(1),
    result.timingsMs.hierarchy.toFixed(1),
    result.timingsMs.canvas.toFixed(1),
    String(result.agentContext.promptCharacters),
    (result.resources.peakRssBytes / 1024 / 1024).toFixed(1)
  ]);
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index].length)));
  const line = (row: string[]) => row.map((value, index) => value.padEnd(widths[index])).join("  ");
  return [line(headers), line(widths.map((width) => "-".repeat(width))), ...rows.map(line)].join("\n");
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const results = await runScalabilityBenchmark(options);
  const json = `${JSON.stringify({ schemaVersion: 1, results }, null, 2)}\n`;
  if (options.outputPath) {
    fs.mkdirSync(path.dirname(path.resolve(options.outputPath)), { recursive: true });
    fs.writeFileSync(path.resolve(options.outputPath), json);
  }
  if (options.format === "table" || options.format === "both") {
    process.stdout.write(`${renderTable(results)}\n`);
  }
  if (options.format === "json" || options.format === "both") {
    process.stdout.write(json);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
