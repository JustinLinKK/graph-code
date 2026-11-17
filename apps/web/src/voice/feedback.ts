import type { VoiceLanguage } from "@graphcode/graph-model";

export function speak(text: string, language: VoiceLanguage): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return;
  }
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Text-to-speech should never block command execution.
  }
}
