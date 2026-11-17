import type { AgentRun, ControlCommand, VoiceLanguage } from "@graphcode/graph-model";
import type { ParsedCommand } from "./types";
import { requiresProjectByKind } from "./types";

type PanDirection = "up" | "down" | "left" | "right";

export type ParseResult =
  | { type: "command"; parsed: ParsedCommand }
  | { type: "planning-needs-prompt" }
  | { type: "unknown" };

function lang<T>(language: VoiceLanguage, zh: T, en: T): T {
  return language === "zh-CN" ? zh : en;
}

export function normalize(input: string, language: VoiceLanguage): string {
  let text = input.trim().toLowerCase().replace(/\s+/g, " ");
  text = text.replace(/[.。!！?？]+$/, "").trim();
  if (language === "en-US") {
    text = text.replace(/^please\s+/, "");
  }
  return text;
}

function matches(text: string, triggers: string[]): boolean {
  return triggers.some((trigger) => text.includes(trigger));
}

function build(command: ControlCommand, ack: string): ParsedCommand {
  return { command, ack, requiresProject: requiresProjectByKind[command.kind] };
}

// ---------- feedback (language-resolved) ----------

export function unknownFeedback(language: VoiceLanguage): string {
  return lang(language, "听不懂，请再说一次。", "Sorry, I didn't catch that.");
}

export function planningNeedsPromptFeedback(language: VoiceLanguage): string {
  return lang(language, "请说出规划内容。", "What should I plan?");
}

export function defaultAck(language: VoiceLanguage): string {
  return lang(language, "好的。", "Okay.");
}

export function stoppedFeedback(language: VoiceLanguage): string {
  return lang(language, "已停止语音。", "Voice stopped.");
}

export function recognizerErrorFeedback(error: string, language: VoiceLanguage): string {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return lang(language, "麦克风权限被拒绝。", "Microphone permission was denied.");
  }
  if (error === "no-speech") {
    return lang(language, "没有听到语音。", "No speech detected.");
  }
  if (error === "audio-capture") {
    return lang(language, "无法访问麦克风。", "Could not access the microphone.");
  }
  if (error === "network") {
    return lang(language, "语音识别网络错误。", "Speech recognition network error.");
  }
  if (error === "aborted") {
    return "";
  }
  return lang(language, "语音识别出错。", "Speech recognition failed.");
}

export const contextFeedback = {
  missingProject: (language: VoiceLanguage) => lang(language, "请先打开工作区。", "Open a workspace first."),
  missingNode: (language: VoiceLanguage) => lang(language, "请先选择一个节点。", "Select a node first."),
  noReviewTarget: (language: VoiceLanguage) => lang(language, "没有可审查的代码提案。", "No coding proposal to review."),
  noActiveWorkflow: (language: VoiceLanguage) => lang(language, "没有正在运行的工作流。", "No running workflow."),
  confirmReset: (language: VoiceLanguage) => lang(language, "请在确认框中确认。", "Confirm in the dialog.")
};

export function helpText(language: VoiceLanguage): string {
  return lang(
    language,
    "可用的语音命令：放大、缩小、适应视图、回到根、上移、下移、左移、右移、自动布局、切换2D/3D视图、规划加内容、扫描、审查、开始编码、暂停、继续、取消、打开设置、刷新、打开工作区、重置工作区、停止。",
    "Available voice commands: zoom in, zoom out, fit view, back to root, pan, auto layout, switch to 2D or 3D view, plan, scan, review, start coding, pause, resume, cancel, settings, refresh, open workspace, reset workspace, and stop."
  );
}

// ---------- help / stop (hook checks stop first, then help in the unknown branch) ----------

export function isHelp(text: string, language: VoiceLanguage): boolean {
  if (language === "zh-CN") {
    return matches(text, ["帮助", "有什么命令", "怎么用", "指令"]);
  }
  return text === "help" || text === "commands" || text === "what can i say" || text === "help me";
}

