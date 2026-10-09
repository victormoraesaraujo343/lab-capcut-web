import { describe, expect, it } from 'vitest';
import { buildForwardAudioProject, buildReverseProject } from '@/engine/jobs/reverseProject';
import { createProject } from '@/engine/project/createProject';
import { defaultAudioFx, defaultSpeed, defaultTransform, type Asset, type Clip, type Project } from '@/types';

/** Asset de vídeo de teste. */
function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'a1',
    kind: 'video',
    name: 'praia.mp4',
    mimeType: 'video/mp4',
    opfsPath: 'media/a1.mp4',
    sizeBytes: 1000,
    durationMs: 10000,
    width: 1920,
    height: 1080,
    fps: 25,
    thumbnails: [],
    createdAt: 0,
    ...overrides,
  };
}

/** Clipe de teste: 4 s na timeline, começando em 2 s, com recorte de 1 s na mídia. */
function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'c1',
    assetId: 'a1',
    trackId: 'v1',
    startMs: 2000,
    durationMs: 4000,
    trimInMs: 1000,
    trimOutMs: 5000,
    transform: { ...defaultTransform(), x: 40 },
    speed: defaultSpeed(),
    volume: 0.5,
    keyframes: {},
    filters: [],
    effects: [{ id: 'e1', type: 'blur', params: {} }],
    audio: defaultAudioFx(),
    reversed: false,
    ...overrides,
  };
}

/** Projeto de teste com um asset de vídeo. */
function makeProject(): Project {
  return { ...createProject('Teste'), width: 1080, height: 1920, fps: 30 };
}

describe('buildReverseProject', () => {
  it('monta um clipe invertido com o mesmo trecho de mídia', () => {
    const project = makeProject();
    const temp = buildReverseProject(project, makeClip(), makeAsset());
    const clip = temp.tracks[0]?.clips[0];
    expect(clip?.assetId).toBe('a1');
    expect(clip?.reversed).toBe(true);
    expect(clip?.trimInMs).toBe(1000);
    expect(clip?.durationMs).toBe(4000);
    expect(temp.durationMs).toBe(4000);
  });

  it('usa só a mídia: sem efeitos, filtros, transformação, keyframes ou velocidade diferente de 1', () => {
    const temp = buildReverseProject(makeProject(), makeClip(), makeAsset());
    const clip = temp.tracks[0]?.clips[0];
    expect(clip?.effects).toEqual([]);
    expect(clip?.filters).toEqual([]);
    expect(clip?.transform).toEqual(defaultTransform());
    expect(clip?.keyframes).toEqual({});
    expect(clip?.speed.value).toBe(1);
    expect(clip?.volume).toBe(1);
  });

  it('o tamanho da mídia de origem vale a velocidade do clipe', () => {
    const clip = makeClip({ speed: { ...defaultSpeed(), value: 2 } });
    const temp = buildReverseProject(makeProject(), clip, makeAsset());
    expect(temp.durationMs).toBe(8000);
    expect(temp.tracks[0]?.clips[0]?.durationMs).toBe(8000);
  });

  it('usa tamanho e fps do asset e cai para os do projeto quando o asset não os informa', () => {
    const withInfo = buildReverseProject(makeProject(), makeClip(), makeAsset());
    expect([withInfo.width, withInfo.height, withInfo.fps]).toEqual([1920, 1080, 25]);
    const bare = makeAsset({ width: undefined, height: undefined, fps: undefined });
    const fallback = buildReverseProject(makeProject(), makeClip(), bare);
    expect([fallback.width, fallback.height, fallback.fps]).toEqual([1080, 1920, 30]);
  });

  it('leva só o asset do clipe e uma trilha de vídeo mutada (o áudio é mixado à parte)', () => {
    const temp = buildReverseProject(makeProject(), makeClip(), makeAsset());
    expect(temp.assets.map((a) => a.id)).toEqual(['a1']);
    expect(temp.tracks).toHaveLength(1);
    expect(temp.tracks[0]?.muted).toBe(true);
  });
});

describe('buildForwardAudioProject', () => {
  it('mantém o trecho no sentido normal e a trilha audível', () => {
    const temp = buildReverseProject(makeProject(), makeClip(), makeAsset());
    const forward = buildForwardAudioProject(temp);
    expect(forward.tracks[0]?.muted).toBe(false);
    expect(forward.tracks[0]?.clips[0]?.reversed).toBe(false);
    expect(forward.tracks[0]?.clips[0]?.durationMs).toBe(4000);
  });
});
