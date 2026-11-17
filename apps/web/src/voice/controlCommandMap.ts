import type { ControlCommand } from "@graphcode/graph-model";

export function controlCommandToInvocation(command: ControlCommand): { name: string; args: Record<string, unknown> } {
  switch (command.kind) {
    case "viewport":
      return { name: "viewport", args: { action: command.action, direction: command.direction } };
    case "canvas-mode":
      return { name: "canvas_mode", args: { mode: command.mode } };
    case "ai-planning":
      return { name: "plan", args: { prompt: command.prompt } };
    case "ai-scan":
      return { name: "scan", args: {} };
    case "ai-review":
      return { name: "review", args: {} };
    case "ai-start-code":
      return {
        name: "code",
        args: { nodeId: command.targetNodeId, prompt: command.prompt }
      };
    case "auto-layout":
      return { name: "auto_layout", args: {} };
    case "coding-control":
      return { name: "coding_control", args: { action: command.action } };
    case "system": {
      switch (command.action) {
        case "settings":
          return { name: "open_settings", args: {} };
        case "refresh":
          return { name: "refresh", args: {} };
        case "open-workspace":
          return { name: "open_workspace", args: {} };
        case "reset-workspace":
          return { name: "reset_workspace", args: {} };
      }
    }
  }
}
