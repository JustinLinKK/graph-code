import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEEPGRAM_CONFIG_CHANGED_EVENT, getDeepgramVoiceToken } from "../api";
import { useVoiceControl } from "./useVoiceControl";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    getDeepgramVoiceToken: vi.fn()
  };
});

vi.mock("./useWebSpeechControl", () => ({
  useWebSpeechControl: vi.fn(() => ({
    supported: true,
    status: "idle",
    transcript: "",
    listening: false,
    language: "zh-CN",
    conversation: [],
    clearConversation: vi.fn(),
    setLanguage: vi.fn(),
    toggle: vi.fn(),
    stop: vi.fn()
  }))
}));

vi.mock("./deepgram/useDeepgramVoice", () => ({
  useDeepgramVoice: vi.fn(() => ({
    supported: true,
    status: "idle",
    transcript: "",
    listening: false,
    language: "zh-CN",
    conversation: [],
    clearConversation: vi.fn(),
    setLanguage: vi.fn(),
    toggle: vi.fn(),
    stop: vi.fn()
  }))
}));

describe("useVoiceControl", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn()
    });
    vi.mocked(getDeepgramVoiceToken).mockResolvedValue({ configured: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("defaults to webspeech when Deepgram is not configured", async () => {
    const { result } = renderHook(() => useVoiceControl({ projectId: null, onCommand: async () => undefined }));
    await waitFor(() => expect(getDeepgramVoiceToken).toHaveBeenCalled());
    expect(result.current.engine).toBe("webspeech");
  });

  it("auto-switches to Deepgram when the server has a key", async () => {
    vi.mocked(getDeepgramVoiceToken).mockResolvedValue({ configured: true, accessToken: "t", expiresIn: 60 });
    const { result } = renderHook(() => useVoiceControl({ projectId: null, onCommand: async () => undefined }));
    await waitFor(() => expect(result.current.engine).toBe("deepgram"));
  });

  it("re-probes when a runtime key is configured from the UI", async () => {
    const { result } = renderHook(() => useVoiceControl({ projectId: null, onCommand: async () => undefined }));
    await waitFor(() => expect(result.current.deepgramConfigured).toBe(false));

    vi.mocked(getDeepgramVoiceToken).mockResolvedValue({ configured: true, accessToken: "t", expiresIn: 60 });
    act(() => {
      window.dispatchEvent(new CustomEvent(DEEPGRAM_CONFIG_CHANGED_EVENT));
    });

    await waitFor(() => expect(result.current.deepgramConfigured).toBe(true));
    await waitFor(() => expect(result.current.engine).toBe("deepgram"));
  });

  it("stays on webspeech when the user picked it manually", async () => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => JSON.stringify({ engine: "webspeech", language: "zh-CN", engineManuallySet: true })),
      setItem: vi.fn()
    });
    vi.mocked(getDeepgramVoiceToken).mockResolvedValue({ configured: true, accessToken: "t", expiresIn: 60 });
    const { result } = renderHook(() => useVoiceControl({ projectId: null, onCommand: async () => undefined }));
    await waitFor(() => expect(result.current.deepgramConfigured).toBe(true));
    expect(result.current.engine).toBe("webspeech");
  });
});
