// Testes da trajetória: acumulação, suavização, compensação e zoom mínimo.
import { describe, expect, it } from 'vitest';
import { accumulate, compensation, cropScaleFor, smooth } from '@/engine/stabilize/trajectory';

describe('accumulate', () => {
  it('soma os deslocamentos em sequência', () => {
    expect(
      accumulate([
        { dx: 1, dy: 2 },
        { dx: 3, dy: 4 },
      ]),
    ).toEqual([
      { x: 1, y: 2 },
      { x: 4, y: 6 },
    ]);
  });

  it('devolve lista vazia para entrada vazia', () => {
    expect(accumulate([])).toEqual([]);
  });
});

describe('smooth', () => {
  it('com raio zero devolve os mesmos pontos', () => {
    const points = [
      { x: 1, y: 1 },
      { x: 5, y: 3 },
    ];
    expect(smooth(points, 0)).toEqual(points);
  });

  it('suaviza um salto isolado pela média da janela', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 9, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
    const out = smooth(points, 1);
    expect(out[2]?.x).toBeCloseTo(3, 9);
    expect(out[0]?.x).toBeCloseTo(0, 9);
  });
});

describe('compensation', () => {
  it('é o suavizado menos o bruto', () => {
    const raw = [
      { x: 0, y: 0 },
      { x: 10, y: 4 },
    ];
    const smoothed = [
      { x: 2, y: 1 },
      { x: 8, y: 4 },
    ];
    expect(compensation(raw, smoothed)).toEqual([
      { dx: 2, dy: 1 },
      { dx: -2, dy: 0 },
    ]);
  });
});

describe('cropScaleFor', () => {
  it('fica em 1 sem compensação', () => {
    expect(cropScaleFor([{ dx: 0, dy: 0 }], 1000, 500)).toBe(1);
  });

  it('cresce com o maior deslocamento relativo ao tamanho', () => {
    expect(cropScaleFor([{ dx: 50, dy: 0 }], 1000, 500)).toBeCloseTo(1.1, 9);
    expect(cropScaleFor([{ dx: 0, dy: -25 }], 1000, 500)).toBeCloseTo(1.1, 9);
  });

  it('limita a 1.25', () => {
    expect(cropScaleFor([{ dx: 900, dy: 0 }], 1000, 500)).toBe(1.25);
  });
});
