import { describe, expect, it } from 'vitest';
import type { Clip, Track } from '@/types';
import { defaultAudioFx, defaultSpeed, defaultTransform } from '@/types';
import {
  findClip,
  splitAt,
  splitClipAt,
  trimClipEnd,
  trimClipStart,
  trimToTime,
  updateClip,
} from '@/engine/timeline/clipOps';

/** Monta um clipe de teste na trilha 'v1'. */
function clip(id: string, startMs: number, durationMs: number, extra: Partial<Clip> = {}): Clip {
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
    reversed: false,
    audio: defaultAudioFx(),
    ...extra,
  };
}

/** Monta uma trilha de teste. */
function track(id: string, clips: Clip[], locked = false): Track {
  return { id, kind: 'video', name: id, clips, muted: false, locked, hidden: false };
}

describe('findClip', () => {
  it('encontra o clipe com trilha e índices', () => {
    const tracks = [track('v1', [clip('a', 0, 1000)]), track('v2', [clip('b', 0, 500), clip('c', 600, 500)])];
    const found = findClip(tracks, 'c');
    expect(found?.track.id).toBe('v2');
    expect(found?.trackIndex).toBe(1);
    expect(found?.clipIndex).toBe(1);
  });

  it('devolve null quando o clipe não existe', () => {
    expect(findClip([track('v1', [])], 'x')).toBeNull();
  });
});

describe('updateClip', () => {
  it('altera só a trilha do clipe e mantém as outras referências', () => {
    const v2 = track('v2', [clip('b', 0, 500)]);
    const tracks = [track('v1', [clip('a', 0, 1000)]), v2];
    const result = updateClip(tracks, 'a', (c) => ({ ...c, volume: 0.5 }));
    expect(result[0]?.clips[0]?.volume).toBe(0.5);
    expect(result[1]).toBe(v2);
    expect(tracks[0]?.clips[0]?.volume).toBe(1);
  });

  it('não muda trilha travada', () => {
    const tracks = [track('v1', [clip('a', 0, 1000)], true)];
    expect(updateClip(tracks, 'a', (c) => ({ ...c, volume: 0 }))).toBe(tracks);
  });
});

describe('splitClipAt', () => {
  it('com speed 2, ajusta trimOut da esquerda e trimIn da direita', () => {
    const tracks = [track('v1', [clip('a', 1000, 4000, { speed: { ...defaultSpeed(), value: 2 }, trimOutMs: 0 })])];
    const { tracks: out, rightId } = splitClipAt(tracks, 'a', 2000);
    const [left, right] = out[0]?.clips ?? [];
    expect(rightId).not.toBeNull();
    expect(left?.id).toBe('a');
    expect(left?.durationMs).toBe(1000);
    expect(left?.trimOutMs).toBe(6000);
    expect(right?.id).toBe(rightId);
    expect(right?.startMs).toBe(2000);
    expect(right?.durationMs).toBe(3000);
    expect(right?.trimInMs).toBe(2000);
    expect(right?.trimOutMs).toBe(0);
  });

  it('fora da faixa mínima é no-op com a mesma referência', () => {
    const tracks = [track('v1', [clip('a', 0, 1000)])];
    const result = splitClipAt(tracks, 'a', 50);
    expect(result.tracks).toBe(tracks);
    expect(result.rightId).toBeNull();
    expect(splitClipAt(tracks, 'a', 950).tracks).toBe(tracks);
  });

  it('divide keyframes entre as duas metades, deslocando a direita', () => {
    const kf = { x: [
      { timeMs: 500, value: 1, easing: 'linear' as const },
      { timeMs: 1500, value: 2, easing: 'linear' as const },
      { timeMs: 3000, value: 3, easing: 'linear' as const },
    ] };
    const tracks = [track('v1', [clip('a', 0, 4000, { keyframes: kf })])];
    const { tracks: out } = splitClipAt(tracks, 'a', 1000);
    const [left, right] = out[0]?.clips ?? [];
    expect(left?.keyframes).toEqual({ x: [{ timeMs: 500, value: 1, easing: 'linear' }] });
    expect(right?.keyframes).toEqual({
      x: [
        { timeMs: 500, value: 2, easing: 'linear' },
        { timeMs: 2000, value: 3, easing: 'linear' },
      ],
    });
  });

  it('transitionIn fica na esquerda e transitionOut vai para a direita', () => {
    const tIn = { type: 'fade', durationMs: 300, params: {} };
    const tOut = { type: 'wipe', durationMs: 300, params: {} };
    const tracks = [track('v1', [clip('a', 0, 4000, { transitionIn: tIn, transitionOut: tOut })])];
    const { tracks: out } = splitClipAt(tracks, 'a', 1000);
    const [left, right] = out[0]?.clips ?? [];
    expect(left?.transitionIn).toEqual(tIn);
    expect(left?.transitionOut).toBeUndefined();
    expect(right?.transitionIn).toBeUndefined();
    expect(right?.transitionOut).toEqual(tOut);
  });

  it('mantém groupId nas duas metades', () => {
    const tracks = [track('v1', [clip('a', 0, 4000, { groupId: 'g1' })])];
    const { tracks: out } = splitClipAt(tracks, 'a', 1000);
    expect(out[0]?.clips.every((c) => c.groupId === 'g1')).toBe(true);
  });

  it('não divide trilha travada', () => {
    const tracks = [track('v1', [clip('a', 0, 4000)], true)];
    expect(splitClipAt(tracks, 'a', 1000).tracks).toBe(tracks);
  });
});

