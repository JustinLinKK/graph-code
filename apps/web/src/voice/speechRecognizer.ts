import type { VoiceLanguage } from "@graphcode/graph-model";
import type { SpeechRecognizer, SpeechRecognizerEvent } from "./types";

export function isSpeechRecognitionSupported(): boolean {
  return typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function createWebSpeechRecognizer(): SpeechRecognizer {
  const listeners = new Set<(event: SpeechRecognizerEvent) => void>();
  let recognition: SpeechRecognition | null = null;
  let language: VoiceLanguage = "zh-CN";

  const supported = isSpeechRecognitionSupported();

  function emit(event: SpeechRecognizerEvent): void {
    for (const listener of listeners) {
      listener(event);
    }
  }

  function ensureInstance(): SpeechRecognition | null {
    if (recognition) {
      return recognition;
    }
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      return null;
    }
    recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = language;
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const alternative = result[0];
        if (alternative) {
          emit({ type: "transcript", text: alternative.transcript, isFinal: result.isFinal });
        }
      }
    };
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      emit({ type: "error", error: event.error });
    };
    recognition.onend = () => {
      emit({ type: "end" });
    };
    return recognition;
  }

  return {
    supported,
    setLanguage(next: VoiceLanguage): void {
      language = next;
      if (recognition) {
        recognition.lang = next;
      }
    },
    start(): void {
      if (!supported) {
        return;
      }
      const instance = ensureInstance();
      if (!instance) {
        return;
      }
      emit({ type: "start" });
      try {
        instance.start();
      } catch {
        // A second start() while recognition is already active throws InvalidStateError.
      }
    },
    stop(): void {
      recognition?.stop();
    },
    abort(): void {
      recognition?.abort();
    },
    subscribe(listener: (event: SpeechRecognizerEvent) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
