import { describe, expect, it } from 'vitest';
import type { Clip, Track } from '@/types';
import { defaultAudioFx, defaultSpeed, defaultTransform } from '@/types';
import {
  copyClips,
  duplicateClips,
  expandWithGroups,
  groupClips,
  pasteClips,
  ungroupClips,
} from '@/engine/timeline/selectionOps';

/** Monta um clipe de teste na trilha dada. */
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

/** Procura uma trilha pelo id, falhando se ela não existir. */
function trackById(tracks: Track[], id: string): Track {
  const found = tracks.find((t) => t.id === id);
  if (!found) throw new Error(`trilha ${id} não encontrada`);
  return found;
}

describe('expandWithGroups', () => {
  it('inclui os colegas de grupo sem repetir ids', () => {
    const tracks = [
      track('v1', [clip('a', 0, 500, { groupId: 'g' }), clip('b', 600, 500)]),
      track('v2', [clip('c', 0, 500, { groupId: 'g' }), clip('d', 0, 100)]),
    ];
    expect(expandWithGroups(tracks, ['a', 'a'])).toEqual(['a', 'c']);
    expect(expandWithGroups(tracks, ['b'])).toEqual(['b']);
  });

  it('ignora ids que não existem', () => {
    expect(expandWithGroups([track('v1', [clip('a', 0, 500)])], ['x', 'a'])).toEqual(['a']);
  });
});

describe('copyClips', () => {
  it('devolve null quando nada é selecionado', () => {
    expect(copyClips([track('v1', [clip('a', 0, 500)])], ['x'])).toBeNull();
  });

  it('guarda os deslocamentos a partir do início mais cedo', () => {
    const tracks = [track('v1', [clip('a', 1000, 500), clip('b', 2000, 500)])];
    const data = copyClips(tracks, ['a', 'b']);
    expect(data?.items.map((i) => i.offsetMs)).toEqual([0, 1000]);
    expect(data?.items[0]?.trackKind).toBe('video');
  });
});

describe('pasteClips', () => {
  it('cria ids novos e preserva os deslocamentos', () => {
    const tracks = [track('v1', [clip('a', 0, 500), clip('b', 1000, 500)])];
    const data = copyClips(tracks, ['a', 'b']);
    if (!data) throw new Error('cópia vazia');
    const result = pasteClips(tracks, data, 3000);
    const v1 = trackById(result.tracks, 'v1');
    const pasted = result.newIds.map((id) => v1.clips.find((c) => c.id === id));
    expect(result.newIds).not.toContain('a');
    expect(result.newIds).not.toContain('b');
    expect(pasted.map((c) => c?.startMs)).toEqual([3000, 4000]);
  });

  it('gera um groupId novo e consistente para clipes do mesmo grupo', () => {
    const tracks = [track('v1', [clip('a', 0, 500, { groupId: 'old' }), clip('b', 600, 500, { groupId: 'old' })])];
    const data = copyClips(tracks, ['a']);
    if (!data) throw new Error('cópia vazia');
    const result = pasteClips(tracks, data, 2000);
    const groups = trackById(result.tracks, 'v1').clips.filter((c) => c.id !== 'a' && c.id !== 'b').map((c) => c.groupId);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toBeDefined();
    expect(groups[0]).not.toBe('old');
    expect(groups[1]).toBe(groups[0]);
  });

  it('cola em outra trilha do mesmo tipo quando a de origem está travada', () => {
    const tracks = [track('v1', [clip('a', 0, 500)], 'video', true), track('v2', [], 'video')];
    const data = copyClips(tracks, ['a']);
    if (!data) throw new Error('cópia vazia');
    const result = pasteClips(tracks, data, 0);
    expect(result.tracks).toHaveLength(2);
    expect(trackById(result.tracks, 'v2').clips).toHaveLength(1);
    expect(trackById(result.tracks, 'v1').clips).toHaveLength(1);
  });

  it('cria trilha nova quando não há trilha livre do mesmo tipo', () => {
    const tracks = [track('v1', [clip('a', 0, 500)], 'video', true)];
    const data = copyClips(tracks, ['a']);
    if (!data) throw new Error('cópia vazia');
    const result = pasteClips(tracks, data, 0);
    expect(result.tracks).toHaveLength(2);
    const created = result.tracks[1];
    expect(created?.kind).toBe('video');
    expect(created?.clips[0]?.id).toBe(result.newIds[0]);
  });

  it('mantém a referência das trilhas não tocadas', () => {
    const v2 = track('v2', [clip('z', 0, 100)], 'video');
    const tracks = [track('v1', [clip('a', 0, 500)]), v2];
    const data = copyClips(tracks, ['a']);
    if (!data) throw new Error('cópia vazia');
    const result = pasteClips(tracks, data, 1000);
    expect(result.tracks[1]).toBe(v2);
  });
});

