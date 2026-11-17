export type DeepgramFunctionDefinition = {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  // Functions without an endpoint field are client-side by definition; Deepgram
  // rejects an explicit client_side flag with UNPARSABLE_CLIENT_MESSAGE.
};

export type DeepgramAgentSettings = {
  type: "Settings";
  audio: {
    input: { encoding: "linear16"; sample_rate: 24000 };
    output: { encoding: "linear16"; sample_rate: 24000; container: "none" };
  };
  agent: {
    language?: string;
    listen: {
      provider: { type: "deepgram"; model: "nova-3"; language?: string };
    };
    think: {
      provider: { type: "open_ai"; model: "gpt-4o-mini"; temperature: number };
      prompt: string;
      functions: DeepgramFunctionDefinition[];
    };
    speak: {
      provider: { type: "deepgram"; model: string };
    };
    greeting?: string;
  };
};

export type DeepgramFunctionCall = {
  id: string;
  name: string;
  arguments: string;
};

export type DeepgramIncomingMessage =
  | { type: "Welcome" }
  | { type: "SettingsApplied" }
  | { type: "ConversationText"; role: "user" | "assistant"; content: string }
  | { type: "UserStartedSpeaking" }
  | { type: "AgentStartedSpeaking" }
  | { type: "AgentThinking" }
  | { type: "AgentAudioDone" }
  | { type: "FunctionCallRequest"; functions: DeepgramFunctionCall[] }
  | { type: "Error"; code?: string; description?: string }
  | { type: "Warning"; code?: string; description?: string }
  | { type: "KeepAlive" };

export type DeepgramOutgoingMessage =
  | DeepgramAgentSettings
  | { type: "UpdateThink"; think: DeepgramAgentSettings["agent"]["think"] }
  | { type: "FunctionCallResponse"; id: string; name: string; content: string }
  | { type: "KeepAlive" };

export type DeepgramAgentEvent =
  | { kind: "open" }
  | { kind: "close"; code: number; reason: string; willReconnect: boolean }
  | { kind: "error"; error: Error }
  | { kind: "settingsApplied" }
  | { kind: "conversationText"; role: "user" | "assistant"; content: string }
  | { kind: "userStartedSpeaking" }
  | { kind: "agentStartedSpeaking" }
  | { kind: "agentThinking" }
  | { kind: "agentAudioDone" }
  | { kind: "functionCallRequest"; functions: DeepgramFunctionCall[] }
  | { kind: "audio"; samples: Int16Array };

export type DeepgramAgentCallbacks = {
  onOpen?: () => void;
  onClose?: (event: { code: number; reason: string; willReconnect: boolean }) => void;
  onError?: (error: Error) => void;
  onSettingsApplied?: () => void;
  onConversationText?: (role: "user" | "assistant", content: string) => void;
  onUserStartedSpeaking?: () => void;
  onAgentStartedSpeaking?: () => void;
  onAgentThinking?: () => void;
  onAgentAudioDone?: () => void;
  onFunctionCallRequest?: (functions: DeepgramFunctionCall[]) => void;
  onAudio?: (samples: Int16Array) => void;
};
