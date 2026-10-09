import { describe, expect, it } from 'vitest';
import { compareImages } from '../src/devtools/renderTests/compare';

/** Cria um buffer RGBA preenchido com a mesma cor em todos os pixels. */
function solid(width: number, height: number, rgba: [number, number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data.set(rgba, i);
  }
  return data;
}

describe('compareImages', () => {
  it('imagens iguais passam com diferença zero', () => {
    const a = solid(4, 4, [10, 20, 30, 255]);
    const result = compareImages(a, solid(4, 4, [10, 20, 30, 255]), 4, 4);
    expect(result).toEqual({ ok: true, badRatio: 0, maxDelta: 0 });
  });

  it('diferença dentro da tolerância não conta como pixel ruim', () => {
    const a = solid(4, 4, [100, 100, 100, 255]);
    const b = solid(4, 4, [108, 92, 100, 255]);
    const result = compareImages(a, b, 4, 4);
    expect(result.badRatio).toBe(0);
    expect(result.maxDelta).toBe(8);
    expect(result.ok).toBe(true);
  });

  it('diferença acima da tolerância marca o pixel e reprova quando passa do limite', () => {
    const a = solid(10, 10, [0, 0, 0, 255]);
    const b = solid(10, 10, [0, 0, 0, 255]);
    for (let p = 0; p < 10; p++) {
      b[p * 4] = 200;
    }
    const result = compareImages(a, b, 10, 10);
    expect(result.badRatio).toBeCloseTo(0.1);
    expect(result.maxDelta).toBe(200);
    expect(result.ok).toBe(false);
  });

  it('respeita tolerance e maxBadRatio informados', () => {
    const a = solid(10, 10, [0, 0, 0, 255]);
    const b = solid(10, 10, [0, 0, 0, 255]);
    for (let p = 0; p < 10; p++) {
      b[p * 4] = 200;
    }
    expect(compareImages(a, b, 10, 10, { maxBadRatio: 0.2 }).ok).toBe(true);
    expect(compareImages(a, b, 10, 10, { tolerance: 250 }).badRatio).toBe(0);
  });

  it('lança erro quando o tamanho do buffer não bate com width x height', () => {
    expect(() => compareImages(solid(2, 2, [0, 0, 0, 0]), solid(2, 2, [0, 0, 0, 0]), 3, 3)).toThrow('compare-size-mismatch');
  });
});
