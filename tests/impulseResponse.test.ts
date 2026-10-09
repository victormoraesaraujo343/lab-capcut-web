import { describe, expect, it } from 'vitest';
import { generateImpulse, impulseSamples } from '../src/engine/audio/impulseResponse';

/** Média do valor absoluto de um trecho da lista. */
function meanAbs(values: Float32Array, from: number, to: number): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += Math.abs(values[i] ?? 0);
  return sum / (to - from);
}

/** Buffer falso que guarda os canais copiados. */
function fakeBuffer(channels: number, length: number) {
  const data: Float32Array[] = [];
  return {
    channels,
    length,
    data,
    copyToChannel: (source: Float32Array, channel: number) => {
      data[channel] = source;
    },
  };
}

/** Contexto falso com a taxa de amostragem e a criação de buffers usadas pela resposta ao impulso. */
function fakeContext(sampleRate: number) {
  const created: ReturnType<typeof fakeBuffer>[] = [];
  return {
    sampleRate,
    created,
    createBuffer(channels: number, length: number) {
      const buffer = fakeBuffer(channels, length);
      created.push(buffer);
      return buffer;
    },
  };
}

describe('impulseSamples', () => {
  it('é determinística para o mesmo seed e muda com outro seed', () => {
    const a = impulseSamples(500, 6, 42);
    const b = impulseSamples(500, 6, 42);
    const c = impulseSamples(500, 6, 43);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });

  it('gera o tamanho pedido e amostras dentro de [-1, 1]', () => {
    const samples = impulseSamples(1000, 6, 7);
    expect(samples.length).toBe(1000);
    for (const value of samples) {
      expect(value).toBeGreaterThanOrEqual(-1);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('decai: o começo tem mais energia que o fim', () => {
    const samples = impulseSamples(10000, 6, 99);
    expect(meanAbs(samples, 0, 1000)).toBeGreaterThan(meanAbs(samples, 9000, 10000) * 5);
  });

  it('devolve lista vazia para tamanho zero', () => {
    expect(impulseSamples(0, 6, 1).length).toBe(0);
  });
});

describe('generateImpulse', () => {
  it('cria buffer estéreo com a duração pedida na taxa do contexto', () => {
    const ctx = fakeContext(1000);
    const buffer = generateImpulse(ctx as unknown as BaseAudioContext, 0.5, 6);
    const created = buffer as unknown as ReturnType<typeof fakeBuffer>;
    expect(created.channels).toBe(2);
    expect(created.length).toBe(500);
    expect(created.data[0]?.length).toBe(500);
    expect(created.data[1]?.length).toBe(500);
  });

  it('reaproveita o buffer para o mesmo contexto e parâmetros', () => {
    const ctx = fakeContext(1000);
    const first = generateImpulse(ctx as unknown as BaseAudioContext, 0.5, 6);
    const second = generateImpulse(ctx as unknown as BaseAudioContext, 0.5, 6);
    expect(second).toBe(first);
    expect(ctx.created).toHaveLength(1);
  });

  it('limita a duração a um intervalo seguro', () => {
    const ctx = fakeContext(100);
    const buffer = generateImpulse(ctx as unknown as BaseAudioContext, 500, 6) as unknown as ReturnType<typeof fakeBuffer>;
    expect(buffer.length).toBe(1000);
  });
});
