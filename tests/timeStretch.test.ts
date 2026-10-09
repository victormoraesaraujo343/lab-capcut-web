import { describe, expect, it } from 'vitest';
import { wsolaStretch } from '../src/engine/audio/timeStretch';

const SAMPLE_RATE = 16000;

/** Senoide de frequência dada, com a duração em segundos. */
function sine(frequencyHz: number, seconds: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * SAMPLE_RATE));
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.sin((2 * Math.PI * frequencyHz * i) / SAMPLE_RATE);
  }
  return out;
}

/** Frequência estimada pelos cruzamentos por zero de subida. */
function estimateFrequency(samples: Float32Array): number {
  let crossings = 0;
  for (let i = 1; i < samples.length; i++) {
    if ((samples[i - 1] ?? 0) < 0 && (samples[i] ?? 0) >= 0) crossings++;
  }
  return crossings / (samples.length / SAMPLE_RATE);
}

describe('wsolaStretch', () => {
  it('mantém o tom: seno de 440 Hz esticado continua perto de 440 Hz', () => {
    const input = sine(440, 1);
    const out = wsolaStretch(input, SAMPLE_RATE, 2);
    const freq = estimateFrequency(out.subarray(1600, out.length - 1600));
    expect(Math.abs(freq - 440) / 440).toBeLessThan(0.03);
  });

  it('muda o tamanho pela taxa: rate 2 gera metade e rate 0,5 o dobro', () => {
    const input = sine(440, 1);
    expect(Math.abs(wsolaStretch(input, SAMPLE_RATE, 2).length - input.length / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(wsolaStretch(input, SAMPLE_RATE, 0.5).length - input.length * 2)).toBeLessThanOrEqual(1);
  });

  it('com taxa 1 devolve uma cópia igual à entrada', () => {
    const input = sine(220, 0.1);
    const out = wsolaStretch(input, SAMPLE_RATE, 1);
    expect(out).not.toBe(input);
    expect(Array.from(out)).toEqual(Array.from(input));
  });

  it('entrada vazia dá saída vazia e taxa inválida lança erro', () => {
    expect(wsolaStretch(new Float32Array(0), SAMPLE_RATE, 2).length).toBe(0);
    expect(() => wsolaStretch(sine(440, 0.1), SAMPLE_RATE, 0)).toThrow(RangeError);
  });
});

