import type { AgentKind, AgentProvider, AgentStatus, CodingAgentMode, GitChangeStatus, GitWorktreeStatus, ReviewAgentMode, ScanningAgentMode } from "@graphcode/graph-model";

export function agentKindLabel(agentKind: AgentKind): string {
  switch (agentKind) {
    case "planning":
      return "Planning";
    case "coding":
      return "Coding";
    case "review":
      return "Review";
    case "scanning":
      return "Scanning";
    default:
      return agentKind;
  }
}

export function providerLabel(provider: AgentProvider): string {
  switch (provider) {
    case "codex":
      return "Codex CLI";
    case "claudecode":
      return "Claude Code";
    case "openai":
      return "OpenAI";
    case "gemini":
      return "Gemini";
    case "openrouter":
      return "OpenRouter";
    case "deepseek":
      return "DeepSeek";
    case "fake":
      return "Fake";
    default:
      return provider;
  }
}

export function codingAgentModeLabel(mode: CodingAgentMode): string {
  switch (mode) {
    case "small":
      return "Small";
    case "medium":
      return "Medium";
    case "large":
      return "Large";
    default:
      return mode;
  }
}

export function reviewAgentModeLabel(mode: ReviewAgentMode): string {
  switch (mode) {
    case "small":
      return "Small";
    case "medium":
      return "Medium";
    case "large":
      return "Large";
    default:
      return mode;
  }
}

export function scanningAgentModeLabel(mode: ScanningAgentMode): string {
  switch (mode) {
    case "local":
      return "Local";
    case "medium":
      return "Medium";
    case "global":
      return "Global";
    default:
      return mode;
  }
}

export function agentStatusLabel(status: AgentStatus): string {
  switch (status) {
    case "none":
      return "None";
    case "planning":
      return "Planning";
    case "coded":
      return "Coded";
    case "reviewed":
      return "Reviewed";
    case "implemented":
      return "Implemented";
    case "bugged":
      return "Bugged";
    default:
      return status;
  }
}

export function gitWorktreeLabel(status: GitWorktreeStatus): string {
  switch (status) {
    case "untracked":
      return "Untracked";
    case "pending":
      return "Pending";
    case "staged":
      return "Staged";
    case "committed":
      return "Committed";
    default:
      return status;
  }
}

export function gitChangeLabel(status: GitChangeStatus | null): string {
  switch (status) {
    case "new":
      return "New";
    case "modified":
      return "Modified";
    case "deleted":
      return "Deleted";
    default:
      return "No File Change";
  }
}
