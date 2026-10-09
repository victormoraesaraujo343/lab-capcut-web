import { describe, expect, it } from 'vitest';
import { computePeaks } from '../src/engine/decode/peaks';

/** Compara listas de números com tolerância para precisão de Float32. */
function expectClose(actual: number[], expected: number[]): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, index) => {
    expect(actual[index]).toBeCloseTo(value, 5);
  });
}

describe('computePeaks', () => {
  it('normaliza pelo maior pico global', () => {
    const channel = new Float32Array([0.5, -0.25, 0.1, -1, 0.2, 0.4]);
    expectClose(computePeaks([channel], 3), [0.5, 1, 0.4]);
  });

  it('combina canais pegando o maior valor absoluto', () => {
    const left = new Float32Array([0.2, 0, 0, 0]);
    const right = new Float32Array([0, 0, -0.8, 0]);
    expectClose(computePeaks([left, right], 2), [0.25, 1]);
  });

  it('retorna zeros quando todas as amostras são zero', () => {
    const silence = new Float32Array(8);
    expect(computePeaks([silence], 4)).toEqual([0, 0, 0, 0]);
  });

  it('retorna lista vazia quando buckets é zero ou negativo', () => {
    const channel = new Float32Array([0.5, 1]);
    expect(computePeaks([channel], 0)).toEqual([]);
    expect(computePeaks([channel], -3)).toEqual([]);
  });

  it('limita o número de buckets ao número de amostras', () => {
    const channel = new Float32Array([0.5, 1]);
    expectClose(computePeaks([channel], 10), [0.5, 1]);
  });

  it('retorna lista vazia sem amostras', () => {
    expect(computePeaks([], 5)).toEqual([]);
    expect(computePeaks([new Float32Array(0)], 5)).toEqual([]);
  });
});
