import { describe, expect, it } from 'vitest';
import { detectOnsets, estimateTempo } from '../src/engine/audio/beatDetect';

const SAMPLE_RATE = 44100;

/** Gera um sinal mono com um clique (tom de 1 kHz com decaimento rápido) em cada instante dado, em ms. */
function clicksAt(startsMs: number[], durationMs: number): Float32Array {
  const signal = new Float32Array(Math.round((durationMs / 1000) * SAMPLE_RATE));
  const clickLength = Math.round(0.03 * SAMPLE_RATE);
  for (const startMs of startsMs) {
    const offset = Math.round((startMs / 1000) * SAMPLE_RATE);
    for (let n = 0; n < clickLength && offset + n < signal.length; n++) {
      const t = n / SAMPLE_RATE;
      signal[offset + n] = 0.8 * Math.sin(2 * Math.PI * 1000 * t) * Math.exp(-t / 0.005);
    }
  }
  return signal;
}

/** Instantes de cliques a cada periodMs, começando em firstMs, até o limite exclusivo. */
function grid(firstMs: number, periodMs: number, untilMs: number): number[] {
  const starts: number[] = [];
  for (let ms = firstMs; ms < untilMs; ms += periodMs) starts.push(ms);
  return starts;
}

describe('detectOnsets', () => {
  it('encontra cliques a cada 500 ms nos instantes certos (±20 ms)', () => {
    const expected = grid(500, 500, 4000);
    const onsets = detectOnsets(clicksAt(expected, 4000), SAMPLE_RATE);
    expect(onsets).toHaveLength(expected.length);
    expected.forEach((ms, i) => {
      expect(Math.abs((onsets[i] ?? Infinity) - ms)).toBeLessThanOrEqual(20);
    });
  });

  it('devolve lista vazia para silêncio', () => {
    expect(detectOnsets(new Float32Array(SAMPLE_RATE * 2), SAMPLE_RATE)).toEqual([]);
  });

  it('devolve lista vazia para sinal menor que uma janela de análise', () => {
    expect(detectOnsets(new Float32Array(100), SAMPLE_RATE)).toEqual([]);
  });

  it('respeita o intervalo mínimo entre batidas', () => {
    const onsets = detectOnsets(clicksAt(grid(500, 100, 3000), 3000), SAMPLE_RATE, { minIntervalMs: 250 });
    expect(onsets.length).toBeGreaterThan(0);
    for (let i = 1; i < onsets.length; i++) {
      expect((onsets[i] ?? 0) - (onsets[i - 1] ?? 0)).toBeGreaterThanOrEqual(250);
    }
  });

  it('com sensibilidade máxima aceita pelo menos tantas batidas quanto com a mínima', () => {
    const signal = clicksAt(grid(500, 500, 4000), 4000);
    const low = detectOnsets(signal, SAMPLE_RATE, { sensitivity: 0 });
    const high = detectOnsets(signal, SAMPLE_RATE, { sensitivity: 1 });
    expect(high.length).toBeGreaterThanOrEqual(low.length);
  });
});

describe('estimateTempo', () => {
  it('estima cerca de 120 BPM para batidas a cada 500 ms', () => {
    const bpm = estimateTempo(grid(500, 500, 4000));
    expect(bpm).not.toBeNull();
    expect(Math.abs((bpm ?? 0) - 120)).toBeLessThan(3);
  });

  it('dobra tempos abaixo de 70 BPM para ficarem na faixa', () => {
    expect(estimateTempo([0, 1000, 2000, 3000])).toBe(120);
  });

  it('devolve null sem intervalos suficientes', () => {
    expect(estimateTempo([])).toBeNull();
    expect(estimateTempo([1000])).toBeNull();
  });
});
