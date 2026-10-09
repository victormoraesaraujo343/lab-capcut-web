// Geometria pura das formas: tamanho do quadro (com contorno), pontos da seta e caminho do retângulo arredondado.
// Sem canvas, sem DOM: testável e igual na thread principal e no worker.
import type { ShapeData } from '../../types/project';

/** Espessura mínima, em px, da caixa de seta e de linha (cabe a ponta). */
const MIN_LINEAR_THICKNESS = 40;
/** Múltiplo da espessura do contorno usado para a caixa de seta e de linha. */
const LINEAR_THICKNESS_FACTOR = 3;
/** Fração da espessura ocupada pelo corpo da seta (a metade da espessura total do corpo, para cada lado). */
const SHAFT_RATIO = 0.2;
/** Comprimento da ponta da seta, em múltiplos da espessura. */
const HEAD_RATIO = 1.2;

/** Tamanho do quadro onde a forma é desenhada: inclui a margem do contorno em volta. */
export interface ShapeCanvasSize {
  /** Largura do quadro em px inteiros. */
  width: number;
  /** Altura do quadro em px inteiros. */
  height: number;
  /** Margem em volta da forma, metade do contorno arredondada para cima. */
  pad: number;
}

/** Comando de caminho, interpretado pelo rasterizador (move, linha, arco ou fecha). */
export type PathCommand =
  | { type: 'move'; x: number; y: number }
  | { type: 'line'; x: number; y: number }
  | { type: 'arc'; x: number; y: number; radius: number; startAngle: number; endAngle: number }
  | { type: 'close' };

/** Número finito e não negativo; qualquer outro valor vira 0. */
function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Espessura da caixa de seta e de linha: 3 vezes o contorno, com mínimo de 40 px. */
export function linearThickness(strokeWidth: number): number {
  return Math.max(nonNegative(strokeWidth) * LINEAR_THICKNESS_FACTOR, MIN_LINEAR_THICKNESS);
}

/** Caixa da forma sem o contorno, em px inteiros (mínimo 1). Seta e linha: comprimento em width e espessura de linearThickness. */
export function contentBox(shape: ShapeData): { width: number; height: number } {
  const width = Math.max(1, Math.round(nonNegative(shape.width)));
  if (shape.shape === 'arrow' || shape.shape === 'line') {
    return { width, height: Math.max(1, Math.ceil(linearThickness(shape.strokeWidth))) };
  }
  return { width, height: Math.max(1, Math.round(nonNegative(shape.height))) };
}

/** Tamanho do quadro da forma, com a margem do contorno em volta da caixa de contentBox. */
export function shapeCanvasSize(shape: ShapeData): ShapeCanvasSize {
  const pad = Math.ceil(nonNegative(shape.strokeWidth) / 2);
  const box = contentBox(shape);
  return { width: box.width + pad * 2, height: box.height + pad * 2, pad };
}

/**
 * Pontos do polígono da seta (corpo + ponta triangular), numa caixa de `length` × `thickness` que começa em (0, 0).
 * A ponta ocupa a espessura inteira; o corpo fica centralizado verticalmente.
 */
export function arrowPoints(length: number, thickness: number): [number, number][] {
  const len = nonNegative(length);
  const thick = nonNegative(thickness);
  const mid = thick / 2;
  const shaft = thick * SHAFT_RATIO;
  const head = Math.min(thick * HEAD_RATIO, len * 0.5);
  const base = len - head;
  return [
    [0, mid - shaft],
    [base, mid - shaft],
    [base, 0],
    [len, mid],
    [base, thick],
    [base, mid + shaft],
    [0, mid + shaft],
  ];
}

/**
 * Caminho de um retângulo com cantos arredondados, como lista de comandos.
 * O raio é limitado a metade do menor lado; raio 0 vira canto reto.
 */
export function roundedRectCommands(x: number, y: number, width: number, height: number, radius: number): PathCommand[] {
  const r = Math.max(0, Math.min(nonNegative(radius), width / 2, height / 2));
  const right = x + width;
  const bottom = y + height;
  const quarter = Math.PI / 2;
  return [
    { type: 'move', x: x + r, y },
    { type: 'line', x: right - r, y },
    { type: 'arc', x: right - r, y: y + r, radius: r, startAngle: -quarter, endAngle: 0 },
    { type: 'line', x: right, y: bottom - r },
    { type: 'arc', x: right - r, y: bottom - r, radius: r, startAngle: 0, endAngle: quarter },
    { type: 'line', x: x + r, y: bottom },
    { type: 'arc', x: x + r, y: bottom - r, radius: r, startAngle: quarter, endAngle: Math.PI },
    { type: 'line', x, y: y + r },
    { type: 'arc', x: x + r, y: y + r, radius: r, startAngle: Math.PI, endAngle: Math.PI + quarter },
    { type: 'close' },
  ];
}
