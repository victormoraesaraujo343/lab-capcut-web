// Cálculo puro de velocidade: constante ou por curva, com posição na mídia e duração na timeline.

import type { Speed, SpeedCurvePoint } from '@/types';

/** Velocidade mínima permitida (0,1x). */
export const SPEED_MIN = 0.1;
/** Velocidade máxima permitida (100x). */
export const SPEED_MAX = 100;

/** Identificador de um preset de curva de velocidade. */
export type SpeedPresetId = 'montage' | 'hero' | 'bullet' | 'jumpCut' | 'flashIn' | 'flashOut';

/** Preset de curva de velocidade, no formato dos pontos de Speed.curve. */
export interface SpeedPreset {
  /** Identificador do preset. */
  id: SpeedPresetId;
  /** Pontos da curva, de t = 0 a t = 1. */
  curve: SpeedCurvePoint[];
}

/** Presets de curva de velocidade, no estilo das curvas do CapCut. */
export const SPEED_CURVE_PRESETS: SpeedPreset[] = [
  {
    id: 'montage',
    curve: [
      { t: 0, speed: 2.5 },
      { t: 0.2, speed: 1 },
      { t: 0.5, speed: 0.4 },
      { t: 0.8, speed: 1 },
      { t: 1, speed: 2.5 },
    ],
  },
  {
    id: 'hero',
    curve: [
      { t: 0, speed: 1 },
      { t: 0.4, speed: 1 },
      { t: 0.5, speed: 0.25 },
      { t: 0.6, speed: 0.25 },
      { t: 0.7, speed: 1 },
      { t: 1, speed: 1 },
    ],
  },
  {
    id: 'bullet',
    curve: [
      { t: 0, speed: 2 },
      { t: 0.45, speed: 2 },
      { t: 0.5, speed: 0.25 },
      { t: 0.55, speed: 0.25 },
      { t: 0.6, speed: 2 },
      { t: 1, speed: 2 },
    ],
  },
  {
    id: 'jumpCut',
    curve: [
      { t: 0, speed: 1 },
      { t: 0.24, speed: 1 },
      { t: 0.25, speed: 3 },
      { t: 0.49, speed: 3 },
      { t: 0.5, speed: 1 },
      { t: 0.74, speed: 1 },
      { t: 0.75, speed: 3 },
      { t: 1, speed: 3 },
    ],
  },
  {
    id: 'flashIn',
    curve: [
      { t: 0, speed: 8 },
      { t: 0.2, speed: 3 },
      { t: 0.5, speed: 1 },
      { t: 1, speed: 1 },
    ],
  },
  {
    id: 'flashOut',
    curve: [
      { t: 0, speed: 1 },
      { t: 0.5, speed: 1 },
      { t: 0.8, speed: 3 },
      { t: 1, speed: 8 },
    ],
  },
];

/** Limita um número ao intervalo [min, max]. */
function clampTo(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Diz se os pontos já estão em ordem crescente de t. */
function isSortedByT(curve: SpeedCurvePoint[]): boolean {
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1];
    const next = curve[i];
    if (prev && next && next.t < prev.t) return false;
  }
  return true;
}

/** Pontos da curva em ordem crescente de t (sem mutar a entrada). */
function sortedPoints(curve: SpeedCurvePoint[]): SpeedCurvePoint[] {
  return isSortedByT(curve) ? curve : [...curve].sort((a, b) => a.t - b.t);
}

/** Velocidade da curva no ponto t (0 a 1), interpolada linearmente; vazio = 1x; fora dos pontos repete o extremo. */
export function curveSpeedAt(curve: SpeedCurvePoint[], t: number): number {
  const points = sortedPoints(curve);
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return 1;
  if (t <= first.t) return clampTo(first.speed, SPEED_MIN, SPEED_MAX);
  if (t >= last.t) return clampTo(last.speed, SPEED_MIN, SPEED_MAX);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b || t > b.t) continue;
    const span = b.t - a.t;
    const ratio = span <= 0 ? 0 : (t - a.t) / span;
    return clampTo(a.speed + (b.speed - a.speed) * ratio, SPEED_MIN, SPEED_MAX);
  }
  return clampTo(last.speed, SPEED_MIN, SPEED_MAX);
}

/** Integral exata da curva entre u0 e u1 (valores de t), por trapézios entre os pontos de quebra. */
function integrateCurve(curve: SpeedCurvePoint[], u0: number, u1: number): number {
  if (u1 <= u0) return 0;
  const breaks = [u0, u1, ...sortedPoints(curve).map((p) => p.t).filter((t) => t > u0 && t < u1)].sort(
    (a, b) => a - b,
  );
  let total = 0;
  for (let i = 0; i < breaks.length - 1; i++) {
    const a = breaks[i];
    const b = breaks[i + 1];
    if (a === undefined || b === undefined || b <= a) continue;
    total += ((curveSpeedAt(curve, a) + curveSpeedAt(curve, b)) / 2) * (b - a);
  }
  return total;
}

/** Velocidade média da curva ao longo do clipe (integral de 0 a 1). Mede quanto da mídia é consumido por unidade de timeline. */
export function curveAverageSpeed(curve: SpeedCurvePoint[]): number {
  return integrateCurve(curve, 0, 1);
}

/** Posição na mídia, em ms (relativa ao início do trecho usado), depois de localMs dentro do clipe. */
export function mediaOffsetAt(speed: Speed, localMs: number, clipDurationMs: number): number {
  if (speed.mode === 'constant') return localMs * speed.value;
  if (!(clipDurationMs > 0)) return 0;
  const u = Math.max(0, localMs) / clipDurationMs;
  return clipDurationMs * integrateCurve(speed.curve, 0, u);
}

/** Duração na timeline, em ms, que consome a mídia dada (mediaSpanMs) com a velocidade dada. */
export function timelineDurationFor(speed: Speed, mediaSpanMs: number): number {
  if (speed.mode === 'constant') return mediaSpanMs / speed.value;
  return mediaSpanMs / curveAverageSpeed(speed.curve);
}