export function isStop(text: string, language: VoiceLanguage): boolean {
  if (language === "zh-CN") {
    return matches(text, ["停止", "关闭语音", "退出语音"]);
  }
  return text === "stop" || text === "stop listening" || text === "stop voice";
}

// ---------- review target resolution (mirrors AppShell latestCodingRun logic) ----------

function reviewTargetRunId(run: AgentRun): string | null {
  if (run.agentKind !== "review") {
    return null;
  }
  const match = run.prompt.match(/^Review\s+(run-[^\s]+)$/);
  return match?.[1] ?? null;
}

export function resolveReviewTargetRunId(runs: AgentRun[]): string | null {
  const reviewTargets = new Set(
    runs
      .filter((run) => run.agentKind === "review")
      .map((run) => reviewTargetRunId(run))
      .filter((id): id is string => Boolean(id))
  );
  const latestCodingRun = runs.find(
    (run) => run.agentKind === "coding" && run.status === "succeeded" && !reviewTargets.has(run.id)
  );
  return latestCodingRun?.id ?? null;
}

// ---------- parser ----------

export function parseCommand(input: string, language: VoiceLanguage): ParseResult {
  const text = normalize(input, language);

  // 1. planning dictation (prefix match → free-text prompt)
  const planningTriggers = ["帮我规划", "请规划", "帮我计划", "规划", "计划", "help me plan", "please plan", "plan"];
  const planningTrigger = planningTriggers.find((trigger) => text.startsWith(trigger));
  if (planningTrigger) {
    let prompt = text.slice(planningTrigger.length).trim();
    prompt = prompt.replace(/^(一下|请|please|to|the)\s+/, "");
    if (!prompt) {
      return { type: "planning-needs-prompt" };
    }
    return {
      type: "command",
      parsed: build({ kind: "ai-planning", prompt }, lang(language, "已发起规划。", "Planning started."))
    };
  }

  // 2. auto layout (before viewport: no trigger overlap, and planning prefix already won above)
  if (matches(text, ["自动布局", "布局", "整理画布", "auto layout", "layout", "tidy the canvas", "organize the canvas"])) {
    return { type: "command", parsed: build({ kind: "auto-layout" }, lang(language, "已自动布局。", "Auto layout done.")) };
  }

  // 3. canvas mode
  const to3d = matches(text, ["3d视图", "切换3d", "三维视图", "switch to 3d", "3d view"]);
  const to2d = matches(text, ["2d视图", "切换2d", "switch to 2d", "2d view"]);
  if (to3d || to2d) {
    const mode = to3d ? "3d" : "2d";
    return {
      type: "command",
      parsed: build(
        { kind: "canvas-mode", mode },
        lang(language, `已切换到${mode === "3d" ? "3D" : "2D"}视图。`, `Switched to ${mode.toUpperCase()} view.`)
      )
    };
  }

  // 4. viewport
  const viewport = parseViewport(text, language);
  if (viewport) {
    return { type: "command", parsed: viewport };
  }

  // 4. ai actions
  if (matches(text, ["扫描仓库", "开始扫描", "扫描", "scan the repository", "scan repository", "scan"])) {
    return { type: "command", parsed: build({ kind: "ai-scan" }, lang(language, "已开始扫描。", "Scanning started.")) };
  }
  if (matches(text, ["代码审查", "审查代码", "审查", "评审", "review code", "run review", "review"])) {
    return { type: "command", parsed: build({ kind: "ai-review" }, lang(language, "已发起审查。", "Review started.")) };
  }
  if (matches(text, ["开始编码", "写代码", "生成代码", "实现", "start coding", "code this", "write code", "implement"])) {
    return { type: "command", parsed: build({ kind: "ai-start-code" }, lang(language, "已开始编码。", "Coding started.")) };
  }

  // 5. coding workflow control
  if (matches(text, ["暂停工作流", "暂停", "pause workflow", "pause"])) {
    return { type: "command", parsed: build({ kind: "coding-control", action: "pause" }, lang(language, "已暂停。", "Paused.")) };
  }
  if (matches(text, ["继续", "恢复", "resume", "continue"])) {
    return { type: "command", parsed: build({ kind: "coding-control", action: "resume" }, lang(language, "已继续。", "Resumed.")) };
  }
  if (matches(text, ["取消工作流", "取消", "cancel workflow", "cancel"])) {
    return { type: "command", parsed: build({ kind: "coding-control", action: "cancel" }, lang(language, "已取消。", "Cancelled.")) };
  }

  // 6. system
  if (matches(text, ["打开设置", "设置", "open settings", "settings"])) {
    return { type: "command", parsed: build({ kind: "system", action: "settings" }, lang(language, "已打开设置。", "Settings opened.")) };
  }
  if (matches(text, ["打开工作区", "打开项目", "open workspace", "open project"])) {
    return { type: "command", parsed: build({ kind: "system", action: "open-workspace" }, lang(language, "正在打开工作区。", "Opening workspace.")) };
  }
  if (matches(text, ["重置工作区", "重置", "reset workspace", "reset self", "reset"])) {
    return { type: "command", parsed: build({ kind: "system", action: "reset-workspace" }, lang(language, "请在确认框中确认。", "Confirm in the dialog.")) };
  }
  if (matches(text, ["刷新", "refresh", "reload"])) {
    return { type: "command", parsed: build({ kind: "system", action: "refresh" }, lang(language, "已刷新。", "Refreshed.")) };
  }

  return { type: "unknown" };
}

