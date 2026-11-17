import type { ControlCommand, VoiceLanguage } from "@graphcode/graph-model";

export type VoiceStatus = "idle" | "connecting" | "listening" | "recognized" | "executing" | "error" | "unsupported";

export type VoiceConversationMessage = {
  id: string;
  role: "user" | "agent" | "system";
  text: string;
  kind?: "transcript" | "command" | "feedback" | "error";
  createdAt: number;
};

export type VoiceControlApi = {
  supported: boolean;
  status: VoiceStatus;
  transcript: string;
  listening: boolean;
  language: VoiceLanguage;
  conversation: VoiceConversationMessage[];
  clearConversation: () => void;
  setLanguage: (language: VoiceLanguage) => void;
  toggle: () => void;
  stop: () => void;
};

export type SpeechRecognizerEvent =
  | { type: "start" }
  | { type: "transcript"; text: string; isFinal: boolean }
  | { type: "error"; error: string }
  | { type: "end" };

export interface SpeechRecognizer {
  readonly supported: boolean;
  setLanguage(language: VoiceLanguage): void;
  start(): void;
  stop(): void;
  abort(): void;
  subscribe(listener: (event: SpeechRecognizerEvent) => void): () => void;
}

export type ParsedCommand = {
  command: ControlCommand;
  ack: string;
  requiresProject: boolean;
};

export const requiresProjectByKind: Record<ControlCommand["kind"], boolean> = {
  viewport: true,
  "canvas-mode": true,
  "ai-planning": true,
  "ai-scan": true,
  "ai-review": true,
  "ai-start-code": true,
  "auto-layout": true,
  "coding-control": true,
  system: false
};
