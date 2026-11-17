import { useCallback, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import type { ControlCommand, VoiceLanguage } from "@graphcode/graph-model";
import { DEEPGRAM_CONFIG_CHANGED_EVENT, getDeepgramVoiceToken } from "../api";
import {
  getStoredVoiceSettings,
  rememberVoiceSettings,
  subscribeVoiceSettingsChanged,
  type VoiceEngine,
  type VoiceSettings
} from "./voiceSettings";
import { useDeepgramVoice } from "./deepgram/useDeepgramVoice";
import { useWebSpeechControl } from "./useWebSpeechControl";
import type { CommandResult } from "../commands";
import type { VoiceControlApi } from "./types";

export type { VoiceControlApi };

export type VoiceControlState = VoiceControlApi & {
  engine: VoiceEngine;
  setEngine: (engine: VoiceEngine) => void;
  deepgramConfigured: boolean;
};

export function useVoiceControl(options: {
  projectId: string | null;
  onCommand: (command: ControlCommand, ack: string, language: VoiceLanguage) => Promise<CommandResult | undefined>;
  shouldStart?: () => boolean;
}): VoiceControlState {
  const { projectId, onCommand, shouldStart } = options;
  const stored = getStoredVoiceSettings();
  const [engine, setEngineState] = useState<VoiceEngine>(stored.engine);
  const [engineManuallySet, setEngineManuallySet] = useState<boolean>(stored.engineManuallySet ?? false);
  const [deepgramConfigured, setDeepgramConfigured] = useState(false);

  useEffect(() => {
    return subscribeVoiceSettingsChanged((settings) => {
      setEngineState(settings.engine);
      setEngineManuallySet(settings.engineManuallySet ?? false);
    });
  }, []);

  const probeDeepgram = useCallback(() => {
    getDeepgramVoiceToken()
      .then((response) => setDeepgramConfigured(response.configured))
      .catch(() => setDeepgramConfigured(false));
  }, []);

  useEffect(() => {
    probeDeepgram();
  }, [probeDeepgram]);

  // The Settings voice tab can inject a runtime key into the local server at any
  // moment; re-probe so the microphone becomes available immediately.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => probeDeepgram();
    window.addEventListener(DEEPGRAM_CONFIG_CHANGED_EVENT, handler);
    return () => window.removeEventListener(DEEPGRAM_CONFIG_CHANGED_EVENT, handler);
  }, [probeDeepgram]);

  const setEngine = useCallback((next: VoiceEngine, manual = true) => {
    const current = getStoredVoiceSettings();
    const updated: VoiceSettings = { ...current, engine: next, engineManuallySet: manual || current.engineManuallySet };
    rememberVoiceSettings(updated);
    setEngineState(next);
    setEngineManuallySet(updated.engineManuallySet ?? false);
  }, []);

  // Auto-default to Deepgram when the local server has a key configured and the
  // user has not explicitly chosen Web Speech.
  useEffect(() => {
    if (engine === "webspeech" && !engineManuallySet && deepgramConfigured) {
      setEngine("deepgram", false);
    }
  }, [engine, engineManuallySet, deepgramConfigured, setEngine]);

  const webSpeech = useWebSpeechControl({
    projectId,
    onCommand,
    shouldStart,
    enabled: engine === "webspeech"
  });
  const deepgram = useDeepgramVoice({
    projectId,
    onCommand,
    shouldStart,
    enabled: engine === "deepgram"
  });

  // If Deepgram is selected but its probe failed (no key, bad key, or missing
  // grant permissions), fall back to Web Speech so the microphone stays usable.
  const active = engine === "deepgram" && deepgram.supported ? deepgram : webSpeech;

  const toggle = useCallback(() => {
    if (engine === "webspeech" && !engineManuallySet && deepgramConfigured) {
      flushSync(() => setEngine("deepgram", false));
      deepgram.toggle();
      return;
    }
    active.toggle();
  }, [engine, engineManuallySet, deepgramConfigured, setEngine, active, deepgram]);

  return useMemo(
    () => ({
      supported: active.supported,
      status: active.status,
      transcript: active.transcript,
      listening: active.listening,
      language: active.language,
      conversation: active.conversation,
      clearConversation: active.clearConversation,
      setLanguage: active.setLanguage,
      toggle,
      stop: active.stop,
      engine,
      setEngine,
      deepgramConfigured
    }),
    [active, toggle, engine, setEngine, deepgramConfigured]
  );
}
