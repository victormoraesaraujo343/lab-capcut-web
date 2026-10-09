// Cálculos puros dos gestos da prévia: mover, redimensionar, girar, encaixar no centro e escolher a camada clicada.
// Coordenadas em px do projeto, origem no canto superior esquerdo; x/y da transformação são deslocamentos a partir do centro.
import { layerCorners } from '@/engine/render/matrix';
import type { Layer, Project, Transform } from '@/types';

/** Ponto em px (x, y). */
export type Point = [number, number];

/** Quadrilátero de cantos na ordem superior esquerdo, superior direito, inferior direito, inferior esquerdo. */
export type Quad = [Point, Point, Point, Point];

/** Escala mínima de um clipe ao redimensionar. */
const MIN_SCALE = 0.05;
/** Passo do giro com Shift, em graus. */
const ROTATE_SNAP_STEP = 15;
/** Distância, em graus, em que a rotação gruda em 0/90/180/270. */
const RIGHT_ANGLE_SNAP = 3;

/** Converte um ponto da tela (px CSS, relativo à prévia) para px do projeto. */
export function screenToProject(px: number, py: number, displayScale: number): [number, number] {
  return [px / displayScale, py / displayScale];
}

/** Desloca a transformação em px do projeto, sem mexer em escala, rotação, opacidade ou recorte. */
export function moveTransform(start: Transform, dxProject: number, dyProject: number): Transform {
  return { ...start, x: start.x + dxProject, y: start.y + dyProject };
}

/** Razão entre dois módulos; 1 quando a referência é zero, para não dividir por zero. */
function magnitudeRatio(current: number, reference: number): number {
  const base = Math.abs(reference);
  return base < 1e-6 ? 1 : Math.abs(current) / base;
}

/** Gira um vetor por um ângulo em graus (positivo = horário na tela). */
function rotateVector(v: Point, degrees: number): Point {
  const rad = (degrees * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
}

/** Escala pela razão das distâncias ao centro; uniforme mantém a proporção, senão escala por eixo no referencial do clipe. */
export function scaleFromCorner(
  start: Transform,
  centerProject: [number, number],
  startPointer: [number, number],
  pointer: [number, number],
  uniform: boolean,
): Transform {
  const v0: Point = [startPointer[0] - centerProject[0], startPointer[1] - centerProject[1]];
  const v1: Point = [pointer[0] - centerProject[0], pointer[1] - centerProject[1]];
  if (uniform) {
    const k = magnitudeRatio(Math.hypot(v1[0], v1[1]), Math.hypot(v0[0], v0[1]));
    return {
      ...start,
      scaleX: Math.max(MIN_SCALE, start.scaleX * k),
      scaleY: Math.max(MIN_SCALE, start.scaleY * k),
    };
  }
  const l0 = rotateVector(v0, -start.rotation);
  const l1 = rotateVector(v1, -start.rotation);
  const kx = magnitudeRatio(l1[0], l0[0]);
  const ky = magnitudeRatio(l1[1], l0[1]);
  return {
    ...start,
    scaleX: Math.max(MIN_SCALE, start.scaleX * kx),
    scaleY: Math.max(MIN_SCALE, start.scaleY * ky),
  };
}

/** Ângulo de um vetor em graus, com y para baixo (horário na tela é crescente). */
function angleOf(v: Point): number {
  return (Math.atan2(v[1], v[0]) * 180) / Math.PI;
}

/** Leva uma diferença de ângulo para o intervalo (-180, 180]. */
function wrapDelta(d: number): number {
  return ((((d + 540) % 360) + 360) % 360) - 180;
}

/** Gruda a rotação em 0/90/180/270 quando estiver a menos de 3°, preservando o número de voltas. */
function stickToRightAngle(rotation: number): number {
  const mod = ((rotation % 360) + 360) % 360;
  const nearest = Math.round(mod / 90) * 90;
  const diff = mod - nearest;
  return Math.abs(diff) < RIGHT_ANGLE_SNAP ? rotation - diff : rotation;
}

/** Gira pela diferença de ângulo entre o ponteiro inicial e o atual, em torno do centro; snapDegrees arredonda o resultado. */
export function rotateAround(
  start: Transform,
  centerProject: [number, number],
  startPointer: [number, number],
  pointer: [number, number],
  snapDegrees: number | null,
): Transform {
  const a0 = angleOf([startPointer[0] - centerProject[0], startPointer[1] - centerProject[1]]);
  const a1 = angleOf([pointer[0] - centerProject[0], pointer[1] - centerProject[1]]);
  let rotation = start.rotation + wrapDelta(a1 - a0);
  if (snapDegrees !== null) {
    const step = snapDegrees > 0 ? snapDegrees : ROTATE_SNAP_STEP;
    rotation = Math.round(rotation / step) * step;
  }
  return { ...start, rotation: stickToRightAngle(rotation) };
}

/** Zera x e/ou y quando estiverem a menos de thresholdPx do centro, e diz quais eixos grudaram. */
export function snapToCenter(
  t: Transform,
  thresholdPx: number,
): { transform: Transform; snappedX: boolean; snappedY: boolean } {
  const snappedX = Math.abs(t.x) < thresholdPx;
  const snappedY = Math.abs(t.y) < thresholdPx;
  return {
    transform: { ...t, x: snappedX ? 0 : t.x, y: snappedY ? 0 : t.y },
    snappedX,
    snappedY,
  };
}

/** Verdadeiro se o ponto está dentro do quadrilátero (convexo, nos cantos em ordem); quadrilátero degenerado não contém nada. */
export function pointInQuad(corners: readonly Point[], p: Point): boolean {
  let positive = false;
  let negative = false;
  for (let i = 0; i < corners.length; i += 1) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    if (a === undefined || b === undefined) return false;
    const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (cross > 0) positive = true;
    if (cross < 0) negative = true;
    if (positive && negative) return false;
  }
  return positive || negative;
}

