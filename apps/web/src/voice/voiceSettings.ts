import type { VoiceLanguage } from "@graphcode/graph-model";

export type VoiceEngine = "webspeech" | "deepgram";

export type VoiceSettings = {
  engine: VoiceEngine;
  language: VoiceLanguage;
  engineManuallySet?: boolean;
};

const STORAGE_KEY = "graphcode.voiceSettings.v1";

const VOICE_SETTINGS_CHANGED_EVENT = "graphcode:voice-settings-changed";

export function getStoredVoiceSettings(): VoiceSettings {
  if (typeof window === "undefined") {
    return { engine: "webspeech", language: "zh-CN" };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { engine: "webspeech", language: "zh-CN" };
    }
    const parsed = JSON.parse(raw) as Partial<VoiceSettings>;
    return {
      engine: parsed.engine === "deepgram" ? "deepgram" : "webspeech",
      language: parsed.language === "en-US" ? "en-US" : "zh-CN",
      engineManuallySet: parsed.engineManuallySet === true
    };
  } catch {
    return { engine: "webspeech", language: "zh-CN" };
  }
}

export function rememberVoiceSettings(settings: VoiceSettings): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent(VOICE_SETTINGS_CHANGED_EVENT, { detail: settings }));
  } catch {
    // Voice settings persistence should never block command execution.
  }
}

export function subscribeVoiceSettingsChanged(listener: (settings: VoiceSettings) => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  const handler = (event: Event) => {
    const settings = (event as CustomEvent<VoiceSettings>).detail;
    if (settings) listener(settings);
  };
  window.addEventListener(VOICE_SETTINGS_CHANGED_EVENT, handler);
  return () => window.removeEventListener(VOICE_SETTINGS_CHANGED_EVENT, handler);
}
