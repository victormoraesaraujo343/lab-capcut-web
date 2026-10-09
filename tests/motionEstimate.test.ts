// Testes da estimativa de movimento: conversão para cinza e casamento de blocos com deslocamento conhecido.
import { describe, expect, it } from 'vitest';
import { estimateShift, toGray } from '@/engine/stabilize/motionEstimate';

/** Textura sintética determinística, definida em todo o plano. */
function pattern(x: number, y: number): number {
  return 128 + 50 * Math.sin(0.61 * x + 0.23 * y) + 40 * Math.cos(0.37 * x - 0.83 * y) + 30 * Math.sin(0.019 * x * y);
}

/** Quadro w x h da textura, deslocado: a cena andou (dx, dy), então curr(x, y) = prev(x - dx, y - dy). */
function frame(w: number, h: number, dx: number, dy: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[y * w + x] = pattern(x - dx, y - dy);
    }
  }
  return out;
}

describe('toGray', () => {
  it('converte RGBA em luminância ponderada', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
    const gray = toGray(rgba, 2, 1);
    expect(gray[0]).toBeCloseTo(0.299 * 255, 3);
    expect(gray[1]).toBeCloseTo(0.587 * 255, 3);
  });
});

describe('estimateShift', () => {
  it('acha o deslocamento (3, -2) com erro até meio pixel', () => {
    const w = 80;
    const h = 64;
    const prev = frame(w, h, 0, 0);
    const curr = frame(w, h, 3, -2);
    const shift = estimateShift(prev, curr, w, h, 6);
    expect(Math.abs(shift.dx - 3)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(shift.dy - -2)).toBeLessThanOrEqual(0.5);
  });

  it('devolve deslocamento quase nulo para quadros iguais', () => {
    const w = 80;
    const h = 64;
    const same = frame(w, h, 0, 0);
    const shift = estimateShift(same, same, w, h, 6);
    expect(Math.abs(shift.dx)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(shift.dy)).toBeLessThanOrEqual(0.5);
  });

  it('devolve zero quando a imagem é pequena demais para a margem', () => {
    const tiny = new Float32Array(10 * 10);
    expect(estimateShift(tiny, tiny, 10, 10, 12)).toEqual({ dx: 0, dy: 0 });
  });
});
