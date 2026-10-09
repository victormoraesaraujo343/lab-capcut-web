// Testes puros da composição: tempos do clipe, camadas por trilha e áudio ativo.
import { describe, expect, it } from 'vitest';
import {
  activeAudioClips,
  clipLocalTime,
  clipMediaTime,
  resolveLayers,
} from '@/engine/render/composition';
import {
  defaultAudioFx,
  defaultSpeed,
  defaultTransform,
  type Asset,
  type Clip,
  type Project,
  type Track,
  type TrackKind,
} from '@/types';

/** Cria um clipe de teste de 1000 ms começando em 0, com os campos dados. */
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

/** Cria um asset de teste; por padrão, vídeo 1920x1080. */
function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'a1',
    kind: 'video',
    name: 'video.mp4',
    mimeType: 'video/mp4',
    opfsPath: 'media/a1',
    sizeBytes: 1,
    thumbnails: [],
    createdAt: 0,
    width: 1920,
    height: 1080,
    durationMs: 10000,
    ...overrides,
  };
}

/** Cria uma trilha de teste. */
function makeTrack(id: string, kind: TrackKind, clips: Clip[], overrides: Partial<Track> = {}): Track {
  return { id, kind, name: id, clips, muted: false, locked: false, hidden: false, ...overrides };
}

