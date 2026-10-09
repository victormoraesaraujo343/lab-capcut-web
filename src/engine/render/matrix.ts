// Matrizes 3x3 puras (coluna-maior, Float32Array) que levam cada camada ao espaço de recorte do WebGL.

import type { Layer, Transform } from '@/types';

/** Tamanho da fonte encaixada inteira no destino mantendo a proporção (contain). */
export function containSize(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): { width: number; height: number } {
  if (srcW <= 0 || srcH <= 0) return { width: dstW, height: dstH };
  const scale = Math.min(dstW / srcW, dstH / srcH);
  return { width: srcW * scale, height: srcH * scale };
}

/** Lê um elemento da matriz, com 0 como reserva para índices fora do array. */
function at(m: Float32Array, i: number): number {
  return m[i] ?? 0;
}

/** Cria uma matriz 3x3 coluna-maior a partir de nove valores. */
function mat(values: number[]): Float32Array {
  return new Float32Array(values);
}

/** Matriz de translação em pixels. */
function translation(tx: number, ty: number): Float32Array {
  return mat([1, 0, 0, 0, 1, 0, tx, ty, 1]);
}

/** Matriz de escala por eixo. */
function scale(sx: number, sy: number): Float32Array {
  return mat([sx, 0, 0, 0, sy, 0, 0, 0, 1]);
}

/** Matriz de rotação em graus, horária na tela (eixo y para baixo). */
function rotation(degrees: number): Float32Array {
  const rad = (degrees * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return mat([c, s, 0, -s, c, 0, 0, 0, 1]);
}

/** Converte pixels centrados no quadro (y para baixo) para o espaço de recorte [-1, 1]. */
function pixelsToClip(frameW: number, frameH: number): Float32Array {
  return scale(2 / frameW, -2 / frameH);
}

/** Multiplica duas matrizes 3x3 coluna-maior: o resultado aplica b primeiro e depois a. */
export function multiply3(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(9);
  for (let col = 0; col < 3; col += 1) {
    for (let row = 0; row < 3; row += 1) {
      let sum = 0;
      for (let k = 0; k < 3; k += 1) {
        sum += at(a, k * 3 + row) * at(b, col * 3 + k);
      }
      out[col * 3 + row] = sum;
    }
  }
  return out;
}

/** Aplica uma matriz 3x3 afim a um ponto (x, y) e devolve o ponto resultante. */
export function transformPoint3(m: Float32Array, x: number, y: number): [number, number] {
  return [
    at(m, 0) * x + at(m, 3) * y + at(m, 6),
    at(m, 1) * x + at(m, 4) * y + at(m, 7),
  ];
}

/** Tamanho base da camada: contain no quadro para mídia; tamanho natural em px do projeto quando fit é 'none' (texto). */
function baseSize(layer: Layer, frameW: number, frameH: number): { width: number; height: number } {
  if (layer.fit === 'none') return { width: layer.sourceWidth, height: layer.sourceHeight };
  return containSize(layer.sourceWidth, layer.sourceHeight, frameW, frameH);
}

/** Tamanho visível da camada (já com escala e recorte) e deslocamento do centro recortado. */
function visibleGeometry(
  layer: Layer,
  frameW: number,
  frameH: number,
): { quadW: number; quadH: number; offX: number; offY: number } {
  const base = baseSize(layer, frameW, frameH);
  const t: Transform = layer.transform;
  const crop = t.crop;
  const fullW = base.width * t.scaleX;
  const fullH = base.height * t.scaleY;
  const visX = Math.max(0, 1 - crop.left - crop.right);
  const visY = Math.max(0, 1 - crop.top - crop.bottom);
  return {
    quadW: fullW * visX,
    quadH: fullH * visY,
    // O crop recorta sem recentralizar: o centro visível fica deslocado do centro inteiro.
    offX: ((crop.left - crop.right) * fullW) / 2,
    offY: ((crop.top - crop.bottom) * fullH) / 2,
  };
}

/** Matriz que leva o quad unitário [-0.5, 0.5]² ao espaço de recorte do quadro de saída. */
export function layerMatrix(layer: Layer, frameW: number, frameH: number): Float32Array {
  const { quadW, quadH, offX, offY } = visibleGeometry(layer, frameW, frameH);
  const t = layer.transform;
  let m = scale(quadW, quadH);
  m = multiply3(translation(offX, offY), m);
  m = multiply3(rotation(t.rotation), m);
  m = multiply3(translation(t.x, t.y), m);
  return multiply3(pixelsToClip(frameW, frameH), m);
}

/** Coordenadas UV [u0, v0, u1, v1] da parte não cortada da textura (origem no canto superior esquerdo). */
export function cropUvRect(crop: Transform['crop']): [number, number, number, number] {
  return [crop.left, crop.top, 1 - crop.right, 1 - crop.bottom];
}

/** Quatro cantos da camada em px do quadro (origem no canto superior esquerdo), na ordem TL, TR, BR, BL. */
export function layerCorners(layer: Layer, frameW: number, frameH: number): [number, number][] {
  const m = layerMatrix(layer, frameW, frameH);
  const units: [number, number][] = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ];
  return units.map(([u, v]): [number, number] => {
    const [cx, cy] = transformPoint3(m, u, v);
    return [((cx + 1) * frameW) / 2, ((1 - cy) * frameH) / 2];
  });
}
