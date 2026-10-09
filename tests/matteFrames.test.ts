// Testes das funções puras da máscara: taxa, instantes a segmentar, tamanho e conversão para RGBA.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MATTE_SOURCE_FPS,
  MATTE_MAX_FPS,
  effectiveMatteFps,
  framesPlan,
  matteFrameTimeUs,
  matteSize,
  maskToRgba,
} from '@/engine/matte/matteFrames';

describe('effectiveMatteFps', () => {
  it('limita a taxa do asset ao máximo da máscara', () => {
    expect(effectiveMatteFps(60)).toBe(MATTE_MAX_FPS);
    expect(effectiveMatteFps(30)).toBe(MATTE_MAX_FPS);
  });

  it('mantém taxas baixas e usa o padrão quando a taxa é ausente ou inválida', () => {
    expect(effectiveMatteFps(10)).toBe(10);
    expect(effectiveMatteFps(undefined)).toBe(MATTE_MAX_FPS);
    expect(effectiveMatteFps(0)).toBe(MATTE_MAX_FPS);
    expect(effectiveMatteFps(Number.NaN)).toBe(MATTE_MAX_FPS);
    expect(DEFAULT_MATTE_SOURCE_FPS).toBe(30);
  });
});

describe('framesPlan', () => {
  it('espaça os instantes pela taxa efetiva a partir do início do trecho', () => {
    expect(framesPlan(1000, 2000, 30)).toEqual([1000, 1067, 1133, 1200, 1267, 1333, 1400, 1467, 1533, 1600, 1667, 1733, 1800, 1867, 1933]);
  });

  it('segmenta no máximo 15 quadros por segundo mesmo com vídeo de 60 fps', () => {
    const plan = framesPlan(0, 2000, 60);
    expect(plan).toHaveLength(30);
    expect(plan[1]).toBe(67);
  });

  it('respeita uma taxa menor que o máximo', () => {
    expect(framesPlan(0, 1000, 10)).toEqual([0, 100, 200, 300, 400, 500, 600, 700, 800, 900]);
  });

  it('devolve lista vazia para trecho vazio ou invertido', () => {
    expect(framesPlan(500, 500, 30)).toEqual([]);
    expect(framesPlan(900, 100, 30)).toEqual([]);
  });

  it('inclui um quadro para trecho curto, como um quadro congelado', () => {
    expect(framesPlan(250, 251, 30)).toEqual([250]);
  });
});

describe('matteFrameTimeUs', () => {
  it('converte o índice do quadro em microssegundos pela taxa', () => {
    expect(matteFrameTimeUs(0, 15)).toBe(0);
    expect(matteFrameTimeUs(1, 15)).toBe(66_667);
    expect(matteFrameTimeUs(15, 15)).toBe(1_000_000);
  });
});

describe('matteSize', () => {
  it('reduz o lado maior para 512 mantendo a proporção, com lados pares', () => {
    expect(matteSize(1920, 1080)).toEqual({ width: 512, height: 288 });
    expect(matteSize(1080, 1920)).toEqual({ width: 288, height: 512 });
  });

  it('não amplia quadros menores que o limite e arredonda para par', () => {
    expect(matteSize(301, 201)).toEqual({ width: 302, height: 202 });
    expect(matteSize(640, 480)).toEqual({ width: 512, height: 384 });
  });

  it('rejeita tamanho inválido', () => {
    expect(() => matteSize(0, 480)).toThrow(RangeError);
    expect(() => matteSize(640, Number.NaN)).toThrow(RangeError);
  });
});

describe('maskToRgba', () => {
  it('replica a máscara 0..255 nos canais RGB com alfa opaco', () => {
    const rgba = maskToRgba(new Uint8Array([0, 128, 255, 40]), 2, 2);
    expect(Array.from(rgba)).toEqual([
      0, 0, 0, 255,
      128, 128, 128, 255,
      255, 255, 255, 255,
      40, 40, 40, 255,
    ]);
  });

  it('converte máscara Float32 de 0..1 para 0..255', () => {
    const rgba = maskToRgba(new Float32Array([0, 0.5, 1]), 3, 1);
    expect(rgba[0]).toBe(0);
    expect(rgba[4]).toBe(128);
    expect(rgba[8]).toBe(255);
    expect(rgba[11]).toBe(255);
  });

  it('recusa máscara com tamanho diferente do quadro', () => {
    expect(() => maskToRgba(new Uint8Array(3), 2, 2)).toThrow(RangeError);
  });
});
