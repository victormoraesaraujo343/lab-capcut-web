// Operações puras sobre seleções de clipes: grupos, copiar e colar, duplicar e agrupar. Nunca mutam as entradas.

import type { Clip, Track, TrackKind } from '@/types';
import { clipEndMs } from '@/types';
import { t } from '@/i18n/pt-BR';
import { createId } from '@/engine/project/createProject';
import { updateClip } from './clipOps';
import { addTrack, placeClip } from './trackOps';

/** Clipe copiado, com a trilha de origem e a distância até o início da seleção. */
export interface ClipboardItem {
  /** Clipe como estava no momento da cópia. */
  clip: Clip;
  /** Trilha de origem do clipe. */
  trackId: string;
  /** Tipo da trilha de origem. */
  trackKind: TrackKind;
  /** Distância, em ms, entre o início do clipe e o início da seleção. */
  offsetMs: number;
}

/** Conteúdo copiado para a área de transferência de clipes. */
export interface ClipboardData {
  /** Clipes copiados, com seus deslocamentos. */
  items: ClipboardItem[];
}

/** Devolve os ids pedidos (existentes, sem repetir) seguidos dos clipes que compartilham grupo com eles. */
export function expandWithGroups(tracks: Track[], clipIds: string[]): string[] {
  const all = tracks.flatMap((t) => t.clips);
  const existing = new Set(all.map((c) => c.id));
  const requested = new Set(clipIds);
  const groups = new Set<string>();
  for (const clip of all) {
    if (requested.has(clip.id) && clip.groupId !== undefined) groups.add(clip.groupId);
  }
  const included = new Set<string>();
  const result: string[] = [];
  const add = (id: string): void => {
    if (included.has(id)) return;
    included.add(id);
    result.push(id);
  };
  for (const id of clipIds) {
    if (existing.has(id)) add(id);
  }
  for (const clip of all) {
    if (clip.groupId !== undefined && groups.has(clip.groupId)) add(clip.id);
  }
  return result;
}

/** Copia os clipes da seleção, com grupos, e calcula o deslocamento de cada um. Null se nada for copiado. */
export function copyClips(tracks: Track[], clipIds: string[]): ClipboardData | null {
  const ids = new Set(expandWithGroups(tracks, clipIds));
  const picked: { clip: Clip; track: Track }[] = [];
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (ids.has(clip.id)) picked.push({ clip, track });
    }
  }
  if (picked.length === 0) return null;
  const origin = picked.reduce((min, p) => Math.min(min, p.clip.startMs), Infinity);
  return {
    items: picked.map(({ clip, track }) => ({
      clip,
      trackId: track.id,
      trackKind: track.kind,
      offsetMs: clip.startMs - origin,
    })),
  };
}

/** Escolhe a trilha de destino de um item: a de origem, senão a primeira livre do mesmo tipo, senão uma nova. */
function pasteTarget(tracks: Track[], item: ClipboardItem): { tracks: Track[]; trackId: string } {
  const source = tracks.find((t) => t.id === item.trackId);
  if (source && !source.locked) return { tracks, trackId: source.id };
  const sameKind = tracks.find((t) => t.kind === item.trackKind && !t.locked);
  if (sameKind) return { tracks, trackId: sameKind.id };
  const added = addTrack(tracks, item.trackKind, undefined, t.timeline.trackKinds[item.trackKind]);
  return { tracks: added.tracks, trackId: added.trackId };
}

/** Copia um clipe com id novo; grupos antigos viram grupos novos, um por grupo antigo. */
function cloneForPaste(clip: Clip, id: string, groupMap: Map<string, string>): Clip {
  const copy: Clip = { ...clip, id };
  delete copy.groupId;
  if (clip.groupId !== undefined) {
    let groupId = groupMap.get(clip.groupId);
    if (groupId === undefined) {
      groupId = createId();
      groupMap.set(clip.groupId, groupId);
    }
    copy.groupId = groupId;
  }
  return copy;
}

/** Cola os clipes copiados em atMs, mantendo os deslocamentos. Empurra o que já está na trilha. */
export function pasteClips(
  tracks: Track[],
  data: ClipboardData,
  atMs: number,
): { tracks: Track[]; newIds: string[] } {
  const newIds = data.items.map(() => createId());
  const groupMap = new Map<string, string>();
  const order = data.items.map((_, i) => i).sort((a, b) => {
    const offsetA = data.items[a]?.offsetMs ?? 0;
    const offsetB = data.items[b]?.offsetMs ?? 0;
    return offsetA - offsetB;
  });
  let result = tracks;
  for (const index of order) {
    const item = data.items[index];
    const id = newIds[index];
    if (!item || id === undefined) continue;
    const target = pasteTarget(result, item);
    result = placeClip(
      target.tracks,
      cloneForPaste(item.clip, id, groupMap),
      target.trackId,
      atMs + item.offsetMs,
      'insert',
    );
  }
  return { tracks: result, newIds };
}

/** Duplica a seleção (com grupos) logo depois do fim do último clipe copiado. */
export function duplicateClips(
  tracks: Track[],
  clipIds: string[],
): { tracks: Track[]; newIds: string[] } {
  const data = copyClips(tracks, clipIds);
  if (!data) return { tracks, newIds: [] };
  const end = data.items.reduce((max, item) => Math.max(max, clipEndMs(item.clip)), 0);
  return pasteClips(tracks, data, end);
}

/** Ids únicos dos clipes pedidos que estão em trilhas destravadas. */
function editableIds(tracks: Track[], clipIds: string[]): string[] {
  const requested = new Set(clipIds);
  const ids: string[] = [];
  for (const track of tracks) {
    if (track.locked) continue;
    for (const clip of track.clips) {
      if (requested.has(clip.id)) ids.push(clip.id);
    }
  }
  return ids;
}

/** Junta os clipes pedidos num mesmo grupo novo. Precisa de pelo menos dois editáveis; senão não muda nada. */
export function groupClips(tracks: Track[], clipIds: string[]): Track[] {
  const ids = editableIds(tracks, clipIds);
  if (ids.length < 2) return tracks;
  const groupId = createId();
  let result = tracks;
  for (const id of ids) {
    result = updateClip(result, id, (c) => ({ ...c, groupId }));
  }
  return result;
}

/** Remove o groupId de cada clipe sem grupo. */
function withoutGroup(clip: Clip): Clip {
  const copy: Clip = { ...clip };
  delete copy.groupId;
  return copy;
}

/** Desfaz o grupo de todos os clipes que pertencem a um grupo tocado pela seleção. */
export function ungroupClips(tracks: Track[], clipIds: string[]): Track[] {
  const requested = new Set(clipIds);
  const groups = new Set<string>();
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (requested.has(clip.id) && clip.groupId !== undefined) groups.add(clip.groupId);
    }
  }
  const inGroups = (c: Clip): boolean => c.groupId !== undefined && groups.has(c.groupId);
  const next = tracks.map((track) => {
    if (track.locked || !track.clips.some(inGroups)) return track;
    return { ...track, clips: track.clips.map((c) => (inGroups(c) ? withoutGroup(c) : c)) };
  });
  return next.every((t, i) => t === tracks[i]) ? tracks : next;
}
