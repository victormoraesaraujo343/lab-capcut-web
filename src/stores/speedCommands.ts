// Comandos de velocidade do clipe: recalculam a duração (com ripple ao crescer) e aplicam via timelineStore.edit.
import type { Clip, KeyframeMap, Speed, SpeedCurvePoint, Track } from '@/types';
import { findClip } from '@/engine/timeline/clipOps';
import { MIN_CLIP_MS } from '@/engine/timeline/constants';
import {
  mediaOffsetAt,
  SPEED_CURVE_PRESETS,
  SPEED_MAX,
  SPEED_MIN,
  timelineDurationFor,
  type SpeedPresetId,
} from '@/engine/timeline/speedCurve';
import { useProjectStore } from './projectStore';
import { useTimelineStore } from './timelineStore';

/** Limita uma velocidade constante ao intervalo permitido; valor inválido vira 1x. */
function clampSpeed(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, value));
}

/** Normaliza uma curva: t entre 0 e 1, velocidade no intervalo permitido, pontos em ordem de t. */
function normalizeCurve(curve: SpeedCurvePoint[]): SpeedCurvePoint[] {
  return curve
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.speed))
    .map((p) => ({ t: Math.min(1, Math.max(0, p.t)), speed: clampSpeed(p.speed) }))
    .sort((a, b) => a.t - b.t);
}

/** Multiplica os tempos dos keyframes pela razão entre a duração nova e a antiga, para acompanhar o clipe. */
function scaleKeyframes(keyframes: KeyframeMap, fromMs: number, toMs: number): KeyframeMap {
  if (!(fromMs > 0) || fromMs === toMs) return keyframes;
  const ratio = toMs / fromMs;
  const out: KeyframeMap = {};
  for (const [prop, list] of Object.entries(keyframes)) {
    out[prop] = list.map((k) => ({ ...k, timeMs: k.timeMs * ratio }));
  }
  return out;
}

/**
 * Aplica uma nova velocidade ao clipe e recalcula a duração pela mídia que ele consome.
 * Se o clipe crescer, os clipes seguintes da mesma trilha são empurrados; se encolher, fica um buraco.
 */
export function retimeClip(tracks: Track[], clipId: string, nextSpeed: (speed: Speed) => Speed): Track[] {
  const found = findClip(tracks, clipId);
  if (!found || found.track.locked) return tracks;
  const clip: Clip = found.clip;
  const speed = nextSpeed(clip.speed);
  const mediaSpanMs = mediaOffsetAt(clip.speed, clip.durationMs, clip.durationMs);
  const durationMs = Math.max(MIN_CLIP_MS, Math.round(timelineDurationFor(speed, mediaSpanMs)));
  const delta = durationMs - clip.durationMs;
  const oldEnd = clip.startMs + clip.durationMs;
  const updated: Clip = {
    ...clip,
    speed,
    durationMs,
    keyframes: scaleKeyframes(clip.keyframes, clip.durationMs, durationMs),
  };
  return tracks.map((track) => {
    if (track.id !== found.track.id) return track;
    const clips = track.clips.map((c) => {
      if (c.id === clipId) return updated;
      if (delta > 0 && c.startMs >= oldEnd) return { ...c, startMs: c.startMs + delta };
      return c;
    });
    return { ...track, clips };
  });
}

/** Aplica uma mudança de velocidade ao clipe como uma única edição no histórico. */
function changeSpeed(clipId: string, label: string, nextSpeed: (speed: Speed) => Speed): void {
  if (useProjectStore.getState().project === null) return;
  useTimelineStore.getState().edit(label, (tracks) => retimeClip(tracks, clipId, nextSpeed));
}

/** Define velocidade constante (0,1x a 100x) no clipe; a duração acompanha e os clipes seguintes andam se ele crescer. */
export function setClipSpeed(clipId: string, value: number): void {
  changeSpeed(clipId, 'speed', (speed) => ({ ...speed, mode: 'constant', value: clampSpeed(value) }));
}

/** Define uma curva de velocidade no clipe; a duração passa a seguir a média da curva. */
export function setSpeedCurve(clipId: string, curve: SpeedCurvePoint[]): void {
  const points = normalizeCurve(curve);
  changeSpeed(clipId, 'speed-curve', (speed) => ({ ...speed, mode: 'curve', curve: points }));
}

/** Aplica um dos presets de curva de velocidade ao clipe. Id desconhecido não faz nada. */
export function applySpeedPreset(clipId: string, presetId: SpeedPresetId): void {
  const preset = SPEED_CURVE_PRESETS.find((p) => p.id === presetId);
  if (preset === undefined) return;
  const points = normalizeCurve(preset.curve);
  changeSpeed(clipId, 'speed-preset', (speed) => ({ ...speed, mode: 'curve', curve: points }));
}

/** Liga ou desliga a manutenção do tom da voz ao mudar a velocidade; não altera a duração. */
export function setPreservePitch(clipId: string, preserve: boolean): void {
  changeSpeed(clipId, 'preserve-pitch', (speed) => ({ ...speed, preservePitch: preserve }));
}