describe('duplicateClips', () => {
  it('coloca a cópia logo depois do fim e empurra o que estiver lá', () => {
    const tracks = [track('v1', [clip('a', 0, 1000), clip('b', 1000, 1000)])];
    const result = duplicateClips(tracks, ['a']);
    const v1 = trackById(result.tracks, 'v1');
    expect(result.newIds).toHaveLength(1);
    const copy = v1.clips.find((c) => c.id === result.newIds[0]);
    expect(copy?.startMs).toBe(1000);
    const pushed = v1.clips.find((c) => c.id === 'b');
    expect(pushed?.startMs).toBe(2000);
  });

  it('duplica grupos inteiros', () => {
    const tracks = [track('v1', [clip('a', 0, 500, { groupId: 'g' }), clip('b', 500, 500, { groupId: 'g' })])];
    const result = duplicateClips(tracks, ['a']);
    expect(result.newIds).toHaveLength(2);
  });

  it('devolve o mesmo array quando a seleção está vazia', () => {
    const tracks = [track('v1', [clip('a', 0, 500)])];
    const result = duplicateClips(tracks, ['x']);
    expect(result.tracks).toBe(tracks);
    expect(result.newIds).toEqual([]);
  });
});

describe('groupClips', () => {
  it('põe os clipes selecionados num mesmo grupo novo', () => {
    const tracks = [track('v1', [clip('a', 0, 500), clip('b', 600, 500)])];
    const out = groupClips(tracks, ['a', 'b']);
    const v1 = trackById(out, 'v1');
    const gA = v1.clips[0]?.groupId;
    expect(gA).toBeDefined();
    expect(v1.clips[1]?.groupId).toBe(gA);
  });

  it('não agrupa com menos de dois clipes', () => {
    const tracks = [track('v1', [clip('a', 0, 500)])];
    expect(groupClips(tracks, ['a'])).toBe(tracks);
  });

  it('mantém a referência de trilhas não tocadas', () => {
    const v2 = track('v2', [clip('z', 0, 500)]);
    const tracks = [track('v1', [clip('a', 0, 500), clip('b', 600, 500)]), v2];
    expect(groupClips(tracks, ['a', 'b'])[1]).toBe(v2);
  });
});

describe('ungroupClips', () => {
  it('remove o grupo de todos os colegas do grupo tocado', () => {
    const tracks = [
      track('v1', [clip('a', 0, 500, { groupId: 'g' })]),
      track('v2', [clip('b', 0, 500, { groupId: 'g' }), clip('c', 600, 500)]),
    ];
    const out = ungroupClips(tracks, ['a']);
    expect(trackById(out, 'v1').clips[0]?.groupId).toBeUndefined();
    expect(trackById(out, 'v2').clips[0]?.groupId).toBeUndefined();
    expect('groupId' in (trackById(out, 'v2').clips[0] ?? {})).toBe(false);
    expect(trackById(out, 'v2').clips[1]?.groupId).toBeUndefined();
  });

  it('não muda trilhas sem grupo tocado, mantendo a referência', () => {
    const v2 = track('v2', [clip('z', 0, 500)]);
    const tracks = [track('v1', [clip('a', 0, 500, { groupId: 'g' })]), v2];
    const out = ungroupClips(tracks, ['a']);
    expect(out[1]).toBe(v2);
  });

  it('devolve o mesmo array quando nenhum clipe selecionado tem grupo', () => {
    const tracks = [track('v1', [clip('a', 0, 500)])];
    expect(ungroupClips(tracks, ['a'])).toBe(tracks);
  });
});

describe('pureza', () => {
  it('não altera as trilhas de entrada', () => {
    const tracks = [track('v1', [clip('a', 0, 1000, { groupId: 'g' }), clip('b', 1000, 1000, { groupId: 'g' })])];
    const snapshot = JSON.stringify(tracks);
    duplicateClips(tracks, ['a']);
    groupClips(tracks, ['a', 'b']);
    ungroupClips(tracks, ['a']);
    expect(JSON.stringify(tracks)).toBe(snapshot);
  });
});