describe('splitAt', () => {
  it('divide todos os clipes sob o instante quando não há lista', () => {
    const tracks = [track('v1', [clip('a', 0, 1000), clip('b', 1000, 2000)]), track('v2', [clip('c', 0, 3000)])];
    const out = splitAt(tracks, 1500);
    expect(out[0]?.clips.map((c) => c.durationMs)).toEqual([1000, 500, 1500]);
    expect(out[1]?.clips).toHaveLength(2);
  });

  it('divide só os clipes indicados e não toca trilhas travadas', () => {
    const tracks = [track('v1', [clip('a', 0, 4000)]), track('v2', [clip('c', 0, 4000)], true)];
    const out = splitAt(tracks, 2000, ['a', 'c']);
    expect(out[0]?.clips).toHaveLength(2);
    expect(out[1]).toBe(tracks[1]);
  });

  it('sem clipe sob o instante devolve a mesma referência', () => {
    const tracks = [track('v1', [clip('a', 0, 1000)])];
    expect(splitAt(tracks, 5000)).toBe(tracks);
  });
});

describe('trimClipStart', () => {
  it('não deixa o início passar do trimIn disponível', () => {
    const tracks = [track('v1', [clip('a', 1000, 2000, { trimInMs: 500 })])];
    const out = trimClipStart(tracks, 'a', 0, 10000);
    const c = out[0]?.clips[0];
    expect(c?.startMs).toBe(500);
    expect(c?.trimInMs).toBe(0);
    expect(c?.durationMs).toBe(2500);
  });

  it('não invade o clipe anterior', () => {
    const tracks = [track('v1', [clip('p', 0, 1000), clip('a', 1000, 2000, { trimInMs: 5000 })])];
    expect(trimClipStart(tracks, 'a', 0, 10000)).toBe(tracks);
    const out = trimClipStart(tracks, 'a', 500, 10000);
    expect(out[0]?.clips[1]?.startMs).toBe(1000);
  });

  it('sem duração de mídia (imagem) não tem limite de trimIn', () => {
    const tracks = [track('v1', [clip('a', 1000, 2000)])];
    const out = trimClipStart(tracks, 'a', 0);
    expect(out[0]?.clips[0]?.startMs).toBe(0);
    expect(out[0]?.clips[0]?.durationMs).toBe(3000);
  });

  it('desloca keyframes com o início e descarta os que saem do clipe', () => {
    const kf = {
      x: [
        { timeMs: 200, value: 1, easing: 'linear' as const },
        { timeMs: 800, value: 2, easing: 'linear' as const },
      ],
    };
    const tracks = [track('v1', [clip('a', 0, 2000, { keyframes: kf })])];
    const out = trimClipStart(tracks, 'a', 500, 10000);
    expect(out[0]?.clips[0]?.keyframes).toEqual({ x: [{ timeMs: 300, value: 2, easing: 'linear' }] });
  });

  it('se a lista de keyframes esvaziar, mantém o último descartado em 0', () => {
    const kf = {
      opacity: [
        { timeMs: 100, value: 0.2, easing: 'linear' as const },
        { timeMs: 400, value: 0.7, easing: 'linear' as const },
      ],
    };
    const tracks = [track('v1', [clip('a', 0, 2000, { keyframes: kf })])];
    const out = trimClipStart(tracks, 'a', 1000, 10000);
    expect(out[0]?.clips[0]?.keyframes).toEqual({
      opacity: [{ timeMs: 0, value: 0.7, easing: 'linear' }],
    });
  });
});

describe('trimClipEnd', () => {
  it('limita o fim pelo trimOut disponível', () => {
    const tracks = [track('v1', [clip('a', 0, 2000, { trimOutMs: 1000 })])];
    const out = trimClipEnd(tracks, 'a', 5000, 10000);
    expect(out[0]?.clips[0]?.durationMs).toBe(3000);
    expect(out[0]?.clips[0]?.trimOutMs).toBe(0);
  });

  it('não invade o próximo clipe', () => {
    const tracks = [track('v1', [clip('a', 0, 2000, { trimOutMs: 1000 }), clip('n', 2500, 1000)])];
    const out = trimClipEnd(tracks, 'a', 4000, 10000);
    expect(out[0]?.clips[0]?.durationMs).toBe(2500);
    expect(out[0]?.clips[0]?.trimOutMs).toBe(500);
  });

  it('não deixa a duração ficar abaixo do mínimo', () => {
    const tracks = [track('v1', [clip('a', 0, 2000)])];
    const out = trimClipEnd(tracks, 'a', 0);
    expect(out[0]?.clips[0]?.durationMs).toBe(100);
  });

  it('imagem estica sem limite de mídia', () => {
    const tracks = [track('v1', [clip('a', 0, 5000)])];
    const out = trimClipEnd(tracks, 'a', 9000);
    expect(out[0]?.clips[0]?.durationMs).toBe(9000);
  });
});

describe('trimToTime', () => {
  it('corta o começo até o instante, no lado start', () => {
    const tracks = [track('v1', [clip('a', 0, 4000)])];
    const out = trimToTime(tracks, ['a'], 1000, 'start');
    expect(out[0]?.clips[0]?.startMs).toBe(1000);
    expect(out[0]?.clips[0]?.durationMs).toBe(3000);
    expect(out[0]?.clips[0]?.trimInMs).toBe(1000);
  });

  it('corta o fim no instante, no lado end, e ignora clipes que não contêm o instante', () => {
    const tracks = [track('v1', [clip('a', 0, 4000), clip('b', 5000, 1000)])];
    const out = trimToTime(tracks, ['a', 'b'], 3000, 'end');
    expect(out[0]?.clips[0]?.durationMs).toBe(3000);
    expect(out[0]?.clips[0]?.trimOutMs).toBe(1000);
    expect(out[0]?.clips[1]).toBe(tracks[0]?.clips[1]);
  });
});
