import { describe, expect, it } from 'vitest';
import type { Clip, Track } from '@/types';
import { defaultAudioFx, defaultSpeed, defaultTransform } from '@/types';
import {
  addTrack,
  clearRange,
  deleteClips,
  moveClips,
  placeClip,
  pruneEmptyTracks,
  removeClipsById,
  setTrackFlag,
  sortClips,
} from '@/engine/timeline/trackOps';

/** Monta um clipe de teste. */
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
function track(id: string, clips: Clip[], kind: Track['kind'] = 'video', locked = false): Track {
  return { id, kind, name: id, clips, muted: false, locked, hidden: false };
}

describe('sortClips', () => {
  it('ordena por startMs sem mutar o array recebido', () => {
    const input = [clip('b', 500, 100), clip('a', 0, 100)];
    const out = sortClips(input);
    expect(out.map((c) => c.id)).toEqual(['a', 'b']);
    expect(input.map((c) => c.id)).toEqual(['b', 'a']);
  });
});

describe('removeClipsById', () => {
  it('remove os ids e mantém a referência das trilhas não afetadas', () => {
    const v2 = track('v2', [clip('z', 0, 100)]);
    const tracks = [track('v1', [clip('a', 0, 100), clip('b', 200, 100)]), v2];
    const out = removeClipsById(tracks, ['a']);
    expect(out[0]?.clips.map((c) => c.id)).toEqual(['b']);
    expect(out[1]).toBe(v2);
  });

  it('não remove de trilha travada', () => {
    const tracks = [track('v1', [clip('a', 0, 100)], 'video', true)];
    expect(removeClipsById(tracks, ['a'])).toBe(tracks);
  });
});

describe('clearRange', () => {
  it('divide um clipe que atravessa o intervalo em dois, com id novo na direita', () => {
    const t = track('v1', [clip('a', 0, 4000)]);
    const out = clearRange(t, 1000, 2000);
    const [left, right] = out.clips;
    expect(out.clips).toHaveLength(2);
    expect(left?.id).toBe('a');
    expect(left?.durationMs).toBe(1000);
    expect(left?.trimOutMs).toBe(3000);
    expect(right?.id).not.toBe('a');
    expect(right?.startMs).toBe(2000);
    expect(right?.durationMs).toBe(2000);
    expect(right?.trimInMs).toBe(2000);
  });

  it('remove clipes totalmente cobertos', () => {
    const out = clearRange(track('v1', [clip('a', 1000, 500)]), 0, 2000);
    expect(out.clips).toEqual([]);
  });

  it('trilha travada não muda', () => {
    const t = track('v1', [clip('a', 0, 4000)], 'video', true);
    expect(clearRange(t, 1000, 2000)).toBe(t);
  });
});

describe('placeClip', () => {
  it('overwrite parte um clipe no meio: 3 pedaços (2 da base + o novo)', () => {
    const tracks = [track('v1', [clip('a', 0, 10000)]), track('v2', [clip('x', 0, 2000, { trackId: 'v2' })])];
    const source = tracks[1]?.clips[0];
    if (!source) throw new Error('clipe de teste ausente');
    const out = placeClip(tracks, source, 'v1', 3000, 'overwrite');
    const clips = out[0]?.clips ?? [];
    expect(clips).toHaveLength(3);
    expect(clips.map((c) => [c.startMs, c.durationMs])).toEqual([
      [0, 3000],
      [3000, 2000],
      [5000, 5000],
    ]);
    expect(out[1]?.clips).toEqual([]);
  });

  it('insert divide o clipe que contém o ponto e empurra os seguintes', () => {
    const tracks = [
      track('v1', [clip('a', 0, 2000), clip('b', 2000, 2000)]),
      track('v2', [clip('x', 0, 1000, { trackId: 'v2' })]),
    ];
    const source = tracks[1]?.clips[0];
    if (!source) throw new Error('clipe de teste ausente');
    const out = placeClip(tracks, source, 'v1', 1000, 'insert');
    expect(out[0]?.clips.map((c) => [c.id === 'x' ? 'X' : c.id, c.startMs, c.durationMs])).toEqual([
      ['a', 0, 1000],
      ['X', 1000, 1000],
      [expect.any(String), 2000, 1000],
      ['b', 3000, 2000],
    ]);
  });

  it('trilha destino travada não muda nada', () => {
    const tracks = [track('v1', [], 'video', true), track('v2', [clip('x', 0, 500, { trackId: 'v2' })])];
    const source = tracks[1]?.clips[0];
    if (!source) throw new Error('clipe de teste ausente');
    expect(placeClip(tracks, source, 'v1', 0, 'overwrite')).toBe(tracks);
  });

  it('mantém a referência das trilhas não afetadas', () => {
    const v3 = track('v3', []);
    const tracks = [track('v1', []), track('v2', [clip('x', 0, 500, { trackId: 'v2' })]), v3];
    const source = tracks[1]?.clips[0];
    if (!source) throw new Error('clipe de teste ausente');
    const out = placeClip(tracks, source, 'v1', -50, 'overwrite');
    expect(out[0]?.clips[0]?.startMs).toBe(0);
    expect(out[2]).toBe(v3);
  });
});