/** Clipe da camada mais de cima (maior zIndex) cujo quadrilátero contém o ponto, ou null. */
export function hitTestLayers(
  layers: Layer[],
  frameW: number,
  frameH: number,
  point: [number, number],
): string | null {
  const topFirst = [...layers].sort((a, b) => b.zIndex - a.zIndex);
  for (const layer of topFirst) {
    if (pointInQuad(layerCorners(layer, frameW, frameH), point)) return layer.clipId;
  }
  return null;
}

/** Estilo do cursor de um canto (0 = superior esquerdo, depois horário), conforme o eixo da diagonal depois da rotação. */
export function cornerCursor(corner: number, rotation: number): 'nwse-resize' | 'nesw-resize' {
  const base = corner % 2 === 0 ? 45 : 135;
  const axis = ((((base + rotation) % 180) + 180) % 180);
  const distance = Math.abs(axis - 45);
  return Math.min(distance, 180 - distance) <= 45 ? 'nwse-resize' : 'nesw-resize';
}

/** Quadrilátero da camada em px do projeto, ou null. */
export function projectQuad(layer: Layer, project: Project): Quad | null {
  const [a, b, c, d] = layerCorners(layer, project.width, project.height);
  if (a === undefined || b === undefined || c === undefined || d === undefined) return null;
  return [a, b, c, d];
}

/** Multiplica um quadrilátero por uma escala. */
export function scaleQuad(q: Quad, s: number): Quad {
  const f = ([x, y]: Point): Point => [x * s, y * s];
  return [f(q[0]), f(q[1]), f(q[2]), f(q[3])];
}

/** Centro (média dos cantos) de um quadrilátero. */
export function centerOfQuad(q: Quad): Point {
  return [(q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4];
}

/** Posição da alça de giro, afastada `offsetPx` acima do meio da borda de cima, para fora do centro. */
export function rotateHandlePos(q: Quad, offsetPx: number): Point {
  const top: Point = [(q[0][0] + q[1][0]) / 2, (q[0][1] + q[1][1]) / 2];
  const c = centerOfQuad(q);
  const dx = top[0] - c[0];
  const dy = top[1] - c[1];
  const len = Math.hypot(dx, dy) || 1;
  return [top[0] + (dx / len) * offsetPx, top[1] + (dy / len) * offsetPx];
}

/** Camada do primeiro clipe selecionado que aparece no instante, ou undefined. */
export function pickSelectedLayer(layers: Layer[], selectedIds: string[]): Layer | undefined {
  for (const id of selectedIds) {
    const found = layers.find((layer) => layer.clipId === id);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Verdadeiro se a trilha do clipe está travada. */
export function isClipLocked(project: Project, clipId: string): boolean {
  return project.tracks.some((track) => track.locked && track.clips.some((c) => c.id === clipId));
}
