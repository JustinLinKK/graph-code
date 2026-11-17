import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { ControlCommand, VoiceLanguage } from "@graphcode/graph-model";
import * as api from "../../api";
import { runCommand } from "../../commands";
import { useDeepgramVoice } from "./useDeepgramVoice";

vi.mock("./client", () => ({
  DeepgramAgentClient: vi.fn()
}));

vi.mock("./audio", () => ({
  VoiceAudioPipeline: vi.fn()
}));

vi.mock("../../commands", () => ({
  runCommand: vi.fn(),
  getCommandContext: vi.fn(() => ({
    projectId: null,
    projectName: null,
    selectedNodeId: null,
    scopeNodeId: null,
    nodes: [],
    agentRuns: [],
    hasActiveCodingWorkflow: false
  })),
  registerCommand: vi.fn(),
  listCommands: vi.fn(() => []),
  syncCommandCenter: vi.fn()
}));

import { DeepgramAgentClient } from "./client";
import { VoiceAudioPipeline } from "./audio";
import type { DeepgramAgentCallbacks } from "./types";

function createMockClient() {
  const callbacks: Record<string, (...args: unknown[]) => void> = {};
  return {
    connected: false,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    sendAudio: vi.fn(),
    sendUpdateThink: vi.fn(),
    sendFunctionCallResponse: vi.fn(),
    register: (name: string, fn: (...args: any[]) => void) => {
      callbacks[name] = fn;
    },
    trigger: (name: string, ...args: unknown[]) => callbacks[name]?.(...args),
    get callbacks() {
      return callbacks;
    }
  };
}

function createMockPipeline() {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    enqueuePlayback: vi.fn(),
    interruptPlayback: vi.fn()
  };
}

describe("useDeepgramVoice", () => {
  let clientInstance: ReturnType<typeof createMockClient>;
  let pipelineInstance: ReturnType<typeof createMockPipeline>;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn()
    });
    vi.spyOn(api, "getDeepgramVoiceToken").mockResolvedValue({ configured: true, accessToken: "token", expiresIn: 60 });
    clientInstance = createMockClient();
    pipelineInstance = createMockPipeline();
    vi.mocked(DeepgramAgentClient).mockImplementation((callbacks?: DeepgramAgentCallbacks) => {
      if (callbacks?.onSettingsApplied) clientInstance.register("onSettingsApplied", callbacks.onSettingsApplied);
      if (callbacks?.onConversationText) clientInstance.register("onConversationText", callbacks.onConversationText);
      if (callbacks?.onUserStartedSpeaking) clientInstance.register("onUserStartedSpeaking", callbacks.onUserStartedSpeaking);
      if (callbacks?.onFunctionCallRequest) clientInstance.register("onFunctionCallRequest", callbacks.onFunctionCallRequest);
      if (callbacks?.onAudio) clientInstance.register("onAudio", callbacks.onAudio);
      if (callbacks?.onClose) clientInstance.register("onClose", callbacks.onClose);
      if (callbacks?.onError) clientInstance.register("onError", callbacks.onError);
      return clientInstance as unknown as DeepgramAgentClient;
    });
    vi.mocked(VoiceAudioPipeline).mockImplementation(() => pipelineInstance as unknown as VoiceAudioPipeline);
    vi.mocked(runCommand).mockResolvedValue({ ok: true, summary: "done" });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reports unsupported when the server has no Deepgram key", async () => {
    vi.spyOn(api, "getDeepgramVoiceToken").mockResolvedValue({ configured: false });
    const { result } = renderHook(() =>
      useDeepgramVoice({ projectId: null, onCommand: () => {} })
    );
    await waitFor(() => expect(result.current.supported).toBe(false));
    expect(result.current.status).toBe("idle");
  });

  it("connects and reaches listening after settings are applied", async () => {
    const { result } = renderHook(() =>
      useDeepgramVoice({ projectId: "p1", onCommand: () => {} })
    );
    await waitFor(() => expect(result.current.supported).toBe(true));

    await act(async () => {
      result.current.toggle();
    });
    expect(result.current.status).toBe("connecting");

    await act(async () => {
      clientInstance.trigger("onSettingsApplied");
    });
    expect(result.current.status).toBe("listening");
  });

  it("bridges function calls to runCommand and sends the response", async () => {
    const { result } = renderHook(() =>
      useDeepgramVoice({ projectId: "p1", onCommand: () => {} })
    );
    await waitFor(() => expect(result.current.supported).toBe(true));
    await act(async () => result.current.toggle());
    await act(async () => clientInstance.trigger("onSettingsApplied"));

    await act(async () => {
      clientInstance.trigger("onFunctionCallRequest", [
        { id: "fc-1", name: "scan", arguments: "{}" }
      ]);
    });

    await waitFor(() => {
      expect(runCommand).toHaveBeenCalledWith("scan", {});
    });
    expect(clientInstance.sendFunctionCallResponse).toHaveBeenCalledWith(
      "fc-1",
      "scan",
      JSON.stringify({ ok: true, summary: "done" })
    );
    expect(result.current.status).toBe("listening");
  });

  it("records conversation text and command results", async () => {
    const { result } = renderHook(() =>
      useDeepgramVoice({ projectId: "p1", onCommand: () => {} })
    );
    await waitFor(() => expect(result.current.supported).toBe(true));
    await act(async () => result.current.toggle());
    await act(async () => clientInstance.trigger("onSettingsApplied"));

    await act(async () => {
      clientInstance.trigger("onConversationText", "user", "scan the repo");
    });
    await act(async () => {
      clientInstance.trigger("onFunctionCallRequest", [
        { id: "fc-1", name: "scan", arguments: "{}" }
      ]);
    });

    await waitFor(() => {
      expect(result.current.conversation.some((m) => m.role === "user" && m.text === "scan the repo")).toBe(true);
    });
    await waitFor(() => {
      expect(result.current.conversation.some((m) => m.role === "system" && m.text === "done")).toBe(true);
    });
  });
});
