// @ts-nocheck
// This file is loaded as an AudioWorklet module via Vite's ?url import.

class GraphCodeMicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;

    // sampleRate is provided by the AudioWorkletGlobalScope.
    const sourceRate = sampleRate;
    const targetRate = 24000;

    const outputLength =
      sourceRate === targetRate
        ? input.length
        : Math.floor((input.length * targetRate) / sourceRate);

    if (outputLength === 0) return true;

    const int16 = new Int16Array(outputLength);
    for (let i = 0; i < outputLength; i += 1) {
      const sourceIndex = sourceRate === targetRate ? i : (i * sourceRate) / targetRate;
      const index0 = Math.floor(sourceIndex);
      const index1 = Math.min(index0 + 1, input.length - 1);
      const fraction = sourceIndex - index0;
      const sample = input[index0] * (1 - fraction) + input[index1] * fraction;
      const clamped = Math.max(-1, Math.min(1, sample));
      int16[i] = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
    }

    this.port.postMessage({ type: "chunk", samples: int16 }, [int16.buffer]);
    return true;
  }
}

registerProcessor("graphcode-mic-processor", GraphCodeMicProcessor);

export {};
