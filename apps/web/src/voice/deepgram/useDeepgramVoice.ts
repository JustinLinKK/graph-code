import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ControlCommand, VoiceLanguage } from "@graphcode/graph-model";
import { runCommand, getCommandContext, type CommandResult } from "../../commands";
import { getDeepgramVoiceToken } from "../../api";
import {
  getStoredVoiceSettings,
  rememberVoiceSettings,
  subscribeVoiceSettingsChanged,
  type VoiceSettings
} from "../voiceSettings";
import type { VoiceControlApi, VoiceConversationMessage, VoiceStatus } from "../types";
import { DeepgramAgentClient } from "./client";
import { VoiceAudioPipeline } from "./audio";
import { buildAgentPrompt, buildAgentSettings, buildThinkConfig } from "./functions";

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

export function useDeepgramVoice(options: {
  projectId: string | null;
  onCommand: (command: ControlCommand, ack: string, language: VoiceLanguage) => void;
  shouldStart?: () => boolean;
  enabled?: boolean;
}): VoiceControlApi {
  const { projectId, onCommand, shouldStart, enabled = true } = options;

  const [settings, setSettings] = useState<VoiceSettings>(getStoredVoiceSettings);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [supported, setSupported] = useState(false);
  const [conversation, setConversation] = useState<VoiceConversationMessage[]>([]);

  const addMessage = useCallback((role: VoiceConversationMessage["role"], text: string, kind?: VoiceConversationMessage["kind"]) => {
    setConversation((current) => [...current, makeMessage(role, text, kind)]);
  }, []);

  const clearConversation = useCallback(() => setConversation([]), []);

  const statusRef = useRef(status);
  const settingsRef = useRef(settings);
  const projectIdRef = useRef(projectId);
  const onCommandRef = useRef(onCommand);
  const shouldStartRef = useRef(shouldStart);
  const clientRef = useRef<DeepgramAgentClient | null>(null);
  const pipelineRef = useRef<VoiceAudioPipeline | null>(null);
  const promptIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);
  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);
  useEffect(() => {
    shouldStartRef.current = shouldStart;
  }, [shouldStart]);

  useEffect(() => {
    return subscribeVoiceSettingsChanged((next) => {
      setSettings(next);
    });
  }, []);

  // Probe whether the local server has a Deepgram key configured.
  useEffect(() => {
    let cancelled = false;
    if (!enabled) {
      setSupported(false);
      return;
    }
    getDeepgramVoiceToken()
      .then((response) => {
        if (!cancelled) setSupported(response.configured);
      })
      .catch(() => {
        if (!cancelled) setSupported(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const refreshPrompt = useCallback(() => {
    const client = clientRef.current;
    if (!client?.connected) return;
    const prompt = buildAgentPrompt(getCommandContext(), settingsRef.current.language);
    client.sendUpdateThink(buildThinkConfig(settingsRef.current.language, prompt));
  }, []);

  const stopPromptInterval = useCallback(() => {
    if (promptIntervalRef.current) {
      clearInterval(promptIntervalRef.current);
      promptIntervalRef.current = null;
    }
  }, []);

  const startPromptInterval = useCallback(() => {
    stopPromptInterval();
    refreshPrompt();
    promptIntervalRef.current = setInterval(refreshPrompt, 3000);
  }, [refreshPrompt, stopPromptInterval]);

  const handleFunctionCalls = useCallback(
    async (functions: { id: string; name: string; arguments: string }[]) => {
      const client = clientRef.current;
      if (!client) return;
      setStatus("executing");
      for (const call of functions) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.arguments) as Record<string, unknown>;
        } catch {
          // Fall through with empty args; runCommand will report validation errors.
        }
        const result: CommandResult = await runCommand(call.name, args);
        addMessage("system", result.summary, result.ok ? "command" : "error");
        client.sendFunctionCallResponse(call.id, call.name, JSON.stringify(result));
      }
      refreshPrompt();
      setStatus("listening");
    },
    [refreshPrompt, addMessage]
  );

  const client = useMemo(() => {
    if (!enabled || !supported) return null;
    return new DeepgramAgentClient({
      onSettingsApplied: () => {
        setStatus("listening");
        startPromptInterval();
      },
      onConversationText: (role, content) => {
        if (role === "user") {
          setTranscript(content);
          addMessage("user", content, "transcript");
        } else {
          addMessage("agent", content, "feedback");
        }
      },
      onUserStartedSpeaking: () => {
        pipelineRef.current?.interruptPlayback();
        setStatus("listening");
      },
      onAgentStartedSpeaking: () => {
        setStatus("recognized");
      },
      onFunctionCallRequest: (functions) => {
        void handleFunctionCalls(functions);
      },
      onAudio: (samples) => {
        pipelineRef.current?.enqueuePlayback(samples);
      },
      onError: (error) => {
        addMessage("agent", error.message, "error");
        // Surface configuration errors quietly; the UI will fall back if unsupported.
        if (error.message === "deepgram-not-configured") {
          setSupported(false);
        }
        setStatus("error");
      },
      onClose: (event) => {
        if (!event.willReconnect) {
          setStatus("idle");
          stopPromptInterval();
        }
      }
    });
  }, [enabled, supported, handleFunctionCalls, startPromptInterval, stopPromptInterval, addMessage]);

  useEffect(() => {
    clientRef.current = client;
    if (!client) {
      stopPromptInterval();
    }
    return () => {
      client?.disconnect();
      stopPromptInterval();
    };
  }, [client, stopPromptInterval]);

  const stop = useCallback(() => {
    pipelineRef.current?.stop();
    pipelineRef.current = null;
    clientRef.current?.disconnect();
    stopPromptInterval();
    setStatus("idle");
    setTranscript("");
  }, [stopPromptInterval]);

  const toggle = useCallback(async () => {
    if (!enabled || !supported) {
      setStatus("unsupported");
      return;
    }
    const active = statusRef.current === "listening" || statusRef.current === "recognized" || statusRef.current === "connecting";
    if (active) {
      stop();
      return;
    }
    if (shouldStartRef.current && !shouldStartRef.current()) {
      return;
    }

    setTranscript("");
    setStatus("connecting");
    addMessage("system", "Connecting voice agent…", "feedback");

    const pipeline = new VoiceAudioPipeline({
      onMicChunk: (samples) => {
        clientRef.current?.sendAudio(samples);
      },
      onError: () => {
        setStatus("error");
      }
    });
    pipelineRef.current = pipeline;

    try {
      await pipeline.start();
      const initialSettings = buildAgentSettings(
        settingsRef.current.language,
        buildAgentPrompt(getCommandContext(), settingsRef.current.language)
      );
      await clientRef.current?.connect(initialSettings);
      // Status transitions to listening via onSettingsApplied.
    } catch {
      setStatus("error");
      pipeline.stop();
      pipelineRef.current = null;
    }
  }, [enabled, supported, stop, addMessage]);

  const setLanguage = useCallback((language: VoiceLanguage) => {
    setSettings((current) => {
      const next = { ...current, language };
      rememberVoiceSettings(next);
      return next;
    });
    // A language change requires a fresh Settings handshake, so reconnect.
    if (statusRef.current !== "idle") {
      stop();
    }
  }, [stop]);

  return {
    supported,
    status,
    transcript,
    listening: status === "listening" || status === "recognized" || status === "connecting",
    language: settings.language,
    conversation,
    clearConversation,
    setLanguage,
    toggle,
    stop
  };
}
