// Processador do portão de ruído, rodando na thread de áudio (AudioWorklet 'noise-gate').
// Usa a lógica pura de ../noiseGate.ts, com um estado por canal. Os parâmetros chegam em processorOptions.
// Empacotado pelo plugin `?worklet-data` (ver denoise.ts e scripts/workletDataUrl.ts) como URL data:, que carrega em dev, http e file://.

import { createGateState, DEFAULT_GATE_PARAMS, processGate, type GateParams, type GateState } from '../noiseGate';

// Tipos do escopo do AudioWorklet, que a lib DOM padrão não declara.
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}
declare function registerProcessor(
  name: string,
  processorCtor: new (options: AudioWorkletNodeOptions) => AudioWorkletProcessor,
): void;
declare const sampleRate: number;

/** Portão de ruído de um nó do AudioWorklet: um estado de portão por canal. */
class NoiseGateProcessor extends AudioWorkletProcessor {
  private readonly params: GateParams;
  private readonly states: GateState[] = [];

  constructor(options: AudioWorkletNodeOptions) {
    super();
    const given = (options.processorOptions ?? {}) as Partial<GateParams>;
    this.params = { ...DEFAULT_GATE_PARAMS, ...given };
  }

  /** Chamado pelo motor de áudio a cada bloco de 128 amostras. */
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0] ?? [];
    const output = outputs[0];
    if (output === undefined) return true;
    output.forEach((channel, index) => {
      const source = input[index];
      if (source === undefined) {
        channel.fill(0);
        return;
      }
      const state = this.states[index] ?? createGateState();
      this.states[index] = state;
      processGate(state, source, channel, sampleRate, this.params);
    });
    return true;
  }
}

registerProcessor('noise-gate', NoiseGateProcessor);
