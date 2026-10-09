import { describe, expect, it } from 'vitest';
import { clipGainAt, computeSegments } from '../src/engine/audio/audioSchedule';
import { trimPassed } from '../src/engine/audio/audioNodes';
import {
  defaultAudioFx,
  defaultSpeed,
  defaultTransform,
  type Asset,
  type Clip,
  type Project,
  type Track,
} from '../src/types/project';

function makeAsset(id: string, kind: Asset['kind']): Asset {
  return {
    id,
    kind,
    name: `${id}.mp4`,
    mimeType: 'video/mp4',
    opfsPath: `media/${id}`,
    sizeBytes: 1000,
    thumbnails: [],
    createdAt: 0,
  };
}

function makeClip(overrides: Partial<Clip> & { id: string; trackId: string }): Clip {
  return {
    assetId: 'a1',
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
    audio: defaultAudioFx(),
    reversed: false,
    ...overrides,
  };
}

function makeTrack(overrides: Partial<Track> & { id: string; kind: Track['kind'] }): Track {
  return { name: overrides.id, clips: [], muted: false, locked: false, hidden: false, ...overrides };
}

function makeProject(tracks: Track[], assets: Asset[]): Project {
  return {
    id: 'p1',
    name: 'Teste',
    width: 1920,
    height: 1080,
    fps: 30,
    aspectRatio: '16:9',
    durationMs: 0,
    tracks,
    assets,
    folders: [],
    markers: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('computeSegments', () => {
  it('ajusta o offset de um clipe já em andamento considerando a velocidade', () => {
    const clip = makeClip({
      id: 'c1',
      trackId: 't1',
      startMs: 1000,
      durationMs: 2000,
      trimInMs: 500,
      speed: { ...defaultSpeed(), value: 2 },
    });
    const project = makeProject(
      [makeTrack({ id: 't1', kind: 'audio', clips: [clip] })],
      [makeAsset('a1', 'audio')],
    );
    const [segment] = computeSegments(project, 1500);
    expect(segment).toEqual({
      clipId: 'c1',
      assetId: 'a1',
      startAtTimelineMs: 1500,
      offsetInMediaMs: 1500,
      durationMs: 1500,
      playbackRate: 2,
      gain: 1,
    });
  });

  it('agenda um clipe futuro no próprio início, com offset do trim', () => {
    const clip = makeClip({ id: 'c2', trackId: 't1', startMs: 3000, durationMs: 800, trimInMs: 250 });
    const project = makeProject(
      [makeTrack({ id: 't1', kind: 'video', clips: [clip] })],
      [makeAsset('a1', 'video')],
    );
    const [segment] = computeSegments(project, 1000);
    expect(segment).toEqual({
      clipId: 'c2',
      assetId: 'a1',
      startAtTimelineMs: 3000,
      offsetInMediaMs: 250,
      durationMs: 800,
      playbackRate: 1,
      gain: 1,
    });
  });

  it('ignora clipes que já terminaram antes do instante', () => {
    const clip = makeClip({ id: 'c3', trackId: 't1', startMs: 0, durationMs: 1000 });
    const project = makeProject(
      [makeTrack({ id: 't1', kind: 'audio', clips: [clip] })],
      [makeAsset('a1', 'audio')],
    );
    expect(computeSegments(project, 1000)).toEqual([]);
  });

  it('deixa de fora trilhas mudas', () => {
    const clip = makeClip({ id: 'c4', trackId: 't1' });
    const project = makeProject(
      [makeTrack({ id: 't1', kind: 'audio', clips: [clip], muted: true })],
      [makeAsset('a1', 'audio')],
    );
    expect(computeSegments(project, 0)).toEqual([]);
  });

  it('deixa de fora clipes de imagem', () => {
    const clip = makeClip({ id: 'c5', trackId: 't1', assetId: 'img' });
    const project = makeProject(
      [makeTrack({ id: 't1', kind: 'video', clips: [clip] })],
      [makeAsset('img', 'image')],
    );
    expect(computeSegments(project, 0)).toEqual([]);
  });

  it('deixa de fora clipes reversed', () => {
    const clip = makeClip({ id: 'c6', trackId: 't1', reversed: true });
    const project = makeProject(
      [makeTrack({ id: 't1', kind: 'video', clips: [clip] })],
      [makeAsset('a1', 'video')],
    );
    expect(computeSegments(project, 0)).toEqual([]);
  });

  it('deixa de fora trilhas que não são de áudio nem de vídeo', () => {
    const clip = makeClip({ id: 'c7', trackId: 't1' });
    const project = makeProject(
      [makeTrack({ id: 't1', kind: 'text', clips: [clip] })],
      [makeAsset('a1', 'audio')],
    );
    expect(computeSegments(project, 0)).toEqual([]);
  });
});

describe('clipGainAt', () => {
  const base = makeClip({
    id: 'fade',
    trackId: 't1',
    durationMs: 1000,
    volume: 2,
    audio: { ...defaultAudioFx(), fadeInMs: 200, fadeOutMs: 400 },
  });

  it('sobe linearmente durante o fade in', () => {
    expect(clipGainAt(base, 0)).toBeCloseTo(0);
    expect(clipGainAt(base, 100)).toBeCloseTo(1);
    expect(clipGainAt(base, 200)).toBeCloseTo(2);
  });

  it('mantém o volume do clipe no meio', () => {
    expect(clipGainAt(base, 500)).toBeCloseTo(2);
  });

  it('desce linearmente durante o fade out até zero', () => {
    expect(clipGainAt(base, 600)).toBeCloseTo(2);
    expect(clipGainAt(base, 800)).toBeCloseTo(1);
    expect(clipGainAt(base, 1000)).toBeCloseTo(0);
  });
});

describe('computeSegments com curva de velocidade', () => {
  // Rampa de 1x a 3x num clipe de 1000 ms: a mídia avança 750 ms até o meio e 2000 ms no total.
  const ramp = { mode: 'curve' as const, value: 1, preservePitch: false, curve: [{ t: 0, speed: 1 }, { t: 1, speed: 3 }] };

  it('calcula o offset pela integral da curva e a duração do trecho inteiro', () => {
    const clip = makeClip({ id: 'k1', trackId: 't1', startMs: 0, durationMs: 1000, speed: ramp });
    const project = makeProject([makeTrack({ id: 't1', kind: 'audio', clips: [clip] })], [makeAsset('a1', 'audio')]);
    const [segment] = computeSegments(project, 0);
    expect(segment?.offsetInMediaMs).toBeCloseTo(0, 6);
    expect(segment?.durationMs).toBe(1000);
    expect(segment?.playbackRate).toBe(1);
  });

  it('a partir do meio do clipe, começa com o offset da integral até ali', () => {
    const clip = makeClip({ id: 'k2', trackId: 't1', startMs: 0, durationMs: 1000, speed: ramp });
    const project = makeProject([makeTrack({ id: 't1', kind: 'audio', clips: [clip] })], [makeAsset('a1', 'audio')]);
    const [segment] = computeSegments(project, 500);
    expect(segment?.offsetInMediaMs).toBeCloseTo(750, 6);
    expect(segment?.durationMs).toBe(500);
    expect(segment?.curve?.localStartMs).toBe(500);
  });

  it('ao cortar o começo de um trecho com curva, o offset segue a integral e não a taxa do início', () => {
    const clip = makeClip({ id: 'k3', trackId: 't1', startMs: 0, durationMs: 1000, speed: ramp });
    const project = makeProject([makeTrack({ id: 't1', kind: 'audio', clips: [clip] })], [makeAsset('a1', 'audio')]);
    const [segment] = computeSegments(project, 500);
    const trimmed = segment ? trimPassed(segment, 700) : null;
    // Integral de 0,5 a 0,7 de (1 + 2u), vezes 1000 ms: 440 ms a mais, a partir de 750.
    expect(trimmed?.offsetInMediaMs).toBeCloseTo(1190, 6);
    expect(trimmed?.durationMs).toBe(300);
    expect(trimmed?.curve?.localStartMs).toBe(700);
  });

  it('velocidade constante continua com o offset linear', () => {
    const clip = makeClip({
      id: 'k4',
      trackId: 't1',
      startMs: 0,
      durationMs: 1000,
      trimInMs: 100,
      speed: { mode: 'constant', value: 4, curve: [], preservePitch: true },
    });
    const project = makeProject([makeTrack({ id: 't1', kind: 'video', clips: [clip] })], [makeAsset('a1', 'video')]);
    const [segment] = computeSegments(project, 250);
    expect(segment?.offsetInMediaMs).toBe(100 + 250 * 4);
    expect(segment?.curve).toBeUndefined();
  });
});

describe('clipGainAt com keyframes de volume', () => {
  const keyed = makeClip({
    id: 'v1',
    trackId: 't1',
    durationMs: 1000,
    volume: 1,
    keyframes: {
      volume: [
        { timeMs: 0, value: 0.5, easing: 'linear' },
        { timeMs: 1000, value: 1.5, easing: 'linear' },
      ],
    },
  });

  it('clipe silenciado dá ganho zero mesmo com keyframes, e reativar volta ao animado', () => {
    const muted = { ...keyed, audio: { ...keyed.audio, muted: true } };
    expect(clipGainAt(muted, 0)).toBe(0);
    expect(clipGainAt(muted, 1000)).toBe(0);
    expect(clipGainAt({ ...muted, audio: { ...muted.audio, muted: false } }, 500)).toBeCloseTo(1, 9);
  });

  it('usa o valor interpolado dos keyframes no lugar do volume fixo', () => {
    expect(clipGainAt(keyed, 0)).toBeCloseTo(0.5, 9);
    expect(clipGainAt(keyed, 500)).toBeCloseTo(1, 9);
    expect(clipGainAt(keyed, 1000)).toBeCloseTo(1.5, 9);
  });

  it('multiplica o volume do keyframe pelo fade', () => {
    const faded = { ...keyed, audio: { ...defaultAudioFx(), fadeInMs: 200 } };
    expect(clipGainAt(faded, 100)).toBeCloseTo(0.6 * 0.5, 9);
  });
});

describe('computeSegments com áudio separado', () => {
  it('ignora o vídeo cujo áudio foi separado, mas toca o clipe de áudio criado', () => {
    const video = makeClip({ id: 'v', trackId: 'v1', audioDetached: true, groupId: 'g' });
    const audio = makeClip({ id: 'a', trackId: 'a1', groupId: 'g' });
    const project = makeProject(
      [makeTrack({ id: 'v1', kind: 'video', clips: [video] }), makeTrack({ id: 'a1', kind: 'audio', clips: [audio] })],
      [makeAsset('a1', 'video')],
    );

    const segments = computeSegments(project, 0);

    expect(segments.map((s) => s.clipId)).toEqual(['a']);
  });
});