function parseViewport(text: string, language: VoiceLanguage): ParsedCommand | null {
  // show full graph / back to root
  if (matches(text, ["回到根", "显示全图", "全景", "返回根节点", "全图", "back to root", "full graph", "show full graph"])) {
    return build({ kind: "viewport", action: "show-full" }, lang(language, "已显示全图。", "Showing the full graph."));
  }
  // pan
  const panDirection = parsePanDirection(text, language);
  if (panDirection) {
    return build({ kind: "viewport", action: "pan", direction: panDirection }, lang(language, "已移动。", "Moved."));
  }
  // fit
  if (matches(text, ["适应画布", "适应视图", "适应", "居中", "全览", "fit view", "zoom to fit", "fit", "overview"])) {
    return build({ kind: "viewport", action: "fit" }, lang(language, "已适应视图。", "Fit to view."));
  }
  // zoom out before bare "zoom" (which maps to zoom-in)
  if (matches(text, ["缩小", "拉远", "zoom out", "smaller"])) {
    return build({ kind: "viewport", action: "zoom-out" }, lang(language, "已缩小。", "Zoomed out."));
  }
  if (matches(text, ["放大", "拉近", "zoom in", "zoom", "larger"])) {
    return build({ kind: "viewport", action: "zoom-in" }, lang(language, "已放大。", "Zoomed in."));
  }
  return null;
}

function parsePanDirection(text: string, language: VoiceLanguage): PanDirection | null {
  if (language === "zh-CN") {
    const pairs: Array<[string, PanDirection]> = [
      ["上移", "up"],
      ["向上", "up"],
      ["下移", "down"],
      ["向下", "down"],
      ["左移", "left"],
      ["向左", "left"],
      ["右移", "right"],
      ["向右", "right"]
    ];
    for (const [trigger, direction] of pairs) {
      if (text.includes(trigger)) {
        return direction;
      }
    }
    return null;
  }
  const pairs: Array<[string, PanDirection]> = [
    ["pan up", "up"],
    ["move up", "up"],
    ["pan down", "down"],
    ["move down", "down"],
    ["pan left", "left"],
    ["move left", "left"],
    ["pan right", "right"],
    ["move right", "right"]
  ];
  for (const [trigger, direction] of pairs) {
    if (text.includes(trigger)) {
      return direction;
    }
  }
  if (text.includes("up")) return "up";
  if (text.includes("down")) return "down";
  if (text.includes("left")) return "left";
  if (text.includes("right")) return "right";
  return null;
}
