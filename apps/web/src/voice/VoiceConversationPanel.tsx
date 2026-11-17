import { Button } from "@heroui/react";
import { MessageSquare, Mic, MicOff, Trash2, X } from "lucide-react";
import type { VoiceLanguage } from "@graphcode/graph-model";
import type { VoiceControlApi, VoiceStatus } from "./types";
import type { VoiceEngine } from "./voiceSettings";

const STATUS_LABELS: Record<VoiceStatus, string> = {
  idle: "Idle",
  connecting: "Connecting…",
  listening: "Listening…",
  recognized: "Agent is speaking",
  executing: "Working…",
  error: "Voice error",
  unsupported: "Voice not supported"
};

export type VoiceConversationPanelProps = {
  open: boolean;
  onClose: () => void;
  supported: boolean;
  status: VoiceStatus;
  transcript: string;
  listening: boolean;
  conversation: VoiceControlApi["conversation"];
  clearConversation: () => void;
  toggle: () => void;
  stop: () => void;
  engine: VoiceEngine;
  setEngine: (engine: VoiceEngine) => void;
  deepgramConfigured: boolean;
  language: VoiceLanguage;
  setLanguage: (language: VoiceLanguage) => void;
};

export function VoiceConversationPanel({
  open,
  onClose,
  supported,
  status,
  transcript,
  listening,
  conversation,
  clearConversation,
  toggle,
  stop,
  engine,
  setEngine,
  deepgramConfigured,
  language,
  setLanguage
}: VoiceConversationPanelProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="voice-drawer-overlay" role="dialog" aria-modal="true" aria-label="Voice conversation">
      <div className="voice-drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="voice-drawer">
        <div className="voice-drawer-header">
          <div className="voice-drawer-title">
            <MessageSquare size={16} />
            <span>Voice conversation</span>
          </div>
          <div className="voice-drawer-status" data-status={status}>
            {STATUS_LABELS[status]}
          </div>
          <button
            type="button"
            className="voice-drawer-close"
            aria-label="Close voice conversation"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <div className="voice-drawer-controls">
          <label className="voice-control-field">
            <span>Engine</span>
            <select
              value={engine}
              onChange={(event) => {
                const next = event.target.value as VoiceEngine;
                stop();
                setEngine(next);
              }}
            >
              <option value="webspeech">Web Speech (no key)</option>
              <option value="deepgram" disabled={!deepgramConfigured}>
                Deepgram Voice Agent{deepgramConfigured ? "" : " — not configured"}
              </option>
            </select>
          </label>
          <label className="voice-control-field">
            <span>Language</span>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as VoiceLanguage)}
            >
              <option value="zh-CN">中文（简体）</option>
              <option value="en-US">English (US)</option>
            </select>
          </label>
        </div>

        <div className="voice-conversation" role="log" aria-live="polite" aria-label="Conversation transcript">
          {conversation.length === 0 ? (
            <p className="voice-empty">
              {supported
                ? "Tap the microphone and start talking."
                : "Voice control is not supported in this browser."}
            </p>
          ) : (
            conversation.map((message) => (
              <div
                key={message.id}
                className={`voice-message voice-message-${message.role} voice-message-${message.kind ?? "text"}`}
              >
                <span className="voice-message-role">
                  {message.role === "user" ? "You" : message.role === "agent" ? "Agent" : "Result"}
                </span>
                <span className="voice-message-text">{message.text}</span>
              </div>
            ))
          )}
          {transcript && status !== "idle" ? (
            <div className="voice-message voice-message-user voice-message-transcript voice-message-pending">
              <span className="voice-message-role">You</span>
              <span className="voice-message-text">{transcript}</span>
            </div>
          ) : null}
        </div>

        <div className="voice-drawer-footer">
          <Button
            variant={listening ? "secondary" : "primary"}
            size="sm"
            isDisabled={!supported}
            onPress={toggle}
          >
            {listening ? <MicOff size={14} /> : <Mic size={14} />}
            {listening ? "Stop listening" : "Start listening"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            isDisabled={conversation.length === 0}
            onPress={clearConversation}
          >
            <Trash2 size={14} />
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
}
