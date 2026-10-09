// Matemática pura do editor de curva de velocidade: conversões entre pontos e pixels (eixo Y logarítmico) e edições dos pontos.
import type { SpeedCurvePoint } from '@/types';

/** Largura do gráfico da curva, em unidades do SVG. */
export const CHART_WIDTH = 280;
/** Altura do gráfico da curva, em unidades do SVG. */
export const CHART_HEIGHT = 140;
/** Margem interna do gráfico, para os pontos nas bordas não ficarem cortados. */
export const CHART_PAD = 10;
/** Menor velocidade exibida no gráfico (0,1x). */
export const CHART_MIN_SPEED = 0.1;
/** Maior velocidade exibida no gráfico (10x). */
export const CHART_MAX_SPEED = 10;
/** Número mínimo de pontos de uma curva. */
export const MIN_CURVE_POINTS = 2;
/** Fator de cada passo do teclado sobre a velocidade (5% por seta). */
const SPEED_STEP_FACTOR = 1.05;

/** Limita um número ao intervalo [min, max]. */
function clampTo(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Posição de uma velocidade no eixo logarítmico, de 0 (0,1x) a 1 (10x). */
function speedFraction(speed: number): number {
  const low = Math.log10(CHART_MIN_SPEED);
  const high = Math.log10(CHART_MAX_SPEED);
  return (Math.log10(clampTo(speed, CHART_MIN_SPEED, CHART_MAX_SPEED)) - low) / (high - low);
}

/** Coordenada X de um instante t (0 a 1) dentro do gráfico. */
export function tToX(t: number): number {
  return CHART_PAD + clampTo(t, 0, 1) * (CHART_WIDTH - 2 * CHART_PAD);
}

/** Instante t (0 a 1) de uma coordenada X do gráfico. */
export function xToT(x: number): number {
  return clampTo((x - CHART_PAD) / (CHART_WIDTH - 2 * CHART_PAD), 0, 1);
}

/** Coordenada Y de uma velocidade no gráfico: 10x fica no topo, 0,1x na base, eixo logarítmico. */
export function speedToY(speed: number): number {
  return CHART_PAD + (1 - speedFraction(speed)) * (CHART_HEIGHT - 2 * CHART_PAD);
}

/** Velocidade (0,1x a 10x) de uma coordenada Y do gráfico, eixo logarítmico. */
export function yToSpeed(y: number): number {
  const fraction = clampTo(1 - (y - CHART_PAD) / (CHART_HEIGHT - 2 * CHART_PAD), 0, 1);
  const low = Math.log10(CHART_MIN_SPEED);
  const high = Math.log10(CHART_MAX_SPEED);
  return 10 ** (low + fraction * (high - low));
}

/** Pontos em ordem crescente de t, sem mutar a entrada. */
export function sortCurve(points: readonly SpeedCurvePoint[]): SpeedCurvePoint[] {
  return [...points].sort((a, b) => a.t - b.t);
}

/** Insere um ponto no instante e velocidade dados; devolve a curva ordenada e a posição do novo ponto. */
export function insertPoint(
  points: readonly SpeedCurvePoint[],
  t: number,
  speed: number,
): { curve: SpeedCurvePoint[]; index: number } {
  const point = { t: clampTo(t, 0, 1), speed: clampTo(speed, CHART_MIN_SPEED, CHART_MAX_SPEED) };
  const curve = sortCurve([...points, point]);
  return { curve, index: curve.indexOf(point) };
}

/** Remove o ponto da posição dada; não baixa de MIN_CURVE_POINTS nem aceita posição inválida. */
export function removePoint(points: readonly SpeedCurvePoint[], index: number): SpeedCurvePoint[] {
  if (points.length <= MIN_CURVE_POINTS || index < 0 || index >= points.length) return [...points];
  return points.filter((_, i) => i !== index);
}

/** Move o ponto da posição dada para um novo instante e velocidade (limitados); devolve a curva ordenada e a nova posição do ponto. */
export function movePoint(
  points: readonly SpeedCurvePoint[],
  index: number,
  t: number,
  speed: number,
): { curve: SpeedCurvePoint[]; index: number } {
  const moved = { t: clampTo(t, 0, 1), speed: clampTo(speed, CHART_MIN_SPEED, CHART_MAX_SPEED) };
  const curve = sortCurve(points.map((p, i) => (i === index ? moved : p)));
  return { curve, index: curve.indexOf(moved) };
}

/** Velocidade depois de um passo do teclado: direction 1 acelera, -1 desacelera, sempre dentro do gráfico. */
export function nudgeSpeed(speed: number, direction: 1 | -1): number {
  return clampTo(speed * SPEED_STEP_FACTOR ** direction, CHART_MIN_SPEED, CHART_MAX_SPEED);
}

/** Instante depois de um passo do teclado, limitado a [0, 1]. */
export function nudgeT(t: number, delta: number): number {
  return clampTo(t + delta, 0, 1);
}

/** Diz se duas curvas têm os mesmos pontos, na mesma ordem e com os mesmos valores. */
export function sameCurve(a: readonly SpeedCurvePoint[], b: readonly SpeedCurvePoint[]): boolean {
  return a.length === b.length && a.every((p, i) => p.t === b[i]?.t && p.speed === b[i]?.speed);
}
