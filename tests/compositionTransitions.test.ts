// Testes puros das transições na composição: uma camada no corte, com a que entra dentro dela.
import { describe, expect, it } from 'vitest';
import { applyTransitions } from '@/engine/render/compositionTransitions';
import { resolveLayers } from '@/engine/render/composition';
import { defaultAudioFx, defaultSpeed, defaultTransform, type Asset, type Clip, type Project, type Track } from '@/types';

/** Cria um clipe de vídeo de teste com os campos dados. */
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

/** Asset de vídeo de teste de 10 s. */
function makeAsset(id: string): Asset {
  return {
    id,
    kind: 'video',
    name: `${id}.mp4`,
    mimeType: 'video/mp4',
    opfsPath: `media/${id}`,
    sizeBytes: 1,
    thumbnails: [],
    createdAt: 0,
    width: 1920,
    height: 1080,
    durationMs: 10000,
  };
}

/** Projeto com uma trilha de vídeo e os clipes dados. */
function makeProject(clips: Clip[]): Project {
  const track: Track = { id: 't1', kind: 'video', name: 'V', clips, muted: false, locked: false, hidden: false };
  return {
    id: 'p1',
    name: 'Teste',
    width: 1080,
    height: 1920,
    fps: 30,
    aspectRatio: '9:16',
    durationMs: 2000,
    tracks: [track],
    assets: [makeAsset('a1'), makeAsset('a2')],
    folders: [],
    markers: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

/** Dois clipes encostados em 1000 ms, com fade de 400 ms saindo do primeiro. */
function fadeProject(): Project {
  const a = makeClip({
    id: 'A',
    assetId: 'a1',
    transitionOut: { type: 'fade', durationMs: 400, params: { softness: 0.2 } },
  });
  const b = makeClip({ id: 'B', assetId: 'a2', startMs: 1000 });
  return makeProject([a, b]);
}

describe('transições na composição', () => {
  it('no meio do corte há uma camada só, com a que sai e a que entra dentro dela', () => {
    const layers = resolveLayers(fadeProject(), 1000);
    expect(layers).toHaveLength(1);
    const only = layers[0];
    expect(only?.clipId).toBe('A');
    expect(only?.transition?.type).toBe('fade');
    expect(only?.transition?.progress).toBeCloseTo(0.5);
    expect(only?.transition?.params).toEqual({ softness: 0.2 });
    expect(only?.transition?.incoming.clipId).toBe('B');
    expect(only?.transition?.incoming.transition).toBeUndefined();
  });

  it('o tempo de mídia da camada que sai passa do fim do clipe e a que entra começa antes do início, presos ao asset', () => {
    const a = makeClip({ id: 'A', trimInMs: 9900, transitionOut: { type: 'fade', durationMs: 400, params: {} } });
    const b = makeClip({ id: 'B', assetId: 'a2', startMs: 1000, trimInMs: 0 });
    const layers = resolveLayers(makeProject([a, b]), 1100);
    const only = layers[0];
    expect(only?.transition?.incoming.localTimeMs).toBe(100);
    expect(only?.localTimeMs).toBe(1100);
    expect(only?.mediaTimeMs).toBe(10000);
    expect(only?.transition?.incoming.mediaTimeMs).toBe(100);
  });

  it('fora da janela de transição, as camadas são as normais', () => {
    const before = resolveLayers(fadeProject(), 500);
    expect(before.map((l) => l.clipId)).toEqual(['A']);
    expect(before[0]?.transition).toBeUndefined();
    const after = resolveLayers(fadeProject(), 1500);
    expect(after.map((l) => l.clipId)).toEqual(['B']);
    expect(after[0]?.transition).toBeUndefined();
  });

  it('applyTransitions sem transição ativa devolve as camadas ordenadas por zIndex', () => {
    const project = fadeProject();
    const layer = resolveLayers(project, 500)[0];
    if (!layer) throw new Error('camada esperada');
    expect(applyTransitions(project, 500, [layer])).toEqual([layer]);
  });
});
