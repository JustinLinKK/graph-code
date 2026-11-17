import { getDeepgramVoiceToken } from "../../api";
import type {
  DeepgramAgentCallbacks,
  DeepgramAgentEvent,
  DeepgramAgentSettings,
  DeepgramFunctionCall,
  DeepgramIncomingMessage,
  DeepgramOutgoingMessage
} from "./types";

const WS_URL = "wss://agent.deepgram.com/v1/agent/converse";
const KEEP_ALIVE_INTERVAL_MS = 8000;
const RECONNECT_DELAYS_MS = [1000, 2000];

export class DeepgramAgentClient {
  private ws: WebSocket | null = null;
  private callbacks: DeepgramAgentCallbacks;
  private settings: DeepgramAgentSettings | null = null;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private explicitDisconnect = false;
  private pendingConnect: Promise<void> | null = null;

  constructor(callbacks: DeepgramAgentCallbacks = {}) {
    this.callbacks = callbacks;
  }

  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  async connect(settings: DeepgramAgentSettings): Promise<void> {
    if (this.pendingConnect) {
      return this.pendingConnect;
    }
    this.settings = settings;
    this.explicitDisconnect = false;
    this.pendingConnect = this.doConnect();
    try {
      await this.pendingConnect;
    } finally {
      this.pendingConnect = null;
    }
  }

  private async doConnect(): Promise<void> {
    const tokenResponse = await getDeepgramVoiceToken();
    if (!tokenResponse.configured) {
      throw new Error("deepgram-not-configured");
    }

    return new Promise((resolve, reject) => {
      let resolved = false;
      // Temporary JWTs from /v1/auth/grant authenticate as "bearer", not "token"
      // (the "token" subprotocol is only for long-lived API keys).
      const ws = new WebSocket(WS_URL, ["bearer", tokenResponse.accessToken]);
      this.ws = ws;
      ws.binaryType = "arraybuffer";

      const onOpen = () => {
        this.callbacks.onOpen?.();
        this.sendJson(this.settings!);
        this.startKeepAlive();
      };

      const onMessage = (event: MessageEvent) => {
        if (event.data instanceof ArrayBuffer) {
          this.emit({ kind: "audio", samples: new Int16Array(event.data) });
          return;
        }
        const message = this.parseIncoming(event.data);
        if (!message) return;
        this.handleMessage(message, () => {
          if (!resolved) {
            resolved = true;
            this.reconnectAttempt = 0;
            resolve();
          }
        });
      };

      const onError = (event: Event) => {
        const error = event instanceof ErrorEvent ? event.error : new Error("WebSocket error");
        this.emit({ kind: "error", error });
        if (!resolved) {
          resolved = true;
          reject(error);
        }
      };

      const onClose = (event: CloseEvent) => {
        this.stopKeepAlive();
        this.ws = null;
        const willReconnect = !this.explicitDisconnect && this.reconnectAttempt < RECONNECT_DELAYS_MS.length;
        this.emit({ kind: "close", code: event.code, reason: event.reason, willReconnect });
        if (!resolved) {
          resolved = true;
          reject(new Error(`WebSocket closed before settings applied: ${event.code}`));
        } else if (willReconnect) {
          this.scheduleReconnect();
        }
      };

      ws.addEventListener("open", onOpen);
      ws.addEventListener("message", onMessage);
      ws.addEventListener("error", onError);
      ws.addEventListener("close", onClose);
    });
  }

