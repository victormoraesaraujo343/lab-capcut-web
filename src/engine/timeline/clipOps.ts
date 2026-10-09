// Operações puras sobre clipes: busca, edição, divisão e aparo. Nunca mutam as entradas.

import type { Clip, Keyframe, KeyframeMap, Track } from '@/types';
import { clipEndMs } from '@/types';
import { createId } from '@/engine/project/createProject';
import { MIN_CLIP_MS } from './constants';
import { localMsForMediaOffset, mediaOffsetExtended, sliceSpeed } from './curveSlice';

/** Localização de um clipe: a trilha, o clipe e os índices dos dois. */
export interface ClipLocation {
  /** Trilha que contém o clipe. */
  track: Track;
  /** Clipe encontrado. */
  clip: Clip;
  /** Índice da trilha no array de trilhas. */
  trackIndex: number;
  /** Índice do clipe na trilha. */
  clipIndex: number;
}

/** Posição na mídia, em ms, de um instante local do clipe (constante ou por curva). */
function mediaAt(clip: Clip, localMs: number): number {
  return mediaOffsetExtended(clip.speed, localMs, clip.durationMs);
}

/** Localiza um clipe pelo id em todas as trilhas. */
export function findClip(tracks: Track[], clipId: string): ClipLocation | null {
  for (const [trackIndex, track] of tracks.entries()) {
    const clipIndex = track.clips.findIndex((c) => c.id === clipId);
    const clip = track.clips[clipIndex];
    if (clip) return { track, clip, trackIndex, clipIndex };
  }
  return null;
}

/** Troca a trilha de uma posição, mantendo a referência das demais. */
export function replaceTrackAt(tracks: Track[], index: number, track: Track): Track[] {
  return tracks.map((t, i) => (i === index ? track : t));
}

/** Troca um clipe pelo novo, na trilha onde ele está. */
function setClip(tracks: Track[], found: ClipLocation, clip: Clip): Track[] {
  const clips = found.track.clips.map((c, i) => (i === found.clipIndex ? clip : c));
  return replaceTrackAt(tracks, found.trackIndex, { ...found.track, clips });
}

/** Atualiza um clipe com uma função pura. Trilha travada ou clipe inexistente não mudam. */
export function updateClip(tracks: Track[], clipId: string, fn: (c: Clip) => Clip): Track[] {
  const found = findClip(tracks, clipId);
  if (!found || found.track.locked) return tracks;
  const updated = fn(found.clip);
  if (updated === found.clip) return tracks;
  return setClip(tracks, found, updated);
}

/** Filtra keyframes para um trecho e desloca os tempos para começar em zero. */
function sliceKeyframes(map: KeyframeMap, rel0: number, rel1: number, openEnd: boolean): KeyframeMap {
  const out: KeyframeMap = {};
  for (const [prop, list] of Object.entries(map)) {
    const kept = list
      .filter((k) => k.timeMs >= rel0 && (openEnd || k.timeMs < rel1))
      .map((k) => ({ ...k, timeMs: k.timeMs - rel0 }));
    if (kept.length > 0) out[prop] = kept;
  }
  return out;
}

/** Desloca keyframes em delta ms após o início do clipe andar. Os que ficam antes de zero saem; se uma lista esvaziar, mantém o último descartado em 0. */
function shiftKeyframesStart(map: KeyframeMap, delta: number): KeyframeMap {
  const out: KeyframeMap = {};
  for (const [prop, list] of Object.entries(map)) {
    const shifted = list.map((k) => ({ ...k, timeMs: k.timeMs - delta }));
    const kept = shifted.filter((k) => k.timeMs >= 0);
    if (kept.length > 0) {
      out[prop] = kept;
      continue;
    }
    const last = shifted.reduce<Keyframe<number> | undefined>(
      (acc, k) => (acc === undefined || k.timeMs >= acc.timeMs ? k : acc),
      undefined,
    );
    if (last) out[prop] = [{ ...last, timeMs: 0 }];
  }
  return out;
}

/** Recorta o trecho [fromMs, toMs) de um clipe (tempos absolutos da timeline), com o id dado. */
export function sliceClip(clip: Clip, fromMs: number, toMs: number, id: string): Clip {
  const end = clipEndMs(clip);
  const rel0 = fromMs - clip.startMs;
  const rel1 = toMs - clip.startMs;
  const openEnd = toMs >= end;
  return {
    ...clip,
    id,
    startMs: fromMs,
    durationMs: toMs - fromMs,
    speed: sliceSpeed(clip.speed, clip.durationMs, rel0, rel1),
    trimInMs: clip.trimInMs + mediaAt(clip, rel0),
    trimOutMs: clip.trimOutMs + (mediaAt(clip, clip.durationMs) - mediaAt(clip, rel1)),
    keyframes: sliceKeyframes(clip.keyframes, rel0, rel1, openEnd),
    transitionIn: rel0 === 0 ? clip.transitionIn : undefined,
    transitionOut: openEnd ? clip.transitionOut : undefined,
  };
}

/** Divide um clipe em dois no instante absoluto atMs, sem checar duração mínima; a direita recebe rightId. */
export function cutClipAt(clip: Clip, atMs: number, rightId: string): [Clip, Clip] {
  return [
    sliceClip(clip, clip.startMs, atMs, clip.id),
    sliceClip(clip, atMs, clipEndMs(clip), rightId),
  ];
}

