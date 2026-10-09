// Operações puras sobre trilhas: remoção, aparo, posicionamento e movimento de clipes. Nunca mutam as entradas.

import type { Clip, Track, TrackKind } from '@/types';
import { clipEndMs } from '@/types';
import { createId, createTrack } from '@/engine/project/createProject';
import { cutClipAt, findClip, replaceTrackAt, sliceClip } from './clipOps';

/** Aplica uma função a cada trilha; se nenhuma mudou, devolve o próprio array. */
function mapTracks(tracks: Track[], fn: (t: Track) => Track): Track[] {
  const next = tracks.map(fn);
  return next.every((t, i) => t === tracks[i]) ? tracks : next;
}

/** Ordena clipes por início, sem alterar o array recebido. */
export function sortClips(clips: Clip[]): Clip[] {
  return [...clips].sort((a, b) => a.startMs - b.startMs);
}

/** Remove os clipes com os ids dados, ignorando trilhas travadas. */
export function removeClipsById(tracks: Track[], ids: string[]): Track[] {
  const set = new Set(ids);
  return mapTracks(tracks, (track) => {
    if (track.locked || !track.clips.some((c) => set.has(c.id))) return track;
    return { ...track, clips: track.clips.filter((c) => !set.has(c.id)) };
  });
}

/** Remove, apara ou divide os clipes da trilha que caem no intervalo [startMs, endMs). */
export function clearRange(track: Track, startMs: number, endMs: number): Track {
  if (track.locked) return track;
  let changed = false;
  const clips: Clip[] = [];
  for (const clip of track.clips) {
    const clipStart = clip.startMs;
    const clipEnd = clipEndMs(clip);
    if (clipEnd <= startMs || clipStart >= endMs) {
      clips.push(clip);
      continue;
    }
    changed = true;
    const hasLeft = clipStart < startMs;
    const hasRight = clipEnd > endMs;
    if (hasLeft) clips.push(sliceClip(clip, clipStart, startMs, clip.id));
    if (hasRight) clips.push(sliceClip(clip, endMs, clipEnd, hasLeft ? createId() : clip.id));
  }
  if (!changed) return track;
  return { ...track, clips: sortClips(clips) };
}

/** Abre espaço em atMs: divide o clipe que contém o instante e empurra os clipes seguintes. */
function openGap(track: Track, atMs: number, durationMs: number): Track {
  const clips = track.clips
    .flatMap((c) => (c.startMs < atMs && atMs < clipEndMs(c) ? cutClipAt(c, atMs, createId()) : [c]))
    .map((c) => (c.startMs >= atMs ? { ...c, startMs: c.startMs + durationMs } : c));
  return { ...track, clips };
}

/** Coloca um clipe numa trilha em startMs. 'overwrite' sobrescreve; 'insert' empurra o que vem depois. */
export function placeClip(
  tracks: Track[],
  clip: Clip,
  trackId: string,
  startMs: number,
  mode: 'overwrite' | 'insert',
): Track[] {
  const targetIndex = tracks.findIndex((t) => t.id === trackId);
  const target = tracks[targetIndex];
  const source = findClip(tracks, clip.id);
  if (!target || target.locked || source?.track.locked) return tracks;
  const at = Math.max(0, startMs);
  const base = removeClipsById(tracks, [clip.id]);
  const current = base[targetIndex];
  if (!current) return tracks;
  const prepared =
    mode === 'overwrite'
      ? clearRange(current, at, at + clip.durationMs)
      : openGap(current, at, clip.durationMs);
  const placed: Clip = { ...clip, trackId, startMs: at };
  return replaceTrackAt(base, targetIndex, {
    ...prepared,
    clips: sortClips([...prepared.clips, placed]),
  });
}

/** Move uma seleção de clipes em deltaMs e trilhas (trackDelta). Sem trilha válida, o clipe fica na original. */
export function moveClips(
  tracks: Track[],
  clipIds: string[],
  deltaMs: number,
  trackDelta: number,
  mode: 'overwrite' | 'insert',
): Track[] {
  const items: { clip: Clip; targetId: string }[] = [];
  for (const id of clipIds) {
    const found = findClip(tracks, id);
    if (!found || found.track.locked) continue;
    const dest = tracks[found.trackIndex + trackDelta];
    const targetId =
      dest && dest.kind === found.track.kind && !dest.locked ? dest.id : found.track.id;
    items.push({ clip: found.clip, targetId });
  }
  if (items.length === 0) return tracks;
  const minStart = items.reduce((min, i) => Math.min(min, i.clip.startMs), Infinity);
  const delta = Math.max(deltaMs, -minStart);
  if (delta === 0 && trackDelta === 0) return tracks;
  let result = removeClipsById(tracks, items.map((i) => i.clip.id));
  const ordered = [...items].sort((a, b) => a.clip.startMs - b.clip.startMs);
  for (const item of ordered) {
    result = placeClip(result, item.clip, item.targetId, item.clip.startMs + delta, mode);
  }
  return result;
}

/** Remove os clipes dados de trilhas destravadas. Com ripple, os clipes seguintes andam para trás. */
export function deleteClips(tracks: Track[], clipIds: string[], ripple: boolean): Track[] {
  const ids = new Set(clipIds);
  return mapTracks(tracks, (track) => {
    if (track.locked || !track.clips.some((c) => ids.has(c.id))) return track;
    const gone = track.clips.filter((c) => ids.has(c.id));
    const kept = track.clips.filter((c) => !ids.has(c.id));
    if (!ripple) return { ...track, clips: kept };
    const clips = kept.map((c) => {
      const shift = gone
        .filter((g) => clipEndMs(g) <= c.startMs)
        .reduce((sum, g) => sum + g.durationMs, 0);
      return shift > 0 ? { ...c, startMs: c.startMs - shift } : c;
    });
    return { ...track, clips };
  });
}

/** Adiciona uma trilha vazia, na posição dada ou no fim. O nome é '<label> <n>'; sem label, usa o tipo em inglês. */
export function addTrack(
  tracks: Track[],
  kind: TrackKind,
  index?: number,
  label?: string,
): { tracks: Track[]; trackId: string } {
  const count = tracks.filter((t) => t.kind === kind).length + 1;
  const track = createTrack(kind, `${label ?? kind} ${count}`);
  const at = index === undefined ? tracks.length : Math.min(Math.max(index, 0), tracks.length);
  return {
    tracks: [...tracks.slice(0, at), track, ...tracks.slice(at)],
    trackId: track.id,
  };
}

/** Remove trilhas vazias e destravadas, mantendo a primeira trilha de vídeo e a primeira de áudio. */
export function pruneEmptyTracks(tracks: Track[]): Track[] {
  const keep = new Set([
    tracks.find((t) => t.kind === 'video')?.id,
    tracks.find((t) => t.kind === 'audio')?.id,
  ]);
  const next = tracks.filter((t) => t.clips.length > 0 || t.locked || keep.has(t.id));
  return next.length === tracks.length ? tracks : next;
}

/** Liga ou desliga uma flag da trilha (mudo, travada ou oculta). Vale mesmo em trilha travada. */
export function setTrackFlag(
  tracks: Track[],
  trackId: string,
  flag: 'muted' | 'locked' | 'hidden',
  value: boolean,
): Track[] {
  const index = tracks.findIndex((t) => t.id === trackId);
  const track = tracks[index];
  if (!track || track[flag] === value) return tracks;
  return replaceTrackAt(tracks, index, { ...track, [flag]: value });
}
