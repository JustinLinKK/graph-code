import { useCallback, useEffect, useRef, useState } from "react";
import type { ControlCommand, VoiceLanguage } from "@graphcode/graph-model";
import { interpretVoiceCommand } from "../api";
import type { CommandResult } from "../commands";
import {
  defaultAck,
  helpText,
  isHelp,
  isStop,
  normalize,
  parseCommand,
  planningNeedsPromptFeedback,
  recognizerErrorFeedback,
  stoppedFeedback,
  unknownFeedback
} from "./commands";
import { speak } from "./feedback";
import { createWebSpeechRecognizer, isSpeechRecognitionSupported } from "./speechRecognizer";
import { getStoredVoiceSettings, rememberVoiceSettings, type VoiceSettings } from "./voiceSettings";
import type { SpeechRecognizer, VoiceControlApi, VoiceConversationMessage, VoiceStatus } from "./types";

function makeMessage(
  role: VoiceConversationMessage["role"],
  text: string,
  kind?: VoiceConversationMessage["kind"]
): VoiceConversationMessage {
  return {
    id: typeof crypto !== "undefined" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    role,
    text,
    kind,
    createdAt: Date.now()
  };
}

export function useWebSpeechControl(options: {
  projectId: string | null;
  onCommand: (command: ControlCommand, ack: string, language: VoiceLanguage) => Promise<CommandResult | undefined>;
  shouldStart?: () => boolean;
  enabled?: boolean;
}): VoiceControlApi {
  const { projectId, onCommand, shouldStart, enabled = true } = options;
  const [settings, setSettings] = useState<VoiceSettings>(getStoredVoiceSettings);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [conversation, setConversation] = useState<VoiceConversationMessage[]>([]);

  const recognizerRef = useRef<SpeechRecognizer | null>(null);
  const statusRef = useRef<VoiceStatus>("idle");
  const settingsRef = useRef(settings);
  const onCommandRef = useRef(onCommand);
  const projectIdRef = useRef(projectId);
  const shouldStartRef = useRef(shouldStart);

  const addMessage = useCallback((role: VoiceConversationMessage["role"], text: string, kind?: VoiceConversationMessage["kind"]) => {
    setConversation((current) => [...current, makeMessage(role, text, kind)]);
  }, []);

  const clearConversation = useCallback(() => setConversation([]), []);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);
  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);
  useEffect(() => {
    shouldStartRef.current = shouldStart;
  }, [shouldStart]);

  const setStatusValue = useCallback((next: VoiceStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const handleFinal = useCallback(
    async (text: string) => {
      const language = settingsRef.current.language;
      const normalized = normalize(text, language);
      addMessage("user", text, "transcript");

      if (isStop(normalized, language)) {
        setStatusValue("idle");
        recognizerRef.current?.abort();
        const feedback = stoppedFeedback(language);
        speak(feedback, language);
        addMessage("system", feedback, "feedback");
        return;
      }

      const result = parseCommand(normalized, language);
      if (result.type === "command") {
        setStatusValue("executing");
        const commandResult = await onCommandRef.current(result.parsed.command, result.parsed.ack, language);
        if (commandResult) {
          addMessage("system", commandResult.summary, commandResult.ok ? "command" : "error");
        }
        setStatusValue("idle");
        return;
      }
      if (result.type === "planning-needs-prompt") {
        setStatusValue("idle");
        const feedback = planningNeedsPromptFeedback(language);
        speak(feedback, language);
        addMessage("agent", feedback, "feedback");
        return;
      }

      if (isHelp(normalized, language)) {
        setStatusValue("idle");
        const text = helpText(language);
        speak(text, language);
        addMessage("agent", text, "feedback");
        return;
      }

      // Unknown → LLM fallback (via the local server).
      setStatusValue("executing");
      try {
        const response = await interpretVoiceCommand(text, language, projectIdRef.current);
        if (response.command) {
          const commandResult = await onCommandRef.current(response.command, defaultAck(language), language);
          if (commandResult) {
            addMessage("system", commandResult.summary, commandResult.ok ? "command" : "error");
          }
        } else {
          const feedback = unknownFeedback(language);
          speak(feedback, language);
          addMessage("agent", feedback, "error");
        }
      } catch {
        const feedback = unknownFeedback(language);
        speak(feedback, language);
        addMessage("agent", feedback, "error");
      } finally {
        setStatusValue("idle");
      }
    },
    [setStatusValue, addMessage]
  );

  useEffect(() => {
    const recognizer = createWebSpeechRecognizer();
    recognizerRef.current = recognizer;
    recognizer.setLanguage(settingsRef.current.language);
    const unsubscribe = recognizer.subscribe((event) => {
      switch (event.type) {
        case "start":
          break;
        case "transcript":
          setTranscript(event.text);
          if (event.isFinal) {
            void handleFinal(event.text);
          }
          break;
        case "error": {
          const message = recognizerErrorFeedback(event.error, settingsRef.current.language);
          if (message) {
            setStatusValue("error");
            speak(message, settingsRef.current.language);
            addMessage("agent", message, "error");
            window.setTimeout(() => {
              if (statusRef.current === "error") {
                setStatusValue("idle");
              }
            }, 1800);
          }
          break;
        }
        case "end":
          if (statusRef.current === "listening" || statusRef.current === "recognized") {
            setStatusValue("idle");
          }
          break;
      }
    });
    return () => {
      unsubscribe();
      recognizer.abort();
    };
  }, [handleFinal, setStatusValue]);

  const toggle = useCallback(() => {
    if (!enabled || !isSpeechRecognitionSupported()) {
      setStatusValue("unsupported");
      return;
    }
    if (statusRef.current === "listening") {
      recognizerRef.current?.abort();
      setStatusValue("idle");
      return;
    }
    if (shouldStartRef.current && !shouldStartRef.current()) {
      return;
    }
    const recognizer = recognizerRef.current;
    if (!recognizer) {
      return;
    }
    setTranscript("");
    recognizer.setLanguage(settingsRef.current.language);
    setStatusValue("listening");
    try {
      recognizer.start();
    } catch {
      setStatusValue("error");
      speak(unknownFeedback(settingsRef.current.language), settingsRef.current.language);
    }
  }, [setStatusValue]);

  const stop = useCallback(() => {
    recognizerRef.current?.abort();
    setStatusValue("idle");
  }, [setStatusValue]);

  const setLanguage = useCallback((language: VoiceLanguage) => {
    setSettings((current) => {
      const next = { ...current, language };
      rememberVoiceSettings(next);
      recognizerRef.current?.setLanguage(language);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!enabled) {
      recognizerRef.current?.abort();
      setStatusValue("idle");
    }
  }, [enabled, setStatusValue]);

  return {
    supported: enabled && isSpeechRecognitionSupported(),
    status,
    transcript,
    listening: status === "listening",
    language: settings.language,
    conversation,
    clearConversation,
    setLanguage,
    toggle,
    stop
  };
}
