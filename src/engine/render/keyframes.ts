// Avaliação pura de keyframes: curvas de easing e valores animados no tempo local do clipe.

import type { Easing, Keyframe, KeyframeMap, Transform } from '@/types';

/** Aplica a curva de easing ao progresso t (0 a 1) e devolve o progresso ajustado. */
export function ease(easing: Easing, t: number): number {
  const x = Math.min(1, Math.max(0, t));
  switch (easing) {
    case 'linear':
      return x;
    case 'easeIn':
      return x * x;
    case 'easeOut':
      return 1 - (1 - x) * (1 - x);
    case 'easeInOut':
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    case 'hold':
      return x < 1 ? 0 : 1;
  }
}

/**
 * Avalia uma lista ordenada de keyframes no instante dado (ms, relativo ao clipe).
 * Antes do primeiro devolve o primeiro valor, depois do último devolve o último,
 * e entre dois pontos interpola com o easing do ponto anterior.
 */
export function evaluateKeyframes(
  list: Keyframe<number>[] | undefined,
  timeMs: number,
  fallback: number,
): number {
  if (!list || list.length === 0) return fallback;
  const first = list[0];
  const last = list[list.length - 1];
  if (!first || !last) return fallback;
  if (timeMs <= first.timeMs) return first.value;
  if (timeMs >= last.timeMs) return last.value;
  for (let i = 0; i < list.length - 1; i += 1) {
    const a = list[i];
    const b = list[i + 1];
    if (!a || !b) continue;
    if (timeMs < b.timeMs) {
      const span = b.timeMs - a.timeMs;
      if (span <= 0) return a.value;
      const t = (timeMs - a.timeMs) / span;
      return a.value + (b.value - a.value) * ease(a.easing, t);
    }
  }
  return last.value;
}

/** Avalia um único número animado pela chave do mapa (ex.: 'x', 'crop.left'), com valor de reserva. */
export function evaluateNumber(
  keyframes: KeyframeMap,
  key: string,
  localTimeMs: number,
  fallback: number,
): number {
  return evaluateKeyframes(keyframes[key], localTimeMs, fallback);
}

/** Devolve a transformação do clipe com cada propriedade animada avaliada no tempo local. */
export function evaluateTransform(
  base: Transform,
  keyframes: KeyframeMap,
  localTimeMs: number,
): Transform {
  return {
    x: evaluateNumber(keyframes, 'x', localTimeMs, base.x),
    y: evaluateNumber(keyframes, 'y', localTimeMs, base.y),
    scaleX: evaluateNumber(keyframes, 'scaleX', localTimeMs, base.scaleX),
    scaleY: evaluateNumber(keyframes, 'scaleY', localTimeMs, base.scaleY),
    rotation: evaluateNumber(keyframes, 'rotation', localTimeMs, base.rotation),
    opacity: evaluateNumber(keyframes, 'opacity', localTimeMs, base.opacity),
    crop: {
      top: evaluateNumber(keyframes, 'crop.top', localTimeMs, base.crop.top),
      right: evaluateNumber(keyframes, 'crop.right', localTimeMs, base.crop.right),
      bottom: evaluateNumber(keyframes, 'crop.bottom', localTimeMs, base.crop.bottom),
      left: evaluateNumber(keyframes, 'crop.left', localTimeMs, base.crop.left),
    },
  };
}

/** Tolerância padrão, em ms, para considerar dois keyframes como o mesmo instante. */
const DEFAULT_TOLERANCE_MS = 1;

/** Ordena uma lista de keyframes pelo tempo, sem mutar a entrada. */
function sortByTime(list: Keyframe<number>[]): Keyframe<number>[] {
  return [...list].sort((a, b) => a.timeMs - b.timeMs);
}

/** Indica se há um keyframe no instante, dentro da tolerância em ms. */
export function hasKeyframeAt(
  list: Keyframe<number>[] | undefined,
  timeMs: number,
  toleranceMs: number = DEFAULT_TOLERANCE_MS,
): boolean {
  return (list ?? []).some((k) => Math.abs(k.timeMs - timeMs) <= toleranceMs);
}

/** Insere o keyframe ou substitui o que já existe no mesmo instante; a lista volta ordenada por tempo. */
export function upsertKeyframe(list: Keyframe<number>[], kf: Keyframe<number>): Keyframe<number>[] {
  const others = list.filter((k) => Math.abs(k.timeMs - kf.timeMs) > DEFAULT_TOLERANCE_MS);
  return sortByTime([...others, kf]);
}

/** Remove os keyframes do instante (dentro da tolerância); devolve a lista ordenada sem eles. */
export function removeKeyframeAt(
  list: Keyframe<number>[],
  timeMs: number,
  toleranceMs: number = DEFAULT_TOLERANCE_MS,
): Keyframe<number>[] {
  return list.filter((k) => Math.abs(k.timeMs - timeMs) > toleranceMs);
}

/** Leva o keyframe de fromMs para toMs, substituindo o que estiver em toMs. Sem keyframe em fromMs, devolve a lista igual. */
export function moveKeyframe(list: Keyframe<number>[], fromMs: number, toMs: number): Keyframe<number>[] {
  const source = list.find((k) => Math.abs(k.timeMs - fromMs) <= DEFAULT_TOLERANCE_MS);
  if (!source) return list;
  const rest = list.filter((k) => k !== source && Math.abs(k.timeMs - toMs) > DEFAULT_TOLERANCE_MS);
  return sortByTime([...rest, { ...source, timeMs: toMs }]);
}