  disconnect(): void {
    this.explicitDisconnect = true;
    this.stopReconnect();
    this.stopKeepAlive();
    if (this.ws) {
      try {
        this.ws.close(1000, "client disconnect");
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }

  sendAudio(samples: Int16Array): void {
    if (this.connected && samples.length > 0) {
      this.ws!.send(samples.buffer);
    }
  }

  sendUpdateThink(think: DeepgramAgentSettings["agent"]["think"]): void {
    this.sendJson({ type: "UpdateThink", think });
  }

  sendFunctionCallResponse(id: string, name: string, content: string): void {
    this.sendJson({ type: "FunctionCallResponse", id, name, content });
  }

  private sendJson(message: DeepgramOutgoingMessage): void {
    if (this.connected) {
      this.ws!.send(JSON.stringify(message));
    }
  }

  private sendKeepAlive(): void {
    this.sendJson({ type: "KeepAlive" });
  }

  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.keepAliveTimer = setInterval(() => this.sendKeepAlive(), KEEP_ALIVE_INTERVAL_MS);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  private scheduleReconnect(): void {
    this.stopReconnect();
    const delay = RECONNECT_DELAYS_MS[this.reconnectAttempt] ?? RECONNECT_DELAYS_MS.at(-1) ?? 1000;
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      if (!this.explicitDisconnect && this.settings) {
        void this.doConnect().catch(() => {
          // Error already emitted; close handler will schedule next attempt or give up.
        });
      }
    }, delay);
  }

  private stopReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private parseIncoming(data: unknown): DeepgramIncomingMessage | null {
    if (typeof data !== "string") return null;
    try {
      return JSON.parse(data) as DeepgramIncomingMessage;
    } catch {
      return null;
    }
  }

  private handleMessage(message: DeepgramIncomingMessage, markReady: () => void): void {
    switch (message.type) {
      case "Welcome":
        break;
      case "SettingsApplied":
        markReady();
        this.emit({ kind: "settingsApplied" });
        break;
      case "ConversationText":
        this.emit({ kind: "conversationText", role: message.role, content: message.content });
        break;
      case "UserStartedSpeaking":
        this.emit({ kind: "userStartedSpeaking" });
        break;
      case "AgentStartedSpeaking":
        this.emit({ kind: "agentStartedSpeaking" });
        break;
      case "AgentThinking":
        this.emit({ kind: "agentThinking" });
        break;
      case "AgentAudioDone":
        this.emit({ kind: "agentAudioDone" });
        break;
      case "FunctionCallRequest":
        this.emit({ kind: "functionCallRequest", functions: message.functions });
        break;
      case "Error":
        this.emit({ kind: "error", error: new Error(message.description ?? `Deepgram error ${message.code ?? ""}`) });
        break;
      case "Warning":
        // Warnings are non-fatal; surface them as errors for visibility.
        this.emit({ kind: "error", error: new Error(message.description ?? `Deepgram warning ${message.code ?? ""}`) });
        break;
      case "KeepAlive":
        break;
      default:
        // Unknown message types are ignored.
        break;
    }
  }

  private emit(event: DeepgramAgentEvent): void {
    switch (event.kind) {
      case "open":
        this.callbacks.onOpen?.();
        break;
      case "close":
        this.callbacks.onClose?.({ code: event.code, reason: event.reason, willReconnect: event.willReconnect });
        break;
      case "error":
        this.callbacks.onError?.(event.error);
        break;
      case "settingsApplied":
        this.callbacks.onSettingsApplied?.();
        break;
      case "conversationText":
        this.callbacks.onConversationText?.(event.role, event.content);
        break;
      case "userStartedSpeaking":
        this.callbacks.onUserStartedSpeaking?.();
        break;
      case "agentStartedSpeaking":
        this.callbacks.onAgentStartedSpeaking?.();
        break;
      case "agentThinking":
        this.callbacks.onAgentThinking?.();
        break;
      case "agentAudioDone":
        this.callbacks.onAgentAudioDone?.();
        break;
      case "functionCallRequest":
        this.callbacks.onFunctionCallRequest?.(event.functions);
        break;
      case "audio":
        this.callbacks.onAudio?.(event.samples);
        break;
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function unusedFunctionCall(_call: DeepgramFunctionCall): void {
  // Placeholder to guarantee the import is used in builds with strict unused checks.
}
