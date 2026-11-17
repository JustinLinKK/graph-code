import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  getCommandContext,
  listCommands,
  registerCommand,
  runCommand,
  syncCommandCenter
} from "./commands";
import { controlCommandToInvocation } from "./voice/controlCommandMap";

function createFakeDeps() {
  return {
    openWorkspaceRequest: vi.fn().mockResolvedValue(undefined),
    openWorkspacePicker: vi.fn().mockResolvedValue(undefined),
    selectNode: vi.fn().mockResolvedValue(undefined),
    runScanning: vi.fn().mockResolvedValue(undefined),
    runPlanning: vi.fn().mockResolvedValue(undefined),
    startCode: vi.fn().mockResolvedValue(undefined),
    runReview: vi.fn().mockResolvedValue(undefined),
    applyPlanningPatch: vi.fn().mockResolvedValue(undefined),
    implementCodeProposal: vi.fn().mockResolvedValue(undefined),
    codingControl: vi.fn().mockResolvedValue(undefined),
    autoLayout: vi.fn().mockResolvedValue(undefined),
    showFullGraph: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    openSettings: vi.fn(),
    resetWorkspace: vi.fn().mockResolvedValue(undefined),
    setCanvasMode: vi.fn(),
    viewport: vi.fn()
  };
}

function createSnapshot(overrides: Partial<ReturnType<typeof getCommandContext>> = {}) {
  return {
    projectId: "p1",
    projectName: "demo",
    selectedNodeId: null,
    scopeNodeId: null,
    nodes: [
      { id: "n1", name: "parser" },
      { id: "n2", name: "renderer" }
    ],
    agentRuns: [],
    hasActiveCodingWorkflow: false,
    ...overrides
  };
}

describe("command center", () => {
  it("lists built-in commands", () => {
    const commands = listCommands();
    expect(commands.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        "open_workspace",
        "focus_node",
        "scan",
        "plan",
        "code",
        "review",
        "apply",
        "git_status",
        "auto_layout",
        "canvas_mode",
        "viewport",
        "coding_control"
      ])
    );
  });

  it("rejects unknown commands", async () => {
    const result = await runCommand("no_such_command");
    expect(result.ok).toBe(false);
    expect(result.summary).toContain("未知命令");
  });

  it("rejects commands before sync", async () => {
    const result = await runCommand("scan");
    expect(result.ok).toBe(false);
    expect(result.summary).toBe("命令层尚未就绪");
  });

  it("runs scan after sync", async () => {
    const deps = createFakeDeps();
    syncCommandCenter(deps, createSnapshot());
    const result = await runCommand("scan", {});
    expect(result.ok).toBe(true);
    expect(deps.runScanning).toHaveBeenCalled();
    expect(result.summary).toBe("扫描已完成");
  });

  it("guards missing project", async () => {
    const deps = createFakeDeps();
    syncCommandCenter(deps, createSnapshot({ projectId: null }));
    const result = await runCommand("scan", {});
    expect(result.ok).toBe(false);
    expect(result.summary).toBe("请先打开一个仓库");
    expect(deps.runScanning).not.toHaveBeenCalled();
  });

  it("focuses node by name", async () => {
    const deps = createFakeDeps();
    syncCommandCenter(deps, createSnapshot());
    const result = await runCommand("focus_node", { nodeName: "parser" });
    expect(result.ok).toBe(true);
    expect(deps.selectNode).toHaveBeenCalledWith("n1");
    expect(result.summary).toBe("已聚焦 parser");
  });

  it("focuses node by id", async () => {
    const deps = createFakeDeps();
    syncCommandCenter(deps, createSnapshot());
    const result = await runCommand("focus_node", { nodeId: "n2" });
    expect(result.ok).toBe(true);
    expect(deps.selectNode).toHaveBeenCalledWith("n2");
  });

  it("focuses falls back to selected node", async () => {
    const deps = createFakeDeps();
    syncCommandCenter(deps, createSnapshot({ selectedNodeId: "n1" }));
    const result = await runCommand("focus_node", {});
    expect(result.ok).toBe(true);
    expect(deps.selectNode).toHaveBeenCalledWith("n1");
  });

  it("rejects ambiguous node name", async () => {
    const deps = createFakeDeps();
    syncCommandCenter(deps, createSnapshot({ nodes: [{ id: "n1", name: "parserA" }, { id: "n2", name: "parserB" }] }));
    const result = await runCommand("focus_node", { nodeName: "parser" });
    expect(result.ok).toBe(false);
    expect(result.summary).toContain("parser");
    expect(deps.selectNode).not.toHaveBeenCalled();
  });

  it("validates command arguments", async () => {
    const deps = createFakeDeps();
    syncCommandCenter(deps, createSnapshot());
    const result = await runCommand("plan", {});
    expect(result.ok).toBe(false);
    expect(result.summary).toContain("参数错误");
  });

  it("runs auto layout after sync", async () => {
    const deps = createFakeDeps();
    syncCommandCenter(deps, createSnapshot());
    const result = await runCommand("auto_layout", {});
    expect(result.ok).toBe(true);
    expect(deps.autoLayout).toHaveBeenCalled();
    expect(result.summary).toBe("已自动布局");
  });

  it("switches canvas mode after sync", async () => {
    const deps = createFakeDeps();
    syncCommandCenter(deps, createSnapshot());
    const result = await runCommand("canvas_mode", { mode: "3d" });
    expect(result.ok).toBe(true);
    expect(deps.setCanvasMode).toHaveBeenCalledWith("3d");
    expect(result.summary).toBe("已切换到3D视图");
  });

  it("auto layout guards missing project", async () => {
    const deps = createFakeDeps();
    syncCommandCenter(deps, createSnapshot({ projectId: null }));
    const result = await runCommand("auto_layout", {});
    expect(result.ok).toBe(false);
    expect(deps.autoLayout).not.toHaveBeenCalled();
  });

  it("allows custom command registration", () => {
    const name = `test-${Date.now()}`;
    registerCommand({
      name,
      description: "test",
      argsSchema: expect.anything() as z.ZodType<unknown>,
      run: async () => ({ ok: true, summary: "ok" })
    });
    expect(listCommands().some((c) => c.name === name)).toBe(true);
  });
});

describe("control command mapping", () => {
  it("maps all ControlCommand kinds", () => {
    const cases: { input: Parameters<typeof controlCommandToInvocation>[0]; expected: string }[] = [
      { input: { kind: "viewport", action: "zoom-in" }, expected: "viewport" },
      { input: { kind: "canvas-mode", mode: "3d" }, expected: "canvas_mode" },
      { input: { kind: "ai-planning", prompt: "plan" }, expected: "plan" },
      { input: { kind: "ai-scan" }, expected: "scan" },
      { input: { kind: "ai-review" }, expected: "review" },
      { input: { kind: "ai-start-code" }, expected: "code" },
      { input: { kind: "auto-layout" }, expected: "auto_layout" },
      { input: { kind: "coding-control", action: "pause" }, expected: "coding_control" },
      { input: { kind: "system", action: "settings" }, expected: "open_settings" },
      { input: { kind: "system", action: "refresh" }, expected: "refresh" },
      { input: { kind: "system", action: "open-workspace" }, expected: "open_workspace" },
      { input: { kind: "system", action: "reset-workspace" }, expected: "reset_workspace" }
    ];
    for (const { input, expected } of cases) {
      expect(controlCommandToInvocation(input).name).toBe(expected);
    }
  });
});
