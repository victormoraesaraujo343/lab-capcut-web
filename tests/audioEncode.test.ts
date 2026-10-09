import { describe, expect, it } from 'vitest';
import { planarChunk } from '../src/engine/export/audioEncode';

describe('planarChunk', () => {
  it('junta L e depois R, no formato planar', () => {
    const left = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const right = new Float32Array([-0.1, -0.2, -0.3, -0.4]);
    const out = planarChunk([left, right], 1, 2);
    expect(Array.from(out)).toEqual([
      expect.closeTo(0.2, 5),
      expect.closeTo(0.3, 5),
      expect.closeTo(-0.2, 5),
      expect.closeTo(-0.3, 5),
    ]);
    expect(out.length).toBe(4);
  });

  it('duplica o canal único nos dois lados quando o áudio é mono', () => {
    const mono = new Float32Array([0.5, 0.6, 0.7]);
    const out = planarChunk([mono], 0, 3);
    expect(Array.from(out)).toEqual([
      expect.closeTo(0.5, 5),
      expect.closeTo(0.6, 5),
      expect.closeTo(0.7, 5),
      expect.closeTo(0.5, 5),
      expect.closeTo(0.6, 5),
      expect.closeTo(0.7, 5),
    ]);
  });

  it('completa com silêncio quando o bloco passa do fim do áudio', () => {
    const left = new Float32Array([1, 2, 3]);
    const right = new Float32Array([4, 5, 6]);
    const out = planarChunk([left, right], 2, 3);
    expect(Array.from(out)).toEqual([3, 0, 0, 6, 0, 0]);
  });

  it('devolve silêncio quando não há canais', () => {
    const out = planarChunk([], 0, 2);
    expect(Array.from(out)).toEqual([0, 0, 0, 0]);
  });
});
