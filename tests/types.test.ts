import { describe, expect, it } from 'vitest';
import {
  clipEndMs,
  computeProjectDuration,
  defaultTransform,
  type Clip,
  type Track,
  defaultAudioFx,
  defaultSpeed,
} from '../src/types';

function makeClip(id: string, startMs: number, durationMs: number): Clip {
  return {
    id,
    trackId: 't1',
    startMs,
    durationMs,
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
  };
}

function makeTrack(id: string, clips: Clip[]): Track {
  return { id, kind: 'video', name: id, clips, muted: false, locked: false, hidden: false };
}

describe('defaultTransform', () => {
  it('retorna valores neutros', () => {
    expect(defaultTransform()).toEqual({
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1,
      crop: { top: 0, right: 0, bottom: 0, left: 0 },
    });
  });

  it('retorna um objeto novo a cada chamada', () => {
    const a = defaultTransform();
    const b = defaultTransform();
    expect(a).not.toBe(b);
    expect(a.crop).not.toBe(b.crop);
  });
});

describe('clipEndMs', () => {
  it('soma início e duração', () => {
    expect(clipEndMs(makeClip('c', 1000, 2500))).toBe(3500);
  });
});

describe('computeProjectDuration', () => {
  it('retorna 0 para lista vazia de tracks', () => {
    expect(computeProjectDuration([])).toBe(0);
  });

  it('retorna 0 quando não há clipes', () => {
    expect(computeProjectDuration([makeTrack('t1', [])])).toBe(0);
  });

  it('retorna o maior fim de clipe entre dois tracks', () => {
    const tracks = [
      makeTrack('t1', [makeClip('a', 0, 4000), makeClip('b', 4000, 1000)]),
      makeTrack('t2', [makeClip('c', 500, 6000)]),
    ];
    expect(computeProjectDuration(tracks)).toBe(6500);
  });
});
