import type { VoiceLanguage } from "@graphcode/graph-model";
import { getCommandContext, type CommandContext } from "../../commands";
import type { DeepgramAgentSettings, DeepgramFunctionDefinition } from "./types";

export const DEEPGRAM_LISTEN_MODEL = "nova-3";
export const DEEPGRAM_THINK_MODEL = "gpt-4o-mini";
export const DEEPGRAM_GREETING = "Hello! I'm GraphCode voice assistant. What would you like to do?";

export function resolveSpeakModel(_language: VoiceLanguage): string {
  // Aura-2 does not currently provide a Chinese voice. For now we use the same
  // English voice for both languages; the settings UI notes this limitation.
  return "aura-2-asteria-en";
}

export const DEEPGRAM_FUNCTIONS: DeepgramFunctionDefinition[] = [
  {
    name: "open_workspace",
    description: "Open a workspace folder. If rootPath is provided, open that path; otherwise show the folder picker.",
    parameters: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Absolute workspace root path to open." }
      }
    },
  },
  {
    name: "focus_node",
    description:
      "Focus a graph node by name or id. If neither nodeName nor nodeId is given, focus the currently selected node. Use nodeName with exact names from the node list.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Exact node id." },
        nodeName: { type: "string", description: "Exact node name from the node list." }
      }
    },
  },
  {
    name: "scan",
    description: "Run the scanning agent on the current project.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "plan",
    description: "Start the planning agent with a free-text prompt describing what to plan.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "The planning request in the user's language." }
      },
      required: ["prompt"]
    },
  },
  {
    name: "code",
    description:
      "Start the coding agent on a node. If no node is specified, use the currently selected node.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Exact node id." },
        nodeName: { type: "string", description: "Exact node name from the node list." },
        mode: {
          type: "string",
          enum: ["small", "medium", "large"],
          description: "Coding scope size. Defaults to medium."
        },
        prompt: { type: "string", description: "Optional coding instruction." }
      }
    },
  },
  {
    name: "review",
    description: "Review the most recent successful coding run.",
    parameters: {
      type: "object",
      properties: {
        runId: { type: "string", description: "Optional specific run id to review." }
      }
    },
  },
  {
    name: "apply",
    description: "Apply the most recent successful planning patch or coding proposal.",
    parameters: {
      type: "object",
      properties: {
        runId: { type: "string", description: "Optional specific run id to apply." }
      }
    },
  },
  {
    name: "git_status",
    description: "Read the current Git status of the open workspace.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "auto_layout",
    description: "Automatically tidy the current canvas layout.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "canvas_mode",
    description: "Switch the canvas between 2D and 3D view.",
    parameters: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["2d", "3d"],
          description: "The canvas view mode to switch to."
        }
      },
      required: ["mode"]
    },
  },
  {
    name: "viewport",
    description: "Adjust the canvas viewport.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["zoom-in", "zoom-out", "fit", "show-full", "pan"],
          description: "Viewport action to perform."
        },
        direction: {
          type: "string",
          enum: ["up", "down", "left", "right"],
          description: "Required when action is pan."
        }
      },
      required: ["action"]
    },
  },
  {
    name: "coding_control",
    description: "Pause, resume, or cancel the active coding workflow.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["pause", "resume", "cancel"],
          description: "Workflow control action."
        }
      },
      required: ["action"]
    },
  },
  {
    name: "open_settings",
    description: "Open the settings panel.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "refresh",
    description: "Refresh the current project.",
    parameters: { type: "object", properties: {} },
  }
];

export function buildAgentPrompt(ctx: CommandContext, language: VoiceLanguage): string {
  const selectedNode = ctx.selectedNodeId ? ctx.nodes.find((n) => n.id === ctx.selectedNodeId) : null;
  const selectedNodeName = selectedNode?.name ?? (language === "zh-CN" ? "无" : "none");
  const projectName = ctx.projectName ?? (language === "zh-CN" ? "未打开" : "no project");
  const nodeNames = ctx.nodes.map((n) => n.name).slice(0, 50);

  if (language === "zh-CN") {
    return [
      "你是 GraphCode 的语音助手，通过调用工具控制画布与代理。",
      `当前项目：${projectName}。`,
      `当前选中节点：${selectedNodeName}。`,
      `画布节点名称列表（可用于 nodeName 参数，最多 50 个）：${nodeNames.join(", ") || "无"}。`,
      "规则：",
      "- 用户说「这个」「那个」时，如果当前有选中节点，就把 nodeName 设为该节点名称；否则请用户先选一个节点。",
      "- 调用工具后，把返回 JSON 中的 summary 字段原样念给用户，不要编造或添加额外解释。",
      "- 如果工具返回 summary 表示失败（ok=false），告诉用户失败原因。",
      "- 回答保持一句简短中文。"
    ].join("\n");
  }

  return [
    "You are the GraphCode voice assistant. Control the canvas and agents by calling tools.",
    `Current project: ${projectName}.`,
    `Currently selected node: ${selectedNodeName}.`,
    `Node names on the canvas (use as nodeName parameter, up to 50): ${nodeNames.join(", ") || "none"}.`,
    "Rules:",
    "- When the user says 'this' or 'that', use the currently selected node as nodeName if one is selected; otherwise ask them to select a node first.",
    "- After calling a tool, read the 'summary' field from the returned JSON verbatim. Do not invent details.",
    "- If the tool result has ok=false, tell the user the failure reason.",
    "- Keep replies to one short sentence."
  ].join("\n");
}

export function buildThinkConfig(
  language: VoiceLanguage,
  prompt: string
): DeepgramAgentSettings["agent"]["think"] {
  return {
    provider: { type: "open_ai", model: DEEPGRAM_THINK_MODEL, temperature: 0.5 },
    prompt,
    functions: DEEPGRAM_FUNCTIONS
  };
}

export function buildAgentSettings(
  language: VoiceLanguage,
  prompt: string
): DeepgramAgentSettings {
  return {
    type: "Settings",
    audio: {
      input: { encoding: "linear16", sample_rate: 24000 },
      output: { encoding: "linear16", sample_rate: 24000, container: "none" }
    },
    agent: {
      // agent.language "zh" is rejected with the aura-2 speak provider
      // (INVALID_SETTINGS: language not supported with Deepgram speak provider),
      // so the Chinese constraint lives on the listen provider instead.
      listen: {
        provider: {
          type: "deepgram",
          model: DEEPGRAM_LISTEN_MODEL,
          ...(language === "zh-CN" ? { language: "zh" } : {})
        }
      },
      think: buildThinkConfig(language, prompt),
      speak: { provider: { type: "deepgram", model: resolveSpeakModel(language) } },
      greeting: DEEPGRAM_GREETING
    }
  };
}

export function getAgentPromptContext(): CommandContext {
  return getCommandContext();
}
