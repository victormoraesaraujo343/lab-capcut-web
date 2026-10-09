// Recorte de curva de velocidade: sub-curva renormalizada e posição na mídia com extensão pelas bordas.
import type { Speed, SpeedCurvePoint } from '@/types';
import { SPEED_MIN, curveSpeedAt, mediaOffsetAt } from './speedCurve';

/** Número máximo de passos da busca binária que inverte a posição na mídia. */
const INVERSE_STEPS = 80;

/** Velocidade constante válida: a dada se for positiva, senão 1x (mesma regra dos recortes). */
function constantValue(speed: Speed): number {
  return speed.value > 0 ? speed.value : 1;
}

/** Recorta a curva entre t0 e t1 (valores de 0 a 1 da curva original) e a renormaliza para [0, 1]; fora da curva repete as bordas. */
export function sliceCurve(curve: SpeedCurvePoint[], t0: number, t1: number): SpeedCurvePoint[] {
  const span = t1 - t0;
  if (!(span > 0)) {
    const edge = curveSpeedAt(curve, t0);
    return [
      { t: 0, speed: edge },
      { t: 1, speed: edge },
    ];
  }
  const inner = curve.map((p) => p.t).filter((t) => t > t0 && t < t1);
  const breaks = [t0, t1, ...inner].sort((a, b) => a - b);
  return breaks.map((u) => ({ t: (u - t0) / span, speed: curveSpeedAt(curve, u) }));
}

/** Velocidade para o trecho [fromMs, toMs] (em ms locais do clipe original de duração durationMs), com a curva renormalizada à nova duração. */
export function sliceSpeed(speed: Speed, durationMs: number, fromMs: number, toMs: number): Speed {
  if (speed.mode === 'constant' || !(durationMs > 0)) return speed;
  return { ...speed, curve: sliceCurve(speed.curve, fromMs / durationMs, toMs / durationMs) };
}

/** Posição na mídia, em ms, para um instante local do clipe; fora de [0, duração] usa a velocidade da borda. */
export function mediaOffsetExtended(speed: Speed, localMs: number, durationMs: number): number {
  if (speed.mode === 'constant') return localMs * constantValue(speed);
  if (!(durationMs > 0)) return 0;
  if (localMs < 0) return localMs * curveSpeedAt(speed.curve, 0);
  if (localMs > durationMs) {
    return mediaOffsetAt(speed, durationMs, durationMs) + (localMs - durationMs) * curveSpeedAt(speed.curve, 1);
  }
  return mediaOffsetAt(speed, localMs, durationMs);
}

/** Instante local do clipe em que a posição na mídia vale targetMs (inverso de mediaOffsetExtended, por busca binária). */
export function localMsForMediaOffset(speed: Speed, durationMs: number, targetMs: number): number {
  if (speed.mode === 'constant') return targetMs / constantValue(speed);
  const bound = Math.abs(targetMs) / SPEED_MIN + Math.max(0, durationMs) + 1;
  let lo = -bound;
  let hi = bound;
  for (let step = 0; step < INVERSE_STEPS; step += 1) {
    const mid = (lo + hi) / 2;
    if (mediaOffsetExtended(speed, mid, durationMs) < targetMs) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
