import { describe, expect, it } from 'vitest';
import { createGateState, DEFAULT_GATE_PARAMS, processGate } from '../src/engine/audio/noiseGate';

const SAMPLE_RATE = 48000;
/** Tamanho do bloco com que o AudioWorklet chama o processador. */
const RENDER_QUANTUM = 128;
const TONE_HZ = 440;

/** Gera um tom cuja amplitude muda no tempo: amplitudeAt recebe o índice da amostra. */
function render(totalSamples: number, amplitudeAt: (sample: number) => number): Float32Array {
  const signal = new Float32Array(totalSamples);
  for (let n = 0; n < totalSamples; n++) {
    signal[n] = amplitudeAt(n) * Math.sin((2 * Math.PI * TONE_HZ * n) / SAMPLE_RATE);
  }
  return signal;
}

/** Amplitude de pico de um tom com RMS em dBFS. */
function amplitudeForRmsDb(rmsDb: number): number {
  return Math.SQRT2 * Math.pow(10, rmsDb / 20);
}

/** Passa o sinal pelo portão em blocos de 128 amostras, como o AudioWorklet faz. */
function runGate(input: Float32Array): Float32Array {
  const state = createGateState();
  const output = new Float32Array(input.length);
  for (let start = 0; start < input.length; start += RENDER_QUANTUM) {
    const end = Math.min(input.length, start + RENDER_QUANTUM);
    processGate(state, input.subarray(start, end), output.subarray(start, end), SAMPLE_RATE, DEFAULT_GATE_PARAMS);
  }
  return output;
}

/** RMS de um trecho do sinal, em segundos. */
function rmsBetween(signal: Float32Array, fromS: number, toS: number): number {
  const from = Math.floor(fromS * SAMPLE_RATE);
  const to = Math.floor(toS * SAMPLE_RATE);
  let sum = 0;
  for (let n = from; n < to; n++) {
    const value = signal[n] ?? 0;
    sum += value * value;
  }
  return Math.sqrt(sum / (to - from));
}

/** Diferença de nível, em dB, entre a saída e a entrada num mesmo trecho. */
function gainDbBetween(input: Float32Array, output: Float32Array, fromS: number, toS: number): number {
  return 20 * Math.log10(rmsBetween(output, fromS, toS) / rmsBetween(input, fromS, toS));
}

describe('processGate', () => {
  it('atenua o ruído baixo (−60 dB) em cerca de 24 dB quando o portão fecha', () => {
    const quiet = amplitudeForRmsDb(-60);
    const input = render(SAMPLE_RATE, () => quiet);
    const output = runGate(input);
    expect(gainDbBetween(input, output, 0.5, 1)).toBeCloseTo(-24, 0);
  });

  it('deixa a fala alta (−10 dB) passar quase igual', () => {
    const loud = amplitudeForRmsDb(-10);
    const input = render(SAMPLE_RATE, () => loud);
    const output = runGate(input);
    expect(Math.abs(gainDbBetween(input, output, 0.3, 1))).toBeLessThan(0.5);
  });

  it('segura o portão aberto por holdMs depois da fala e fecha depois', () => {
    const loud = amplitudeForRmsDb(-10);
    const quiet = amplitudeForRmsDb(-60);
    const input = render(Math.round(1.5 * SAMPLE_RATE), (n) => (n < 0.2 * SAMPLE_RATE ? loud : quiet));
    const output = runGate(input);
    expect(Math.abs(gainDbBetween(input, output, 0.21, 0.25))).toBeLessThan(1);
    expect(gainDbBetween(input, output, 1, 1.5)).toBeCloseTo(-24, 0);
  });

  it('o piso é atenuação, não silêncio: a saída fechada continua com sinal', () => {
    const quiet = amplitudeForRmsDb(-60);
    const output = runGate(render(SAMPLE_RATE, () => quiet));
    expect(rmsBetween(output, 0.5, 1)).toBeGreaterThan(0);
  });

  it('a troca de ganho é suave: sem degrau grande entre amostras (sem clique)', () => {
    const loud = 0.3;
    const quiet = 0.001;
    const segments: Array<{ seconds: number; level: number }> = [
      { seconds: 0.3, level: loud },
      { seconds: 0.4, level: quiet },
      { seconds: 0.3, level: loud },
    ];
    const boundaries: number[] = [];
    let total = 0;
    for (const segment of segments) {
      total += Math.round(segment.seconds * SAMPLE_RATE);
      boundaries.push(total);
    }
    const input = new Float32Array(total);
    let start = 0;
    for (const segment of segments) {
      const end = start + Math.round(segment.seconds * SAMPLE_RATE);
      input.fill(segment.level, start, end);
      start = end;
    }
    const output = runGate(input);
    const maxStepLimit = 0.002;
    let maxStep = 0;
    for (let n = 1; n < total; n++) {
      if (input[n] !== input[n - 1]) continue;
      maxStep = Math.max(maxStep, Math.abs((output[n] ?? 0) - (output[n - 1] ?? 0)));
    }
    expect(maxStep).toBeLessThan(maxStepLimit);
    const closedAt = boundaries[1] ?? 0;
    expect(Math.abs(output[closedAt - 1] ?? 0)).toBeLessThan(Math.abs(loud) * 0.1);
  });
});
