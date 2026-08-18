import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WorkspaceMemoryStore } from "./memory";

describe("WorkspaceMemoryStore", () => {
  it("bootstraps typed memory, retrieves active entries, and filters stale source facts", async () => {
    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "graphcode-memory-"));
    fs.mkdirSync(path.join(rootPath, "src"), { recursive: true });
    fs.writeFileSync(path.join(rootPath, "src", "model.py"), "hidden = 192\n", "utf8");
    const store = new WorkspaceMemoryStore();
    store.ensureSync(rootPath);

    await store.apply(rootPath, {
      runId: "scan-1",
      agentKind: "scanning",
      updates: [
        {
          action: "upsert",
          type: "semantic",
          slug: "student-hidden-size",
          title: "Student hidden size",
          summary: "The student model uses hidden size 192.",
          content: "The configured student trunk and heads use H=192.",
          tags: ["student", "model"],
          scopePaths: ["src"],
          sourcePaths: ["src/model.py"],
          confidence: "high",
          supersedes: null
        }
      ]
    });

    const active = await store.read(rootPath, { agentKind: "planning", prompt: "student model", scopePaths: ["src/model.py"] });
    expect(active.entries.map((entry) => entry.id)).toEqual(["semantic:student-hidden-size"]);
    expect(fs.existsSync(path.join(rootPath, ".graphcode", "memory", "semantic", "student-hidden-size.md"))).toBe(true);
    expect(fs.readFileSync(path.join(rootPath, ".graphcode", "memory", "MEMORY.md"), "utf8")).toContain("Student hidden size");

    fs.writeFileSync(path.join(rootPath, "src", "model.py"), "hidden = 256\n", "utf8");
    const stale = await store.read(rootPath, { agentKind: "review", prompt: "student model", scopePaths: ["src/model.py"] });
    expect(stale.entries).toEqual([]);
    expect(JSON.parse(fs.readFileSync(path.join(rootPath, ".graphcode", "memory", "index.json"), "utf8")).entries[0].status).toBe("stale");
  });

  it("keeps coding memory proposed until the coding run is implemented", async () => {
    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "graphcode-memory-code-"));
    const store = new WorkspaceMemoryStore();
    store.ensureSync(rootPath);

    await store.apply(rootPath, {
      runId: "coding-1",
      agentKind: "coding",
      updates: [
        {
          action: "upsert",
          type: "procedural",
          slug: "model-verifier",
          title: "Model verifier",
          summary: "Run the model verifier after graph edits.",
          content: "Instantiate both configured models and compare their graph invariants.",
          tags: ["verification"],
          scopePaths: [],
          sourcePaths: [],
          confidence: "medium",
          supersedes: null
        }
      ]
    });

    expect((await store.read(rootPath, { agentKind: "coding", prompt: "verifier", scopePaths: [] })).entries).toEqual([]);
    await store.promoteRun(rootPath, "coding-1");
    expect((await store.read(rootPath, { agentKind: "review", prompt: "model verifier", scopePaths: [] })).entries).toHaveLength(1);
  });

  it("rejects secret-like material before writing an entry", async () => {
    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "graphcode-memory-secret-"));
    const store = new WorkspaceMemoryStore();
    await expect(
      store.apply(rootPath, {
        runId: "planning-1",
        agentKind: "planning",
        updates: [
          {
            action: "upsert",
            type: "episodic",
            slug: "unsafe-note",
            title: "Unsafe note",
            summary: "Contains a credential.",
            content: "api_key = super-secret-value",
            tags: [],
            scopePaths: [],
            sourcePaths: [],
            confidence: "low",
            supersedes: null
          }
        ]
      })
    ).rejects.toThrow(/secret material/);
  });

  it("supersedes deterministic entries and makes active memory available to every agent role", async () => {
    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "graphcode-memory-supersede-"));
    const store = new WorkspaceMemoryStore();
    await store.apply(rootPath, {
      runId: "planning-1",
      agentKind: "planning",
      updates: [
        {
          action: "upsert",
          type: "semantic",
          slug: "old-model-contract",
          title: "Old model contract",
          summary: "The original model contract is retained for history.",
          content: "This fact is superseded by the verified v2 contract.",
          tags: ["model"],
          scopePaths: [],
          sourcePaths: [],
          confidence: "medium",
          supersedes: null
        }
      ]
    });
    await store.apply(rootPath, {
      runId: "scan-2",
      agentKind: "scanning",
      updates: [
        {
          action: "supersede",
          type: "semantic",
          slug: "v2-model-contract",
          title: "V2 model contract",
          summary: "The verified v2 contract replaces the original note.",
          content: "Use the source-backed v2 model contract.",
          tags: ["model", "v2"],
          scopePaths: [],
          sourcePaths: [],
          confidence: "high",
          supersedes: "old-model-contract"
        }
      ]
    });

    for (const agentKind of ["planning", "coding", "review", "scanning"] as const) {
      const memory = await store.read(rootPath, { agentKind, prompt: "v2 model contract", scopePaths: [] });
      expect(memory.entries.map((entry) => entry.id)).toEqual(["semantic:v2-model-contract"]);
    }
    const index = JSON.parse(fs.readFileSync(path.join(rootPath, ".graphcode", "memory", "index.json"), "utf8"));
    expect(index.entries.find((entry: { id: string }) => entry.id === "semantic:old-model-contract").status).toBe("superseded");
  });

  it("rejects traversal, missing sources, and oversized entries before writing", async () => {
    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "graphcode-memory-invalid-"));
    const store = new WorkspaceMemoryStore();
    const baseUpdate = {
      action: "upsert" as const,
      type: "procedural" as const,
      slug: "safe-procedure",
      title: "Safe procedure",
      summary: "A bounded, repository-scoped procedure.",
      content: "Run the focused verifier.",
      tags: [],
      scopePaths: [],
      sourcePaths: [],
      confidence: "medium" as const,
      supersedes: null
    };

    await expect(
      store.apply(rootPath, {
        runId: "planning-invalid",
        agentKind: "planning",
        updates: [{ ...baseUpdate, sourcePaths: ["../outside.txt"] }]
      })
    ).rejects.toThrow(/repository-relative|parent traversal/i);
    await expect(
      store.apply(rootPath, {
        runId: "planning-missing",
        agentKind: "planning",
        updates: [{ ...baseUpdate, sourcePaths: ["src/missing.ts"] }]
      })
    ).rejects.toThrow(/does not exist/);
    await expect(
      store.apply(rootPath, {
        runId: "planning-oversized",
        agentKind: "planning",
        updates: [{ ...baseUpdate, content: "x".repeat(32_769) }]
      })
    ).rejects.toThrow();
    expect(JSON.parse(fs.readFileSync(path.join(rootPath, ".graphcode", "memory", "index.json"), "utf8")).entries).toEqual([]);
  });
});
