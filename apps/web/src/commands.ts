import { z } from "zod";
import type { AgentRun, CanvasGraph, GraphNode } from "@graphcode/graph-model";
import { getGitStatus } from "./api";
import { resolveReviewTargetRunId } from "./voice/commands";

export type CommandResult = { ok: boolean; summary: string; data?: unknown };

export type CommandContext = {
  projectId: string | null;
  projectName: string | null;
  selectedNodeId: string | null;
  scopeNodeId: string | null;
  nodes: { id: string; name: string }[];
  agentRuns: AgentRun[];
  hasActiveCodingWorkflow: boolean;
};

export type CommandDeps = {
  openWorkspaceRequest: (rootPath: string) => Promise<void>;
  openWorkspacePicker: () => Promise<void>;
  selectNode: (nodeId: string) => Promise<void>;
  runScanning: () => Promise<void>;
  runPlanning: (prompt: string) => Promise<void>;
  startCode: (nodeId: string, mode: "small" | "medium" | "large", prompt?: string) => Promise<void>;
  runReview: (runId: string) => Promise<void>;
  applyPlanningPatch: (runId: string) => Promise<void>;
  implementCodeProposal: (runId: string) => Promise<void>;
  codingControl: (action: "pause" | "resume" | "cancel") => Promise<void>;
  autoLayout: () => Promise<void>;
  showFullGraph: () => Promise<void>;
  refresh: () => Promise<void>;
  openSettings: () => void;
  resetWorkspace: () => Promise<void>;
  setCanvasMode: (mode: "2d" | "3d") => void;
  viewport: (action: "zoom-in" | "zoom-out" | "fit" | "show-full" | "pan", direction?: "up" | "down" | "left" | "right") => void;
};

type Command<A> = {
  name: string;
  description: string;
  argsSchema: z.ZodType<A>;
  run: (ctx: CommandContext, args: A) => Promise<CommandResult>;
};

const registry = new Map<string, Command<unknown>>();
let currentDeps: CommandDeps | null = null;
let snapshot: CommandContext = {
  projectId: null,
  projectName: null,
  selectedNodeId: null,
  scopeNodeId: null,
  nodes: [],
  agentRuns: [],
  hasActiveCodingWorkflow: false
};

export function registerCommand<A>(command: Command<A>): void {
  if (registry.has(command.name)) {
    throw new Error(`Command "${command.name}" is already registered.`);
  }
  registry.set(command.name, command as Command<unknown>);
}

export function listCommands(): { name: string; description: string; argsSchema: z.ZodType<unknown> }[] {
  return Array.from(registry.values()).map(({ name, description, argsSchema }) => ({ name, description, argsSchema }));
}

export function syncCommandCenter(deps: CommandDeps, next: CommandContext): void {
  currentDeps = deps;
  snapshot = next;
}

export function getCommandContext(): CommandContext {
  return snapshot;
}

export async function runCommand(name: string, rawArgs: unknown = {}): Promise<CommandResult> {
  const command = registry.get(name);
  if (!command) {
    return { ok: false, summary: `未知命令：${name}` };
  }
  if (!currentDeps) {
    return { ok: false, summary: "命令层尚未就绪" };
  }
  const parsed = command.argsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return { ok: false, summary: `参数错误：${parsed.error.message}` };
  }
  try {
    return await command.run(snapshot, parsed.data);
  } catch (error) {
    return { ok: false, summary: error instanceof Error ? error.message : "命令执行失败" };
  }
}

function requireDeps(): CommandDeps {
  if (!currentDeps) {
    throw new Error("Command dependencies are not available.");
  }
  return currentDeps;
}

function requireProject(ctx: CommandContext): string {
  if (!ctx.projectId) {
    throw new Error("请先打开一个仓库");
  }
  return ctx.projectId;
}

