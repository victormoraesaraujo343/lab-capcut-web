import { describe, expect, it } from 'vitest';
import { activeTransition, incomingLocalMs, outgoingLocalMs, transitionSpan } from '@/engine/render/transitionWindow';
import { defaultAudioFx, defaultSpeed, defaultTransform, type Clip, type Track, type Transition } from '@/types';

/** Cria um clipe de teste na trilha com início e duração dados. */
function makeClip(id: string, startMs: number, durationMs: number, transitionOut?: Transition): Clip {
  return {
    id,
    trackId: 'v1',
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
    transitionOut,
    audio: defaultAudioFx(),
    reversed: false,
  };
}

/** Cria uma trilha de vídeo com os clipes dados. */
function makeTrack(clips: Clip[]): Track {
  return { id: 'v1', kind: 'video', name: 'Vídeo', clips, muted: false, locked: false, hidden: false };
}

/** Transição de teste com a duração dada. */
function transition(durationMs: number): Transition {
  return { type: 'dissolve', durationMs, params: {} };
}

describe('transitionWindow', () => {
  it('centra a janela no corte entre dois clipes encostados', () => {
    const a = makeClip('a', 0, 1000, transition(500));
    const b = makeClip('b', 1000, 1000);
    const span = transitionSpan(a, b, transition(500));
    expect(span).toEqual({ startMs: 750, endMs: 1250, cutMs: 1000, durationMs: 500 });
  });

  it('no meio da janela o progresso é 0.5 e o clipe que sai é o de transitionOut', () => {
    const track = makeTrack([makeClip('a', 0, 1000, transition(500)), makeClip('b', 1000, 1000)]);
    const active = activeTransition(track, 1000);
    expect(active?.progress).toBe(0.5);
    expect(active?.outgoing.id).toBe('a');
    expect(active?.incoming.id).toBe('b');
    expect(active?.cutMs).toBe(1000);
  });

  it('o progresso vai de 0 no início da janela até perto de 1 no fim', () => {
    const track = makeTrack([makeClip('a', 0, 1000, transition(500)), makeClip('b', 1000, 1000)]);
    expect(activeTransition(track, 750)?.progress).toBe(0);
    expect(activeTransition(track, 1249.9)?.progress).toBeCloseTo(0.9998, 3);
  });

  it('fora da janela não há transição ativa', () => {
    const track = makeTrack([makeClip('a', 0, 1000, transition(500)), makeClip('b', 1000, 1000)]);
    expect(activeTransition(track, 749)).toBeNull();
    expect(activeTransition(track, 1250)).toBeNull();
  });

  it('clipes não encostados não formam transição', () => {
    const track = makeTrack([makeClip('a', 0, 1000, transition(500)), makeClip('b', 1100, 1000)]);
    expect(transitionSpan(track.clips[0] as Clip, track.clips[1] as Clip, transition(500))).toBeNull();
    expect(activeTransition(track, 1000)).toBeNull();
  });

  it('sem transitionOut no clipe que sai não há transição', () => {
    const track = makeTrack([makeClip('a', 0, 1000), makeClip('b', 1000, 1000)]);
    expect(activeTransition(track, 1000)).toBeNull();
  });

  it('a duração é limitada pela metade do clipe mais curto', () => {
    const a = makeClip('a', 0, 1000, transition(500));
    const b = makeClip('b', 1000, 100);
    const span = transitionSpan(a, b, transition(500));
    expect(span?.durationMs).toBe(50);
    expect(span?.startMs).toBe(975);
    expect(span?.endMs).toBe(1025);
    const track = makeTrack([a, b]);
    expect(activeTransition(track, 980)?.progress).toBeCloseTo(0.1, 5);
  });

  it('tempos locais podem passar da duração do clipe que sai e ficar negativos no que entra', () => {
    const a = makeClip('a', 0, 1000, transition(500));
    const b = makeClip('b', 1000, 1000);
    expect(outgoingLocalMs(a, 1100)).toBe(1100);
    expect(incomingLocalMs(b, 1100)).toBe(100);
    expect(incomingLocalMs(b, 740)).toBe(-260);
  });
});
