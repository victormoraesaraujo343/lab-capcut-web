import { describe, expect, it } from 'vitest';
import { clipGainAt, computeSegments } from '../src/engine/audio/audioSchedule';
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
