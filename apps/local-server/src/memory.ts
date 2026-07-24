import crypto from "node:crypto";
import fsSync from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  memoryContextSchema,
  memoryUpdateSchema,
  type AgentKind,
  type MemoryContext,
  type MemoryEntryStatus,
  type MemoryEntryType,
  type MemoryUpdate
} from "@graphcode/graph-model";
import { z } from "zod";

const MEMORY_SCHEMA_VERSION = 1;
const MAX_ACTIVE_ENTRIES = 128;
const MAX_RETRIEVED_ENTRIES = 8;

const memoryIndexEntrySchema = z.object({
  id: z.string(),
  type: z.enum(["semantic", "procedural", "episodic"]),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  tags: z.array(z.string()),
  scopePaths: z.array(z.string()),
  sourcePaths: z.array(z.string()),
  sourceHashes: z.record(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastVerifiedAt: z.string(),
  runId: z.string().nullable(),
  agentKind: z.enum(["planning", "coding", "review", "scanning"]),
  confidence: z.enum(["low", "medium", "high"]),
  status: z.enum(["proposed", "active", "stale", "superseded"]),
  file: z.string()
});

const memoryIndexSchema = z.object({
  schemaVersion: z.literal(MEMORY_SCHEMA_VERSION),
  updatedAt: z.string(),
  entries: z.array(memoryIndexEntrySchema)
});

type MemoryIndex = z.infer<typeof memoryIndexSchema>;
type MemoryIndexEntry = z.infer<typeof memoryIndexEntrySchema>;

export class WorkspaceMemoryStore {
  ensureSync(workspaceRoot: string): void {
    const memoryRoot = path.join(workspaceRoot, ".graphcode", "memory");
    for (const directory of ["semantic", "procedural", "episodic"]) {
      fsSync.mkdirSync(path.join(memoryRoot, directory), { recursive: true });
    }
    ensureFileSync(path.join(memoryRoot, "memory_summary.md"), "# Workspace memory summary\n\nNo durable memory has been recorded yet.\n");
    ensureFileSync(path.join(memoryRoot, "MEMORY.md"), "# Workspace memory\n\nNo entries.\n");
    ensureFileSync(
      path.join(memoryRoot, "index.json"),
      `${JSON.stringify({ schemaVersion: MEMORY_SCHEMA_VERSION, updatedAt: new Date(0).toISOString(), entries: [] }, null, 2)}\n`
    );
  }

  async read(
    workspaceRoot: string,
    query: { agentKind: AgentKind; prompt: string; scopePaths: string[] }
  ): Promise<MemoryContext> {
    const memoryRoot = await this.ensure(workspaceRoot);
    const index = await this.loadIndex(memoryRoot);
    const refreshed = await this.refreshStaleness(workspaceRoot, memoryRoot, index);
    const terms = tokenize([query.prompt, query.agentKind, ...query.scopePaths].join(" "));
    const candidates = refreshed.entries
      .filter((entry) => entry.status === "active")
      .map((entry) => ({ entry, score: scoreEntry(entry, terms, query.scopePaths) }))
      .filter(({ score }) => score > 0 || terms.size === 0)
      .sort((left, right) => right.score - left.score || right.entry.updatedAt.localeCompare(left.entry.updatedAt))
      .slice(0, MAX_RETRIEVED_ENTRIES);
    const entries = await Promise.all(
      candidates.map(async ({ entry }) => ({
        id: entry.id,
        type: entry.type,
        title: entry.title,
        summary: entry.summary,
        content: await readEntryBody(path.join(memoryRoot, entry.file)),
        tags: entry.tags,
        scopePaths: entry.scopePaths,
        sourcePaths: entry.sourcePaths,
        status: entry.status,
        confidence: entry.confidence
      }))
    );
    const summary = await fs.readFile(path.join(memoryRoot, "memory_summary.md"), "utf8").catch(() => "");
    return memoryContextSchema.parse({ summary, entries });
  }

  async apply(
    workspaceRoot: string,
    input: { runId: string | null; agentKind: AgentKind; updates: MemoryUpdate[] }
  ): Promise<void> {
    if (input.updates.length === 0) {
      return;
    }
    const memoryRoot = await this.ensure(workspaceRoot);
    const index = await this.loadIndex(memoryRoot);
    const now = new Date().toISOString();
    for (const rawUpdate of input.updates) {
      const update = memoryUpdateSchema.parse(rawUpdate);
      assertSafeMemoryContent(update);
      const id = `${update.type}:${update.slug}`;
      const existing = index.entries.find((entry) => entry.id === id);
      if (update.action === "supersede" && update.supersedes) {
        const superseded = index.entries.find((entry) => entry.slug === update.supersedes);
        if (superseded) {
          superseded.status = "superseded";
          superseded.updatedAt = now;
          await this.writeEntry(memoryRoot, superseded, await readEntryBody(path.join(memoryRoot, superseded.file)));
        }
      }
      const sourceHashes = await hashSources(workspaceRoot, update.sourcePaths, true);
      const status: MemoryEntryStatus = input.agentKind === "coding" ? "proposed" : "active";
      const entry: MemoryIndexEntry = {
        id,
        type: update.type,
        slug: update.slug,
        title: update.title,
        summary: update.summary,
        tags: [...new Set(update.tags.map((tag) => tag.toLowerCase()))],
        scopePaths: [...new Set(update.scopePaths.map(normalizeRelativePath))],
        sourcePaths: [...new Set(update.sourcePaths.map(normalizeRelativePath))],
        sourceHashes,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        lastVerifiedAt: now,
        runId: input.runId,
        agentKind: input.agentKind,
        confidence: update.confidence,
        status,
        file: `${update.type}/${update.slug}.md`
      };
      if (existing) {
        Object.assign(existing, entry);
      } else {
        index.entries.push(entry);
      }
      await this.writeEntry(memoryRoot, entry, update.content);
    }
    trimActiveEntries(index.entries);
    index.updatedAt = now;
    await this.writeIndexes(memoryRoot, index);
  }

  async promoteRun(workspaceRoot: string, runId: string): Promise<void> {
    const memoryRoot = await this.ensure(workspaceRoot);
    const index = await this.loadIndex(memoryRoot);
    const now = new Date().toISOString();
    let changed = false;
    for (const entry of index.entries) {
      if (entry.runId === runId && entry.status === "proposed") {
        entry.status = "active";
        entry.updatedAt = now;
        entry.lastVerifiedAt = now;
        await this.writeEntry(memoryRoot, entry, await readEntryBody(path.join(memoryRoot, entry.file)));
        changed = true;
      }
    }
    if (changed) {
      index.updatedAt = now;
      await this.writeIndexes(memoryRoot, index);
    }
  }

  private async ensure(workspaceRoot: string): Promise<string> {
    const memoryRoot = path.join(workspaceRoot, ".graphcode", "memory");
    await Promise.all(
      ["semantic", "procedural", "episodic"].map((directory) => fs.mkdir(path.join(memoryRoot, directory), { recursive: true }))
    );
    await ensureFile(path.join(memoryRoot, "memory_summary.md"), "# Workspace memory summary\n\nNo durable memory has been recorded yet.\n");
    await ensureFile(path.join(memoryRoot, "MEMORY.md"), "# Workspace memory\n\nNo entries.\n");
    await ensureFile(
      path.join(memoryRoot, "index.json"),
      `${JSON.stringify({ schemaVersion: MEMORY_SCHEMA_VERSION, updatedAt: new Date(0).toISOString(), entries: [] }, null, 2)}\n`
    );
    return memoryRoot;
  }

  private async loadIndex(memoryRoot: string): Promise<MemoryIndex> {
    const raw = await fs.readFile(path.join(memoryRoot, "index.json"), "utf8");
    return memoryIndexSchema.parse(JSON.parse(raw));
  }

  private async refreshStaleness(workspaceRoot: string, memoryRoot: string, index: MemoryIndex): Promise<MemoryIndex> {
    let changed = false;
    for (const entry of index.entries) {
      if (entry.status !== "active" && entry.status !== "proposed") {
        continue;
      }
      const current = await hashSources(workspaceRoot, entry.sourcePaths);
      if (Object.entries(entry.sourceHashes).some(([sourcePath, contentHash]) => current[sourcePath] !== contentHash)) {
        entry.status = "stale";
        entry.updatedAt = new Date().toISOString();
        await this.writeEntry(memoryRoot, entry, await readEntryBody(path.join(memoryRoot, entry.file)));
        changed = true;
      }
    }
    if (changed) {
      index.updatedAt = new Date().toISOString();
      await this.writeIndexes(memoryRoot, index);
    }
    return index;
  }

  private async writeEntry(memoryRoot: string, entry: MemoryIndexEntry, content: string): Promise<void> {
    const frontmatter = [
      "---",
      `id: ${JSON.stringify(entry.id)}`,
      `type: ${entry.type}`,
      `title: ${JSON.stringify(entry.title)}`,
      `summary: ${JSON.stringify(entry.summary)}`,
      `tags: ${JSON.stringify(entry.tags)}`,
      `scopePaths: ${JSON.stringify(entry.scopePaths)}`,
      `sourcePaths: ${JSON.stringify(entry.sourcePaths)}`,
      `sourceHashes: ${JSON.stringify(entry.sourceHashes)}`,
      `createdAt: ${JSON.stringify(entry.createdAt)}`,
      `updatedAt: ${JSON.stringify(entry.updatedAt)}`,
      `lastVerifiedAt: ${JSON.stringify(entry.lastVerifiedAt)}`,
      `runId: ${JSON.stringify(entry.runId)}`,
      `agentKind: ${entry.agentKind}`,
      `confidence: ${entry.confidence}`,
      `status: ${entry.status}`,
      "---",
      "",
      content.trim(),
      ""
    ].join("\n");
    await atomicWrite(path.join(memoryRoot, entry.file), frontmatter);
  }

  private async writeIndexes(memoryRoot: string, index: MemoryIndex): Promise<void> {
    index.entries.sort((left, right) => left.type.localeCompare(right.type) || left.slug.localeCompare(right.slug));
    await atomicWrite(path.join(memoryRoot, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
    const active = index.entries.filter((entry) => entry.status === "active");
    const catalog = [
      "# Workspace memory",
      "",
      ...(["semantic", "procedural", "episodic"] as MemoryEntryType[]).flatMap((type) => {
        const entries = index.entries.filter((entry) => entry.type === type);
        return [
          `## ${type[0].toUpperCase()}${type.slice(1)}`,
          "",
          ...(entries.length
            ? entries.map((entry) => `- [${entry.title}](${entry.file}) — ${entry.summary} \`${entry.status}\``)
            : ["No entries."]),
          ""
        ];
      })
    ].join("\n");
    await atomicWrite(path.join(memoryRoot, "MEMORY.md"), `${catalog.trim()}\n`);
    const summary = [
      "# Workspace memory summary",
      "",
      "Current source and graph evidence override these durable notes.",
      "",
      ...active
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, 12)
        .map((entry) => `- **${entry.title}:** ${entry.summary}`)
    ].join("\n");
    await atomicWrite(path.join(memoryRoot, "memory_summary.md"), `${summary.trim()}\n`);
  }
}

async function hashSources(workspaceRoot: string, sourcePaths: string[], requireExisting = false): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  for (const sourcePath of sourcePaths) {
    const normalized = normalizeRelativePath(sourcePath);
    const absolute = safeWorkspacePath(workspaceRoot, normalized);
    const content = await fs.readFile(absolute).catch(() => null);
    if (!content && requireExisting) {
      throw new Error(`Memory source path does not exist or cannot be read: ${normalized}`);
    }
    hashes[normalized] = content ? crypto.createHash("sha256").update(content).digest("hex") : "missing";
  }
  return hashes;
}

function safeWorkspacePath(workspaceRoot: string, relativePath: string): string {
  const absolute = path.resolve(workspaceRoot, relativePath);
  const normalizedRoot = path.resolve(workspaceRoot);
  if (absolute !== normalizedRoot && !absolute.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error(`Memory source path escapes the workspace: ${relativePath}`);
  }
  return absolute;
}

function normalizeRelativePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\/+/, "");
}

