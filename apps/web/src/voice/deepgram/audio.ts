import micWorkletUrl from "./mic-worklet.ts?url";

const PLAYBACK_SAMPLE_RATE = 24000;
const MIC_SAMPLE_RATE = 24000;

export type VoiceAudioPipelineOptions = {
  onMicChunk: (samples: Int16Array) => void;
  onError?: (error: Error) => void;
};

export class VoiceAudioPipeline {
  private options: VoiceAudioPipelineOptions;
  private micContext: AudioContext | null = null;
  private playbackContext: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private nextStartTime = 0;
  private activeSources = new Set<AudioBufferSourceNode>();
  private stopped = false;

  constructor(options: VoiceAudioPipelineOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    if (this.stopped) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone access is not supported in this browser.");
    }

    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: MIC_SAMPLE_RATE
      }
    });

    this.playbackContext = new AudioContext({ sampleRate: PLAYBACK_SAMPLE_RATE });
    this.micContext = new AudioContext({ sampleRate: MIC_SAMPLE_RATE });

    await this.micContext.audioWorklet.addModule(micWorkletUrl);
    this.workletNode = new AudioWorkletNode(this.micContext, "graphcode-mic-processor", {
      channelCount: 1,
      numberOfInputs: 1,
      numberOfOutputs: 0
    });
    this.workletNode.port.onmessage = (event) => {
      if (this.stopped) return;
      const samples = event.data?.samples as Int16Array | undefined;
      if (samples instanceof Int16Array) {
        this.options.onMicChunk(samples);
      }
    };

    const source = this.micContext.createMediaStreamSource(this.micStream);
    source.connect(this.workletNode);

    if (this.micContext.state === "suspended") {
      await this.micContext.resume();
    }
    if (this.playbackContext.state === "suspended") {
      await this.playbackContext.resume();
    }
  }

  enqueuePlayback(samples: Int16Array): void {
    if (this.stopped || !this.playbackContext || samples.length === 0) return;
    const ctx = this.playbackContext;

    const buffer = ctx.createBuffer(1, samples.length, PLAYBACK_SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) {
      channel[i] = samples[i] / 32768;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    if (this.nextStartTime < now) {
      this.nextStartTime = now + 0.05;
    }

    source.onended = () => {
      this.activeSources.delete(source);
    };

    source.start(this.nextStartTime);
    this.activeSources.add(source);
    this.nextStartTime += buffer.duration;
  }

  interruptPlayback(): void {
    if (!this.playbackContext) return;
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    this.activeSources.clear();
    this.nextStartTime = this.playbackContext.currentTime;
  }

  stop(): void {
    this.stopped = true;
    this.interruptPlayback();
    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.micStream) {
      for (const track of this.micStream.getTracks()) {
        track.stop();
      }
      this.micStream = null;
    }
    if (this.micContext) {
      void this.micContext.close();
      this.micContext = null;
    }
    if (this.playbackContext) {
      void this.playbackContext.close();
      this.playbackContext = null;
    }
  }
}