/** Divide um clipe em atMs se os dois lados tiverem a duração mínima. Devolve o id da metade direita. */
export function splitClipAt(
  tracks: Track[],
  clipId: string,
  atMs: number,
): { tracks: Track[]; rightId: string | null } {
  const found = findClip(tracks, clipId);
  if (!found || found.track.locked) return { tracks, rightId: null };
  const { clip, track, trackIndex, clipIndex } = found;
  if (atMs < clip.startMs + MIN_CLIP_MS || atMs > clipEndMs(clip) - MIN_CLIP_MS) {
    return { tracks, rightId: null };
  }
  const rightId = createId();
  const [left, right] = cutClipAt(clip, atMs, rightId);
  const clips = [...track.clips.slice(0, clipIndex), left, right, ...track.clips.slice(clipIndex + 1)];
  return { tracks: replaceTrackAt(tracks, trackIndex, { ...track, clips }), rightId };
}

/** Divide, em atMs, os clipes que contêm o instante. Sem lista divide todos, em trilhas destravadas. */
export function splitAt(tracks: Track[], atMs: number, clipIds?: string[]): Track[] {
  const targets: string[] = [];
  for (const track of tracks) {
    if (track.locked) continue;
    for (const clip of track.clips) {
      const inside = clip.startMs < atMs && atMs < clipEndMs(clip);
      if (inside && (!clipIds || clipIds.includes(clip.id))) targets.push(clip.id);
    }
  }
  let result = tracks;
  for (const id of targets) result = splitClipAt(result, id, atMs).tracks;
  return result;
}

/** Move a borda esquerda de um clipe e mantém o fim. Respeita início 0, vizinho anterior, mídia e duração mínima. */
export function trimClipStart(
  tracks: Track[],
  clipId: string,
  newStartMs: number,
  assetDurationMs?: number,
): Track[] {
  const found = findClip(tracks, clipId);
  if (!found || found.track.locked) return tracks;
  const { clip, track } = found;
  const end = clipEndMs(clip);
  const prevEnd = track.clips
    .filter((c) => c.id !== clipId && c.startMs < clip.startMs)
    .reduce((max, c) => Math.max(max, clipEndMs(c)), 0);
  const mediaMin =
    assetDurationMs === undefined
      ? -Infinity
      : clip.startMs + localMsForMediaOffset(clip.speed, clip.durationMs, -clip.trimInMs);
  const lo = Math.max(0, prevEnd, mediaMin);
  const hi = end - MIN_CLIP_MS;
  if (lo > hi) return tracks;
  const next = Math.min(Math.max(newStartMs, lo), hi);
  if (next === clip.startMs) return tracks;
  const rel = next - clip.startMs;
  return setClip(tracks, found, {
    ...clip,
    startMs: next,
    durationMs: end - next,
    speed: sliceSpeed(clip.speed, clip.durationMs, rel, clip.durationMs),
    trimInMs: clip.trimInMs + mediaAt(clip, rel),
    keyframes: shiftKeyframesStart(clip.keyframes, next - clip.startMs),
  });
}

/** Move a borda direita de um clipe e mantém o início. Respeita vizinho seguinte, mídia e duração mínima. */
export function trimClipEnd(
  tracks: Track[],
  clipId: string,
  newEndMs: number,
  assetDurationMs?: number,
): Track[] {
  const found = findClip(tracks, clipId);
  if (!found || found.track.locked) return tracks;
  const { clip, track } = found;
  const start = clip.startMs;
  const end = clipEndMs(clip);
  const nextStart = track.clips
    .filter((c) => c.id !== clipId && c.startMs > start)
    .reduce((min, c) => Math.min(min, c.startMs), Infinity);
  const mediaMax =
    assetDurationMs === undefined
      ? Infinity
      : start + localMsForMediaOffset(clip.speed, clip.durationMs, mediaAt(clip, clip.durationMs) + clip.trimOutMs);
  const lo = start + MIN_CLIP_MS;
  const hi = Math.min(nextStart, mediaMax);
  if (lo > hi) return tracks;
  const next = Math.min(Math.max(newEndMs, lo), hi);
  if (next === end) return tracks;
  const rel = next - start;
  return setClip(tracks, found, {
    ...clip,
    durationMs: rel,
    speed: sliceSpeed(clip.speed, clip.durationMs, 0, rel),
    trimOutMs: clip.trimOutMs + (mediaAt(clip, clip.durationMs) - mediaAt(clip, rel)),
  });
}

/** Corta o começo ('start') ou o fim ('end') dos clipes que contêm o instante, até ele. */
export function trimToTime(
  tracks: Track[],
  clipIds: string[],
  atMs: number,
  side: 'start' | 'end',
): Track[] {
  let result = tracks;
  for (const id of clipIds) {
    const found = findClip(result, id);
    if (!found || atMs <= found.clip.startMs || atMs >= clipEndMs(found.clip)) continue;
    result = side === 'start' ? trimClipStart(result, id, atMs) : trimClipEnd(result, id, atMs);
  }
  return result;
}
