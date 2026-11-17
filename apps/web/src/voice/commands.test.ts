import type { AgentRun } from "@graphcode/graph-model";
import { describe, expect, it } from "vitest";
import { isHelp, isStop, normalize, parseCommand, resolveReviewTargetRunId } from "./commands";
import { requiresProjectByKind } from "./types";

describe("normalize", () => {
  it("trims, lowercases, collapses whitespace, strips trailing punctuation", () => {
    expect(normalize("  放大。  ", "zh-CN")).toBe("放大");
    expect(normalize("Zoom In!", "en-US")).toBe("zoom in");
  });

  it("strips a leading please for english", () => {
    expect(normalize("please zoom in", "en-US")).toBe("zoom in");
  });
});

describe("parseCommand", () => {
  it("maps chinese viewport triggers", () => {
    expect(parseCommand("放大", "zh-CN")).toMatchObject({ type: "command", parsed: { command: { kind: "viewport", action: "zoom-in" } } });
    expect(parseCommand("缩小", "zh-CN")).toMatchObject({ type: "command", parsed: { command: { kind: "viewport", action: "zoom-out" } } });
    expect(parseCommand("适应视图", "zh-CN")).toMatchObject({ type: "command", parsed: { command: { kind: "viewport", action: "fit" } } });
    expect(parseCommand("回到根", "zh-CN")).toMatchObject({ type: "command", parsed: { command: { kind: "viewport", action: "show-full" } } });
    expect(parseCommand("上移", "zh-CN")).toMatchObject({ type: "command", parsed: { command: { kind: "viewport", action: "pan", direction: "up" } } });
  });

  it("maps english viewport triggers with the right priority", () => {
    expect(parseCommand("zoom out", "en-US")).toMatchObject({ type: "command", parsed: { command: { kind: "viewport", action: "zoom-out" } } });
    expect(parseCommand("zoom", "en-US")).toMatchObject({ type: "command", parsed: { command: { kind: "viewport", action: "zoom-in" } } });
  });

  it("extracts a planning prompt from dictation", () => {
    expect(parseCommand("帮我规划重构登录模块", "zh-CN")).toMatchObject({
      type: "command",
      parsed: { command: { kind: "ai-planning", prompt: "重构登录模块" } }
    });
    expect(parseCommand("plan add retry logic", "en-US")).toMatchObject({
      type: "command",
      parsed: { command: { kind: "ai-planning", prompt: "add retry logic" } }
    });
  });

  it("signals when a planning trigger has no prompt", () => {
    expect(parseCommand("规划", "zh-CN")).toEqual({ type: "planning-needs-prompt" });
  });

  it("maps canvas mode triggers", () => {
    expect(parseCommand("3d视图", "zh-CN")).toMatchObject({
      type: "command",
      parsed: { command: { kind: "canvas-mode", mode: "3d" }, ack: "已切换到3D视图。" }
    });
    expect(parseCommand("切换2d", "zh-CN")).toMatchObject({
      type: "command",
      parsed: { command: { kind: "canvas-mode", mode: "2d" }, ack: "已切换到2D视图。" }
    });
    expect(parseCommand("switch to 3d", "en-US")).toMatchObject({
      type: "command",
      parsed: { command: { kind: "canvas-mode", mode: "3d" }, ack: "Switched to 3D view." }
    });
  });

  it("maps ai and system commands", () => {
    expect(parseCommand("扫描", "zh-CN")).toMatchObject({ type: "command", parsed: { command: { kind: "ai-scan" } } });
    expect(parseCommand("打开设置", "zh-CN")).toMatchObject({ type: "command", parsed: { command: { kind: "system", action: "settings" } } });
    expect(parseCommand("暂停", "zh-CN")).toMatchObject({ type: "command", parsed: { command: { kind: "coding-control", action: "pause" } } });
  });

  it("maps auto layout triggers", () => {
    expect(parseCommand("自动布局", "zh-CN")).toMatchObject({ type: "command", parsed: { command: { kind: "auto-layout" } } });
    expect(parseCommand("整理画布", "zh-CN")).toMatchObject({ type: "command", parsed: { command: { kind: "auto-layout" } } });
    expect(parseCommand("auto layout", "en-US")).toMatchObject({ type: "command", parsed: { command: { kind: "auto-layout" } } });
  });

  it("keeps planning priority over layout wording", () => {
    expect(parseCommand("规划布局调整", "zh-CN")).toMatchObject({
      type: "command",
      parsed: { command: { kind: "ai-planning", prompt: "布局调整" } }
    });
  });

  it("returns unknown for gibberish", () => {
    expect(parseCommand("xylophone 123", "en-US")).toEqual({ type: "unknown" });
  });
});

describe("help / stop", () => {
  it("help does not swallow planning dictation", () => {
    expect(isHelp("help me plan the login", "en-US")).toBe(false);
    expect(isHelp("help", "en-US")).toBe(true);
    expect(isHelp("帮助", "zh-CN")).toBe(true);
  });

  it("stop matches precisely for english", () => {
    expect(isStop("stop", "en-US")).toBe(true);
    expect(isStop("plan how to stop the bug", "en-US")).toBe(false);
    expect(isStop("停止", "zh-CN")).toBe(true);
  });
});

describe("resolveReviewTargetRunId", () => {
  function run(overrides: Partial<AgentRun>): AgentRun {
    return {
      id: "run-1",
      projectId: "p",
      agentKind: "coding",
      codingMode: null,
      reviewMode: null,
      status: "succeeded",
      baseGraphRevision: 0,
      appliedGraphRevision: null,
      implementedAt: null,
      conflictReason: null,
      targetNodeId: null,
      prompt: "",
      response: "",
      diff: "",
      graphPatch: null,
      error: null,
      createdAt: "",
      updatedAt: "",
      ...overrides
    };
  }

  it("returns null when the coding run was already reviewed", () => {
    const runs: AgentRun[] = [
      run({ id: "run-1", agentKind: "coding", status: "succeeded" }),
      run({ id: "run-2", agentKind: "review", prompt: "Review run-1" })
    ];
    expect(resolveReviewTargetRunId(runs)).toBeNull();
  });

  it("finds an unreviewed succeeded coding run", () => {
    const runs: AgentRun[] = [run({ id: "run-1", agentKind: "coding", status: "succeeded" })];
    expect(resolveReviewTargetRunId(runs)).toBe("run-1");
  });

  it("returns null when none qualify", () => {
    expect(resolveReviewTargetRunId([])).toBeNull();
  });
});

describe("requiresProjectByKind", () => {
  it("covers every control command kind", () => {
    const kinds = [
      "viewport",
      "canvas-mode",
      "ai-planning",
      "ai-scan",
      "ai-review",
      "ai-start-code",
      "auto-layout",
      "coding-control",
      "system"
    ];
    for (const kind of kinds) {
      expect(requiresProjectByKind).toHaveProperty(kind);
    }
  });

  it("requires a project for auto-layout", () => {
    expect(requiresProjectByKind["auto-layout"]).toBe(true);
  });
});
