// Cálculo puro dos trechos de áudio a tocar a partir de um instante da timeline.

import type { Asset, Clip, Project } from '../../types/project';
import { clipEndMs } from '../../types/project';

/** Trecho de áudio de um clipe, já ajustado ao instante de início da reprodução. */
export interface ScheduledSegment {
  /** Clipe de origem do trecho. */
  clipId: string;
  /** Asset de mídia que contém o áudio. */
  assetId: string;
  /** Instante na timeline, em ms, em que o trecho deve começar a tocar. */
  startAtTimelineMs: number;
  /** Posição, em ms, dentro da mídia original em que o trecho começa. */
  offsetInMediaMs: number;
  /** Duração do trecho na timeline, em ms. */
  durationMs: number;
  /** Velocidade de reprodução (1 = normal). */
  playbackRate: number;
  /** Volume do clipe, de 0 a 2. */
  gain: number;
}

/** Lista os trechos com som que ainda terminam depois do instante dado, ignorando trilhas mudas. */
export function computeSegments(project: Project, fromTimelineMs: number): ScheduledSegment[] {
  const assets = new Map<string, Asset>();
  for (const asset of project.assets) {
    assets.set(asset.id, asset);
  }
  const segments: ScheduledSegment[] = [];
  for (const track of project.tracks) {
    if (track.muted || (track.kind !== 'audio' && track.kind !== 'video')) {
      continue;
    }
    for (const clip of track.clips) {
      const segment = segmentFor(clip, assets, fromTimelineMs);
      if (segment !== null) {
        segments.push(segment);
      }
    }
  }
  return segments;
}

/** Calcula o ganho de um clipe no instante local dado, aplicando fades lineares de entrada e saída. */
export function clipGainAt(clip: Clip, localMs: number): number {
  const { fadeInMs, fadeOutMs } = clip.audio;
  let factor = 1;
  if (fadeInMs > 0 && localMs < fadeInMs) {
    factor = Math.min(factor, Math.max(0, localMs) / fadeInMs);
  }
  if (fadeOutMs > 0) {
    const remainingMs = clip.durationMs - localMs;
    if (remainingMs < fadeOutMs) {
      factor = Math.min(factor, Math.max(0, remainingMs) / fadeOutMs);
    }
  }
  return clip.volume * factor;
}

function segmentFor(clip: Clip, assets: Map<string, Asset>, fromTimelineMs: number): ScheduledSegment | null {
  if (clip.reversed || clip.assetId === undefined) {
    return null;
  }
  const asset = assets.get(clip.assetId);
  if (asset === undefined || (asset.kind !== 'video' && asset.kind !== 'audio')) {
    return null;
  }
  const rate = clip.speed.value;
  const endMs = clipEndMs(clip);
  if (!(rate > 0) || endMs <= fromTimelineMs) {
    return null;
  }
  if (clip.startMs < fromTimelineMs) {
    return {
      clipId: clip.id,
      assetId: asset.id,
      startAtTimelineMs: fromTimelineMs,
      offsetInMediaMs: clip.trimInMs + (fromTimelineMs - clip.startMs) * rate,
      durationMs: endMs - fromTimelineMs,
      playbackRate: rate,
      gain: clip.volume,
    };
  }
  return {
    clipId: clip.id,
    assetId: asset.id,
    startAtTimelineMs: clip.startMs,
    offsetInMediaMs: clip.trimInMs,
    durationMs: clip.durationMs,
    playbackRate: rate,
    gain: clip.volume,
  };
}