function tokenize(value: string): Set<string> {
  return new Set(value.toLowerCase().split(/[^a-z0-9_.:/-]+/).filter((token) => token.length >= 3));
}

function scoreEntry(entry: MemoryIndexEntry, terms: Set<string>, scopePaths: string[]): number {
  const haystack = tokenize([entry.title, entry.summary, entry.tags.join(" "), entry.scopePaths.join(" "), entry.sourcePaths.join(" ")].join(" "));
  let score = 0;
  for (const term of terms) {
    if (haystack.has(term)) score += 2;
  }
  for (const scopePath of scopePaths.map(normalizeRelativePath)) {
    if (entry.scopePaths.some((candidate) => scopePath.startsWith(candidate) || candidate.startsWith(scopePath))) score += 8;
    if (entry.sourcePaths.includes(scopePath)) score += 12;
  }
  return score;
}

function trimActiveEntries(entries: MemoryIndexEntry[]): void {
  const active = entries
    .filter((entry) => entry.status === "active")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  for (const entry of active.slice(MAX_ACTIVE_ENTRIES)) {
    entry.status = "superseded";
  }
}

function assertSafeMemoryContent(update: MemoryUpdate): void {
  const material = `${update.title}\n${update.summary}\n${update.content}`;
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*\S+/i.test(material)) {
    throw new Error(`Memory update ${update.slug} appears to contain secret material.`);
  }
  if (/(?:chain[- ]of[- ]thought|hidden reasoning|raw transcript|system prompt dump)/i.test(material)) {
    throw new Error(`Memory update ${update.slug} contains prohibited transcript or hidden-reasoning material.`);
  }
}

async function readEntryBody(filePath: string): Promise<string> {
  const raw = await fs.readFile(filePath, "utf8");
  const match = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  return (match?.[1] ?? raw).trim();
}

async function ensureFile(filePath: string, content: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    await atomicWrite(filePath, content);
  }
}

function ensureFileSync(filePath: string, content: string): void {
  if (!fsSync.existsSync(filePath)) {
    fsSync.writeFileSync(filePath, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
  }
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  await fs.writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporary, filePath);
}
