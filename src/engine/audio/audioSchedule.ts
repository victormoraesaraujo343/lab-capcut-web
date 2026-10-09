// Cálculo puro dos trechos de áudio a tocar a partir de um instante da timeline.

import type { Asset, Clip, Project, Speed } from '../../types/project';
import { clipEndMs } from '../../types/project';
import { evaluateNumber } from '../render/keyframes';
import { curveSpeedAt, mediaOffsetAt } from '../timeline/speedCurve';

/** Dados da curva de velocidade de um trecho, para recalcular o offset ao recortar o começo. */
export interface CurveSegmentInfo {
  /** Velocidade do clipe (modo 'curve'). */
  speed: Speed;
  /** Duração do clipe na timeline, em ms. */
  clipDurationMs: number;
  /** Instante, em ms dentro do clipe, em que o trecho começa. */
  localStartMs: number;
}

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
  /** Velocidade de reprodução (1 = normal); no modo 'curve', a velocidade no início do trecho. */
  playbackRate: number;
  /** Volume do clipe, de 0 a 2. */
  gain: number;
  /** Só no modo 'curve': dados da curva, usados para recalcular o offset ao recortar o início. */
  curve?: CurveSegmentInfo;
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

/**
 * Ganho de um clipe no instante local dado: volume (keyframes 'volume' ou volume fixo) vezes os fades
 * lineares de entrada e saída.
 */
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
  return volumeAt(clip, localMs) * factor;
}

/** Volume do clipe no instante local: o valor do keyframe 'volume' se houver, senão o volume fixo. */
export function volumeAt(clip: Clip, localMs: number): number {
  return Math.max(0, evaluateNumber(clip.keyframes, 'volume', localMs, clip.volume));
}

/** Velocidade instantânea do clipe no instante local: a constante, ou a da curva no ponto correspondente. */
export function speedAtLocal(clip: Clip, localMs: number): number {
  if (clip.speed.mode === 'constant') return clip.speed.value;
  return curveSpeedAt(clip.speed.curve, clip.durationMs > 0 ? localMs / clip.durationMs : 0);
}

function segmentFor(clip: Clip, assets: Map<string, Asset>, fromTimelineMs: number): ScheduledSegment | null {
  if (clip.reversed || clip.assetId === undefined) {
    return null;
  }
  const asset = assets.get(clip.assetId);
  if (asset === undefined || (asset.kind !== 'video' && asset.kind !== 'audio')) {
    return null;
  }
  const { speed } = clip;
  const endMs = clipEndMs(clip);
  if (endMs <= fromTimelineMs || (speed.mode === 'constant' && !(speed.value > 0))) {
    return null;
  }
  const playing = clip.startMs < fromTimelineMs;
  const localStartMs = playing ? fromTimelineMs - clip.startMs : 0;
  const segment: ScheduledSegment = {
    clipId: clip.id,
    assetId: asset.id,
    startAtTimelineMs: playing ? fromTimelineMs : clip.startMs,
    offsetInMediaMs: clip.trimInMs + mediaOffsetAt(speed, localStartMs, clip.durationMs),
    durationMs: playing ? endMs - fromTimelineMs : clip.durationMs,
    playbackRate: speedAtLocal(clip, localStartMs),
    gain: clip.volume,
  };
  if (speed.mode === 'curve') {
    segment.curve = { speed, clipDurationMs: clip.durationMs, localStartMs };
  }
  return segment;
}
