// Testes da geometria pura dos clipes: posições, slots de miniatura, faixa visível e fatia da onda.
import { describe, expect, it } from 'vitest';
import {
  clipLeftPx,
  clipWidthPx,
  thumbnailIndexForTime,
  visibleClipRange,
  visibleThumbSlots,
  waveformSlice,
} from '@/features/timeline/clipGeometry';
import { defaultAudioFx, defaultSpeed, defaultTransform, type Asset, type Clip } from '@/types';

/** Cria um clipe de teste com os campos de tempo dados. */
function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'c1',
    assetId: 'a1',
    trackId: 't1',
    startMs: 0,
    durationMs: 1000,
    trimInMs: 0,
    trimOutMs: 0,
    transform: defaultTransform(),
    speed: defaultSpeed(),
    volume: 1,
    keyframes: {},
    filters: [],
    effects: [],
    reversed: false,
    audio: defaultAudioFx(),
    ...overrides,
  };
}

/** Cria um asset de vídeo de teste com as miniaturas e a duração dadas. */
function makeAsset(thumbnails: string[], durationMs?: number): Asset {
  return {
    id: 'a1',
    kind: 'video',
    name: 'video.mp4',
    mimeType: 'video/mp4',
    opfsPath: 'media/video.mp4',
    sizeBytes: 10,
    durationMs,
    thumbnails,
    createdAt: 0,
  };
}

describe('clipGeometry: posições em px', () => {
  it('converte início e largura do clipe pelo zoom', () => {
    const clip = makeClip({ startMs: 1000, durationMs: 2000 });
    expect(clipLeftPx(clip, 100)).toBe(100);
    expect(clipWidthPx(clip, 100)).toBe(200);
  });
});

describe('clipGeometry: índice de miniatura', () => {
  const asset = makeAsset(['t0', 't1', 't2', 't3'], 4000);

  it('escolhe a miniatura que cobre o instante', () => {
    expect(thumbnailIndexForTime(asset, 0)).toBe(0);
    expect(thumbnailIndexForTime(asset, 999)).toBe(0);
    expect(thumbnailIndexForTime(asset, 1000)).toBe(1);
    expect(thumbnailIndexForTime(asset, 3500)).toBe(3);
  });

  it('limita o índice ao intervalo válido', () => {
    expect(thumbnailIndexForTime(asset, -50)).toBe(0);
    expect(thumbnailIndexForTime(asset, 4000)).toBe(3);
    expect(thumbnailIndexForTime(asset, 99_999)).toBe(3);
  });

  it('usa a primeira miniatura quando não há duração (imagem)', () => {
    expect(thumbnailIndexForTime(makeAsset(['img']), 1234)).toBe(0);
  });
});

describe('clipGeometry: slots de miniatura', () => {
  it('cria um slot a cada largura dada, com o instante da mídia', () => {
    const clip = makeClip({ durationMs: 1000, trimInMs: 500, speed: { ...defaultSpeed(), value: 2 } });
    const slots = visibleThumbSlots(clip, 100, 50);
    expect(slots).toEqual([
      { leftPx: 0, mediaMs: 500 },
      { leftPx: 50, mediaMs: 1500 },
    ]);
  });

  it('devolve só os slots que tocam o trecho visível', () => {
    const clip = makeClip({ durationMs: 10_000 });
    const slots = visibleThumbSlots(clip, 100, 50, { fromPx: 240, toPx: 400 });
    expect(slots.map((s) => s.leftPx)).toEqual([200, 250, 300, 350]);
  });

  it('não devolve slots para clipe sem largura ou slot inválido', () => {
    expect(visibleThumbSlots(makeClip({ durationMs: 0 }), 100, 50)).toEqual([]);
    expect(visibleThumbSlots(makeClip(), 100, 0)).toEqual([]);
  });
});

describe('clipGeometry: metade direita de clipe dividido', () => {
  const asset = makeAsset(['t0', 't1', 't2', 't3'], 8000);
  const right = makeClip({ startMs: 3000, durationMs: 5000, trimInMs: 3000 });

  it('mostra slots visíveis com índices coerentes com a mídia', () => {
    const slots = visibleThumbSlots(right, 12, 106.67, { fromPx: 0, toPx: 60 });
    expect(slots).toEqual([{ leftPx: 0, mediaMs: 3000 }]);
    expect(thumbnailIndexForTime(asset, slots[0]?.mediaMs ?? -1)).toBe(1);
  });

  it('cobre a janela visível quando o clipe é rolado', () => {
    const slots = visibleThumbSlots(right, 12, 20, { fromPx: 30, toPx: 60 });
    expect(slots.map((s) => s.leftPx)).toEqual([20, 40]);
    expect(slots.map((s) => thumbnailIndexForTime(asset, s.mediaMs))).toEqual([2, 3]);
  });
});

describe('clipGeometry: faixa visível', () => {
  it('recorta o clipe pela área de rolagem', () => {
    expect(visibleClipRange(400, 100, 150, 200)).toEqual({ fromPx: 50, toPx: 250 });
  });

  it('fica vazia quando o clipe está fora da área', () => {
    expect(visibleClipRange(100, 0, 500, 200)).toEqual({ fromPx: 100, toPx: 100 });
  });
});

describe('clipGeometry: fatia da onda', () => {
  it('pega os picos que cobrem o intervalo da mídia', () => {
    expect(waveformSlice([1, 2, 3, 4], 4000, 1000, 3000)).toEqual([2, 3]);
  });

  it('devolve lista vazia sem picos, sem duração ou sem intervalo', () => {
    expect(waveformSlice([], 4000, 0, 1000)).toEqual([]);
    expect(waveformSlice([1], 0, 0, 1000)).toEqual([]);
    expect(waveformSlice([1, 2], 4000, 2000, 2000)).toEqual([]);
  });

  it('nunca passa do fim dos picos', () => {
    expect(waveformSlice([1, 2, 3, 4], 4000, 3500, 9000)).toEqual([4]);
  });
});
