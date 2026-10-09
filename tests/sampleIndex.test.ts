import { describe, expect, it } from 'vitest';
import {
  canContinueDecode,
  clampSampleIndex,
  findEdgeIndexes,
  findSampleAtTime,
  findSyncBefore,
} from '../src/engine/decode/sampleIndex';
import type { SampleInfo } from '../src/engine/decode/sampleIndex';

const FRAME_US = 40_000;

/** Monta amostras com B-frames: a ordem de decodificação é I0 P3 B1 B2 P6 B4 B5, com cts fora de ordem. */
function buildGop(): SampleInfo[] {
  const order: Array<{ frame: number; sync: boolean }> = [
    { frame: 0, sync: true },
    { frame: 3, sync: false },
    { frame: 1, sync: false },
    { frame: 2, sync: false },
    { frame: 6, sync: false },
    { frame: 4, sync: false },
    { frame: 5, sync: false },
  ];
  return order.map((entry, index) => ({
    index,
    ctsUs: entry.frame * FRAME_US,
    durationUs: FRAME_US,
    isSync: entry.sync,
    offset: index * 100,
    size: 100,
  }));
}

describe('findSampleAtTime', () => {
  it('encontra a amostra que contém o tempo mesmo com B-frames fora de ordem', () => {
    const samples = buildGop();
    const decodeIndexOfFrame = (frame: number): number => samples.find((s) => s.ctsUs === frame * FRAME_US)?.index ?? -1;
    expect(findSampleAtTime(samples, 1 * FRAME_US)).toBe(decodeIndexOfFrame(1));
    expect(findSampleAtTime(samples, 2 * FRAME_US + 10)).toBe(decodeIndexOfFrame(2));
    expect(findSampleAtTime(samples, 5 * FRAME_US + 39_999)).toBe(decodeIndexOfFrame(5));
    expect(findSampleAtTime(samples, 6 * FRAME_US)).toBe(decodeIndexOfFrame(6));
  });

  it('devolve -1 fora do intervalo das amostras', () => {
    const samples = buildGop();
    expect(findSampleAtTime(samples, -1)).toBe(-1);
    expect(findSampleAtTime(samples, 7 * FRAME_US)).toBe(-1);
  });

  it('usa o índice ordenado mesmo quando o array de entrada muda de conteúdo', () => {
    const samples = buildGop();
    expect(findSampleAtTime(samples, 3 * FRAME_US)).toBe(1);
    const shifted = samples.map((s) => ({ ...s, ctsUs: s.ctsUs + 1_000_000 }));
    expect(findSampleAtTime(shifted, 3 * FRAME_US)).toBe(-1);
    expect(findSampleAtTime(shifted, 3 * FRAME_US + 1_000_000)).toBe(1);
  });
});

describe('findSyncBefore', () => {
  it('devolve o último sync em ordem de decodificação até o índice', () => {
    const samples = buildGop();
    const withSecondSync = samples.map((s, i) => (i === 4 ? { ...s, isSync: true } : s));
    expect(findSyncBefore(withSecondSync, 3)).toBe(0);
    expect(findSyncBefore(withSecondSync, 4)).toBe(4);
    expect(findSyncBefore(withSecondSync, 6)).toBe(4);
  });

  it('devolve -1 quando não há sync até o índice', () => {
    const samples = buildGop().map((s) => ({ ...s, isSync: false }));
    expect(findSyncBefore(samples, 5)).toBe(-1);
  });
});

describe('findEdgeIndexes e clampSampleIndex', () => {
  it('acha a amostra de menor e de maior cts em ordem de decodificação', () => {
    const samples = buildGop();
    expect(findEdgeIndexes(samples)).toEqual({ first: 0, last: 4 });
  });

  it('prende o tempo ao início ou ao fim do vídeo', () => {
    const samples = buildGop();
    expect(clampSampleIndex(samples, -5)).toBe(0);
    expect(clampSampleIndex(samples, 99 * FRAME_US)).toBe(4);
    expect(clampSampleIndex([], 0)).toBe(-1);
  });
});

describe('canContinueDecode', () => {
  it('continua quando o alvo está à frente e dentro da janela', () => {
    const samples = buildGop();
    expect(canContinueDecode(samples, 2, 4, 3 * FRAME_US, 2_000_000)).toBe(true);
  });

  it('reinicia quando não há amostra pendente, o alvo já passou ou está longe demais', () => {
    const samples = buildGop();
    expect(canContinueDecode(samples, 0, 4, 0, 2_000_000)).toBe(false);
    expect(canContinueDecode(samples, 5, 4, 0, 2_000_000)).toBe(false);
    expect(canContinueDecode(samples, 2, 4, 0, FRAME_US)).toBe(false);
  });
});
