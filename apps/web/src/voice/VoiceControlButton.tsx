import { Button } from "@heroui/react";
import { Mic, MicOff } from "lucide-react";
import type { VoiceStatus } from "./types";

const STATUS_LABELS: Record<VoiceStatus, string> = {
  idle: "Voice control",
  connecting: "Connecting voice…",
  listening: "Listening…",
  recognized: "Recognized",
  executing: "Working…",
  error: "Voice error",
  unsupported: "Voice not supported"
};

export function VoiceControlButton({
  supported,
  status,
  transcript,
  onToggle
}: {
  supported: boolean;
  status: VoiceStatus;
  transcript: string;
  onToggle: () => void;
}) {
  const listening = status === "listening";
  return (
    <span className="voice-control-wrap">
      <Button
        isIconOnly
        size="sm"
        variant={listening ? "primary" : "ghost"}
        aria-label={STATUS_LABELS[status]}
        aria-pressed={listening}
        isDisabled={!supported}
        onPress={onToggle}
      >
        {listening ? <MicOff size={16} /> : <Mic size={16} />}
      </Button>
      {status !== "idle" ? (
        <span className="voice-indicator" role="status" aria-live="polite">
          {transcript || STATUS_LABELS[status]}
        </span>
      ) : null}
    </span>
  );
}