/** Cria um projeto de teste 1080x1920 com as trilhas e assets dados. */
function makeProject(tracks: Track[], assets: Asset[]): Project {
  return {
    id: 'p1',
    name: 'Teste',
    width: 1080,
    height: 1920,
    fps: 30,
    aspectRatio: '9:16',
    durationMs: 0,
    tracks,
    assets,
    folders: [],
    markers: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('clipLocalTime', () => {
  it('devolve o instante local dentro do clipe e null fora dele', () => {
    const clip = makeClip({ startMs: 500, durationMs: 1000 });
    expect(clipLocalTime(clip, 500)).toBe(0);
    expect(clipLocalTime(clip, 1200)).toBe(700);
    expect(clipLocalTime(clip, 1500)).toBeNull();
    expect(clipLocalTime(clip, 499)).toBeNull();
  });
});

describe('clipMediaTime', () => {
  it('aplica o corte inicial em velocidade normal', () => {
    expect(clipMediaTime(makeClip({ trimInMs: 1000 }), 200)).toBe(1200);
  });

  it('multiplica pela velocidade constante', () => {
    const clip = makeClip({ trimInMs: 0, speed: { ...defaultSpeed(), value: 2 } });
    expect(clipMediaTime(clip, 500)).toBe(1000);
  });

  it('inverte o clipe quando reversed', () => {
    expect(clipMediaTime(makeClip({ reversed: true }), 0)).toBe(1000);
    expect(clipMediaTime(makeClip({ reversed: true }), 400)).toBe(600);
    expect(clipMediaTime(makeClip({ reversed: true, trimInMs: 200 }), 1000)).toBe(200);
  });

  it('devolve o quadro congelado quando há freeze frame', () => {
    expect(clipMediaTime(makeClip({ freezeFrameMs: 750 }), 0)).toBe(750);
    expect(clipMediaTime(makeClip({ freezeFrameMs: 750 }), 900)).toBe(750);
  });
});

describe('resolveLayers', () => {
  it('a trilha de cima (índice 0) tem zIndex maior e desenha por último', () => {
    const top = makeTrack('top', 'video', [makeClip({ id: 'top-clip', trackId: 'top' })]);
    const bottom = makeTrack('bottom', 'video', [makeClip({ id: 'bottom-clip', trackId: 'bottom' })]);
    const layers = resolveLayers(makeProject([top, bottom], [makeAsset()]), 500);
    expect(layers.map((l) => l.clipId)).toEqual(['bottom-clip', 'top-clip']);
    expect(layers[0]?.zIndex).toBe(0);
    expect(layers[1]?.zIndex).toBe(1);
  });

  it('deixa de fora trilhas ocultas, áudio e clipes fora do instante', () => {
    const hidden = makeTrack('h', 'video', [makeClip({ id: 'hidden-clip' })], { hidden: true });
    const audio = makeTrack('au', 'audio', [makeClip({ id: 'audio-clip', assetId: 'a2' })]);
    const visible = makeTrack('v', 'video', [
      makeClip({ id: 'late', startMs: 2000 }),
      makeClip({ id: 'now', startMs: 0 }),
    ]);
    const assets = [makeAsset(), makeAsset({ id: 'a2', kind: 'audio' })];
    const layers = resolveLayers(makeProject([hidden, audio, visible], assets), 500);
    expect(layers.map((l) => l.clipId)).toEqual(['now']);
  });

  it('inclui clipe de imagem e de texto, e preenche tempos e tamanhos', () => {
    const image = makeAsset({ id: 'img', kind: 'image', width: undefined, height: undefined });
    const textClip = makeClip({
      id: 'txt',
      assetId: undefined,
      trackId: 'tx',
      text: {
        content: 'oi',
        style: {
          fontFamily: 'Inter',
          fontSize: 40,
          color: '#fff',
          bold: false,
          italic: false,
          underline: false,
          align: 'center',
          letterSpacing: 0,
          lineHeight: 1,
          strokeColor: '#000',
          strokeWidth: 0,
          shadowColor: '#000',
          shadowBlur: 0,
          shadowOffsetX: 0,
          shadowOffsetY: 0,
          backgroundColor: '#000',
          backgroundOpacity: 0,
          opacity: 1,
        },
      },
    });
    const imageClip = makeClip({ id: 'pic', assetId: 'img', trackId: 'v', startMs: 0 });
    const project = makeProject(
      [makeTrack('tx', 'text', [textClip]), makeTrack('v', 'video', [imageClip])],
      [image],
    );
    const layers = resolveLayers(project, 100);
    const pic = layers.find((l) => l.clipId === 'pic');
    const txt = layers.find((l) => l.clipId === 'txt');
    expect(pic?.kind).toBe('image');
    expect(pic?.sourceWidth).toBe(1080);
    expect(pic?.sourceHeight).toBe(1920);
    expect(pic?.localTimeMs).toBe(100);
    expect(txt?.kind).toBe('text');
  });

  it('aplica o keyframe de opacidade no tempo local', () => {
    const clip = makeClip({
      keyframes: {
        opacity: [
          { timeMs: 0, value: 0, easing: 'linear' },
          { timeMs: 1000, value: 1, easing: 'linear' },
        ],
      },
    });
    const layers = resolveLayers(makeProject([makeTrack('v', 'video', [clip])], [makeAsset()]), 500);
    expect(layers[0]?.transform.opacity).toBeCloseTo(0.5);
  });
});

describe('activeAudioClips', () => {
  it('inclui áudio e vídeo de trilhas não mutadas, com tempo de mídia', () => {
    const audioAsset = makeAsset({ id: 'aud', kind: 'audio' });
    const imageAsset = makeAsset({ id: 'img', kind: 'image' });
    const audioClip = makeClip({ id: 'sound', assetId: 'aud', trimInMs: 300 });
    const videoClip = makeClip({ id: 'film', assetId: 'a1' });
    const imageClip = makeClip({ id: 'pic', assetId: 'img' });
    const project = makeProject(
      [
        makeTrack('au', 'audio', [audioClip]),
        makeTrack('v', 'video', [videoClip, imageClip]),
      ],
      [audioAsset, imageAsset, makeAsset()],
    );
    const active = activeAudioClips(project, 200);
    expect(active.map((a) => a.clip.id)).toEqual(['sound', 'film']);
    expect(active[0]?.mediaTimeMs).toBe(500);
    expect(active[1]?.mediaTimeMs).toBe(200);
  });

  it('ignora trilhas mutadas e clipes fora do instante', () => {
    const muted = makeTrack('m', 'audio', [makeClip({ id: 'quiet' })], { muted: true });
    const later = makeTrack('l', 'video', [makeClip({ id: 'later', startMs: 5000 })]);
    const project = makeProject([muted, later], [makeAsset()]);
    expect(activeAudioClips(project, 100)).toEqual([]);
  });
});

describe('playbackRate da camada', () => {
  it('usa a velocidade do clipe', () => {
    const clip = makeClip({ speed: { ...defaultSpeed(), value: 2 } });
    const layers = resolveLayers(makeProject([makeTrack('t1', 'video', [clip])], [makeAsset()]), 100);
    expect(layers[0]?.playbackRate).toBe(2);
  });

  it('freeze frame fica parado (taxa 0)', () => {
    const clip = makeClip({ freezeFrameMs: 500 });
    const layers = resolveLayers(makeProject([makeTrack('t1', 'video', [clip])], [makeAsset()]), 100);
    expect(layers[0]?.playbackRate).toBe(0);
  });

  it('clipe invertido mantém a velocidade do clipe', () => {
    const clip = makeClip({ reversed: true, speed: { ...defaultSpeed(), value: 1.5 } });
    const layers = resolveLayers(makeProject([makeTrack('t1', 'video', [clip])], [makeAsset()]), 100);
    expect(layers[0]?.playbackRate).toBe(1.5);
  });
});