function truncate(text: string, limit = 40): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}…`;
}

function resolveNodeByName(ctx: CommandContext, name?: string): { id: string; name: string } | null {
  if (!name) return null;
  const target = name.trim();
  if (!target) return null;
  const exact = ctx.nodes.find((n) => n.name === target);
  if (exact) return exact;
  const matches = ctx.nodes.filter((n) => n.name.toLowerCase().includes(target.toLowerCase()));
  if (matches.length === 1) return matches[0];
  return null;
}

function listMatchingNodeNames(ctx: CommandContext, name?: string): string[] {
  if (!name) return [];
  const target = name.trim();
  if (!target) return [];
  return ctx.nodes
    .filter((n) => n.name.toLowerCase().includes(target.toLowerCase()) && n.name !== target)
    .map((n) => n.name);
}

function resolveNode(ctx: CommandContext, nodeId?: string, nodeName?: string): { id: string; name: string } {
  if (nodeId) {
    const node = ctx.nodes.find((n) => n.id === nodeId);
    if (node) return node;
  }
  const byName = resolveNodeByName(ctx, nodeName);
  if (byName) return byName;
  if (ctx.selectedNodeId) {
    const node = ctx.nodes.find((n) => n.id === ctx.selectedNodeId);
    if (node) return node;
  }
  throw new Error("请指定节点名称、nodeId，或先选择一个节点");
}

const emptyArgsSchema = z.object({});
const optionalStringSchema = z.string().optional();

registerCommand({
  name: "open_workspace",
  description: "打开工作区（通过路径或文件选择器）",
  argsSchema: z.object({ rootPath: z.string().optional() }),
  async run(_ctx, args) {
    const deps = requireDeps();
    if (args.rootPath) {
      await deps.openWorkspaceRequest(args.rootPath);
      return { ok: true, summary: `已打开仓库 ${args.rootPath}` };
    }
    await deps.openWorkspacePicker();
    return { ok: true, summary: "已打开文件夹选择器" };
  }
});

registerCommand({
  name: "focus_node",
  description: "聚焦到指定节点（按名称或 nodeId，或回退到当前选中节点）",
  argsSchema: z.object({ nodeId: optionalStringSchema, nodeName: optionalStringSchema }),
  async run(ctx, args) {
    const deps = requireDeps();
    if (args.nodeName) {
      const target = args.nodeName.trim();
      const exact = ctx.nodes.find((n) => n.name === target);
      if (!exact) {
        const matches = listMatchingNodeNames(ctx, args.nodeName);
        if (matches.length > 1) {
          return { ok: false, summary: `找到多个匹配节点：${matches.join("、")}` };
        }
      }
    }
    const node = resolveNode(ctx, args.nodeId, args.nodeName);
    await deps.selectNode(node.id);
    return { ok: true, summary: `已聚焦 ${node.name}` };
  }
});

registerCommand({
  name: "scan",
  description: "运行扫描代理",
  argsSchema: emptyArgsSchema,
  async run(ctx) {
    requireProject(ctx);
    const deps = requireDeps();
    await deps.runScanning();
    return { ok: true, summary: "扫描已完成" };
  }
});

registerCommand({
  name: "plan",
  description: "运行规划代理",
  argsSchema: z.object({ prompt: z.string().min(1) }),
  async run(ctx, args) {
    requireProject(ctx);
    const deps = requireDeps();
    await deps.runPlanning(args.prompt);
    return { ok: true, summary: `规划已启动：${truncate(args.prompt)}` };
  }
});

const codingModeSchema = z.enum(["small", "medium", "large"]).optional();

registerCommand({
  name: "code",
  description: "对节点启动编码代理",
  argsSchema: z.object({
    nodeId: optionalStringSchema,
    nodeName: optionalStringSchema,
    mode: codingModeSchema,
    prompt: optionalStringSchema
  }),
  async run(ctx, args) {
    requireProject(ctx);
    const deps = requireDeps();
    const node = resolveNode(ctx, args.nodeId, args.nodeName);
    const mode = args.mode ?? "medium";
    await deps.startCode(node.id, mode, args.prompt);
    return { ok: true, summary: `已开始编码 ${node.name}` };
  }
});

registerCommand({
  name: "review",
  description: "审查最近一次编码结果",
  argsSchema: z.object({ runId: optionalStringSchema }),
  async run(ctx, args) {
    requireProject(ctx);
    const deps = requireDeps();
    const runId = args.runId ?? resolveReviewTargetRunId(ctx.agentRuns);
    if (!runId) {
      return { ok: false, summary: "没有可审查的代码提案" };
    }
    await deps.runReview(runId);
    return { ok: true, summary: "评审已启动" };
  }
});

function latestApplicableRun(runs: AgentRun[]): AgentRun | null {
  return (
    runs.find((run) => run.agentKind === "coding" && run.status === "succeeded") ??
    runs.find((run) => run.agentKind === "planning" && run.status === "succeeded" && run.graphPatch) ??
    null
  );
}

registerCommand({
  name: "apply",
  description: "应用最近一次成功的规划补丁或代码提案",
  argsSchema: z.object({ runId: optionalStringSchema }),
  async run(ctx, args) {
    requireProject(ctx);
    const deps = requireDeps();
    const run = args.runId ? ctx.agentRuns.find((r) => r.id === args.runId) : latestApplicableRun(ctx.agentRuns);
    if (!run) {
      return { ok: false, summary: "没有可应用的变更" };
    }
    if (run.agentKind === "coding") {
      await deps.implementCodeProposal(run.id);
    } else if (run.agentKind === "planning" && run.graphPatch) {
      await deps.applyPlanningPatch(run.id);
    } else {
      return { ok: false, summary: "选中的运行没有可应用的变更" };
    }
    return { ok: true, summary: "已应用变更" };
  }
});

registerCommand({
  name: "git_status",
  description: "获取当前仓库 Git 状态",
  argsSchema: emptyArgsSchema,
  async run(ctx) {
    const projectId = requireProject(ctx);
    const { status } = await getGitStatus(projectId);
    return { ok: true, summary: `工作区状态：${status}` };
  }
});

registerCommand({
  name: "auto_layout",
  description: "自动整理当前画布布局",
  argsSchema: emptyArgsSchema,
  async run(ctx) {
    requireProject(ctx);
    const deps = requireDeps();
    await deps.autoLayout();
    return { ok: true, summary: "已自动布局" };
  }
});

registerCommand({
  name: "canvas_mode",
  description: "切换 2D/3D 画布视图",
  argsSchema: z.object({ mode: z.enum(["2d", "3d"]) }),
  async run(_ctx, args) {
    const deps = requireDeps();
    deps.setCanvasMode(args.mode);
    return { ok: true, summary: args.mode === "3d" ? "已切换到3D视图" : "已切换到2D视图" };
  }
});

registerCommand({
  name: "viewport",
  description: "调整画布视口",
  argsSchema: z.object({
    action: z.enum(["zoom-in", "zoom-out", "fit", "show-full", "pan"]),
    direction: z.enum(["up", "down", "left", "right"]).optional()
  }),
  async run(_ctx, args) {
    const deps = requireDeps();
    deps.viewport(args.action, args.direction);
    return { ok: true, summary: "已调整视图" };
  }
});

registerCommand({
  name: "coding_control",
  description: "控制当前编码工作流",
  argsSchema: z.object({ action: z.enum(["pause", "resume", "cancel"]) }),
  async run(ctx, args) {
    requireProject(ctx);
    const deps = requireDeps();
    if (!ctx.hasActiveCodingWorkflow) {
      return { ok: false, summary: "没有正在运行的工作流" };
    }
    await deps.codingControl(args.action);
    const actionLabel = args.action === "pause" ? "已暂停" : args.action === "resume" ? "已继续" : "已取消";
    return { ok: true, summary: `${actionLabel}工作流` };
  }
});

registerCommand({
  name: "open_settings",
  description: "打开设置面板",
  argsSchema: emptyArgsSchema,
  async run() {
    const deps = requireDeps();
    deps.openSettings();
    return { ok: true, summary: "已打开设置" };
  }
});

registerCommand({
  name: "refresh",
  description: "刷新当前项目",
  argsSchema: emptyArgsSchema,
  async run(ctx) {
    requireProject(ctx);
    const deps = requireDeps();
    await deps.refresh();
    return { ok: true, summary: "已刷新" };
  }
});

registerCommand({
  name: "reset_workspace",
  description: "重置当前工作区",
  argsSchema: emptyArgsSchema,
  async run(ctx) {
    requireProject(ctx);
    const deps = requireDeps();
    await deps.resetWorkspace();
    return { ok: true, summary: "已重置工作区" };
  }
});

if (import.meta.env.DEV) {
  const global = window as unknown as Record<string, unknown>;
  global.__graphcode ??= {} as Record<string, unknown>;
  (global.__graphcode as Record<string, unknown>).commands = {
    runCommand,
    listCommands,
    getContext: getCommandContext
  };
}
