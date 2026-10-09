import { describe, expect, it } from 'vitest';
import { getStretchedBuffer, roundStretchRate } from '../src/engine/audio/stretchedBufferCache';
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

/** Canal gravado por um AudioBuffer falso. */
interface FakeBuffer {
  numberOfChannels: number;
  sampleRate: number;
  getChannelData: (channel: number) => Float32Array;
}

/** Contexto falso que só cria buffers e conta quantos foram criados. */
class FakeStretchContext {
  created: { channels: number; length: number; data: Float32Array[] }[] = [];

  createBuffer(channels: number, length: number): { channels: number; length: number; copyToChannel: (d: Float32Array, c: number) => void } {
    const entry = { channels, length, data: [] as Float32Array[] };
    this.created.push(entry);
    return {
      channels,
      length,
      copyToChannel: (data: Float32Array, channel: number) => {
        entry.data[channel] = data;
      },
    };
  }
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

describe('getStretchedBuffer', () => {
  it('arredonda a taxa a 0,01 para a chave do cache', () => {
    expect(roundStretchRate(2.004)).toBe(2);
    expect(roundStretchRate(2.006)).toBe(2.01);
  });

  it('cria o buffer esticado por canal e reutiliza o mesmo para taxas que arredondam igual', () => {
    const ctx = new FakeStretchContext();
    const source: FakeBuffer = {
      numberOfChannels: 2,
      sampleRate: SAMPLE_RATE,
      getChannelData: () => sine(440, 0.5),
    };
    const buffer = source as unknown as AudioBuffer;
    const context = ctx as unknown as BaseAudioContext;

    const first = getStretchedBuffer(context, buffer, 2.001);
    const second = getStretchedBuffer(context, buffer, 2.004);
    expect(second).toBe(first);
    expect(ctx.created).toHaveLength(1);
    const entry = ctx.created[0];
    expect(entry?.channels).toBe(2);
    expect(entry?.length).toBe(Math.round((SAMPLE_RATE * 0.5) / 2));
    expect(entry?.data).toHaveLength(2);

    getStretchedBuffer(context, buffer, 0.5);
    expect(ctx.created).toHaveLength(2);
  });
});