describe('moveClips', () => {
  it('limita o deslocamento negativo para o menor início ficar em 0', () => {
    const tracks = [track('v1', [clip('a', 500, 1000)])];
    const out = moveClips(tracks, ['a'], -2000, 0, 'overwrite');
    expect(out[0]?.clips[0]?.startMs).toBe(0);
  });

  it('trilha de outro kind ou inexistente mantém o clipe na trilha original', () => {
    const audio = track('a1', [], 'audio');
    const tracks = [track('v1', [clip('a', 500, 1000)]), audio];
    const sameKind = moveClips(tracks, ['a'], 1000, 1, 'overwrite');
    expect(sameKind[0]?.clips[0]?.startMs).toBe(1500);
    expect(sameKind[1]).toBe(audio);
    const missing = moveClips(tracks, ['a'], 0, 5, 'overwrite');
    expect(missing[0]?.clips[0]?.id).toBe('a');
  });

  it('não move clipes de trilha travada', () => {
    const tracks = [track('v1', [clip('a', 500, 1000)], 'video', true)];
    expect(moveClips(tracks, ['a'], 1000, 0, 'overwrite')).toBe(tracks);
  });
});

describe('deleteClips', () => {
  it('ripple fecha o buraco deixado pelo clipe removido', () => {
    const tracks = [track('v1', [clip('a', 0, 1000), clip('b', 1000, 1000), clip('c', 2000, 1000)])];
    const out = deleteClips(tracks, ['a'], true);
    expect(out[0]?.clips.map((c) => [c.id, c.startMs])).toEqual([
      ['b', 0],
      ['c', 1000],
    ]);
  });

  it('sem ripple só remove e não move os outros', () => {
    const tracks = [track('v1', [clip('a', 0, 1000), clip('b', 1000, 1000)])];
    const out = deleteClips(tracks, ['a'], false);
    expect(out[0]?.clips.map((c) => c.startMs)).toEqual([1000]);
  });

  it('trilha travada fica intocada', () => {
    const locked = track('v1', [clip('a', 0, 1000)], 'video', true);
    const tracks = [locked];
    expect(deleteClips(tracks, ['a'], true)).toBe(tracks);
  });
});

describe('addTrack', () => {
  it('nomeia pela quantidade do mesmo tipo + 1 com o prefixo dado e insere na posição pedida', () => {
    const tracks = [track('v1', []), track('a1', [], 'audio')];
    const added = addTrack(tracks, 'video', 1, 'Vídeo');
    expect(added.tracks).toHaveLength(3);
    expect(added.tracks[1]?.id).toBe(added.trackId);
    expect(added.tracks[1]?.name).toBe('Vídeo 2');
    expect(added.tracks[1]?.kind).toBe('video');
    expect(addTrack(tracks, 'audio', undefined, 'Áudio').tracks[2]?.name).toBe('Áudio 2');
  });

  it('sem label usa o tipo em inglês como prefixo', () => {
    const added = addTrack([track('v1', [])], 'sticker');
    expect(added.tracks[1]?.name).toBe('sticker 1');
  });
});

describe('pruneEmptyTracks', () => {
  it('remove vazias extras e mantém a primeira de vídeo e de áudio', () => {
    const tracks = [
      track('v1', []),
      track('v2', []),
      track('a1', [], 'audio'),
      track('v3', [clip('a', 0, 100)]),
    ];
    const out = pruneEmptyTracks(tracks);
    expect(out.map((t) => t.id)).toEqual(['v1', 'a1', 'v3']);
    expect(out[2]).toBe(tracks[3]);
  });

  it('sem nada a remover devolve a mesma referência', () => {
    const tracks = [track('v1', []), track('a1', [], 'audio')];
    expect(pruneEmptyTracks(tracks)).toBe(tracks);
  });
});

describe('setTrackFlag', () => {
  it('muda a flag mesmo em trilha travada e mantém as outras referências', () => {
    const other = track('v2', []);
    const tracks = [track('v1', [], 'video', true), other];
    const out = setTrackFlag(tracks, 'v1', 'locked', false);
    expect(out[0]?.locked).toBe(false);
    expect(out[1]).toBe(other);
  });

  it('valor igual devolve a mesma referência', () => {
    const tracks = [track('v1', [])];
    expect(setTrackFlag(tracks, 'v1', 'muted', false)).toBe(tracks);
  });
});
