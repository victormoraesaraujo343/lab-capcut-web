// Rasterizador de formas em canvas 2D: retângulo arredondado, elipse, seta e linha, com preenchimento e contorno.
// Mesmo desenho na prévia e na exportação (thread principal ou worker), com cache LRU por forma.
import type { ShapeData } from '../../types/project';
import { arrowPoints, contentBox, roundedRectCommands, shapeCanvasSize, type PathCommand } from './shapeGeometry';

/** Quantidade máxima de imagens de forma guardadas no cache. */
const CACHE_LIMIT = 32;

/** Superfície de desenho: OffscreenCanvas quando existe, senão canvas do documento. */
type Surface = OffscreenCanvas | HTMLCanvasElement;
/** Contexto 2D de qualquer uma das superfícies. */
type Context = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/** Rasterizador de formas: desenha cada forma num canvas próprio, no tamanho natural dela. */
export interface ShapeRasterizer {
  /** Imagem da forma com contorno incluído; a mesma forma reutiliza a imagem do cache. */
  rasterize(shape: ShapeData): Surface;
  /** Tamanho natural (px do projeto), com contorno, sem desenhar. */
  measure(shape: ShapeData): { width: number; height: number };
  /** Libera o cache de imagens. */
  dispose(): void;
}

/** Cria a superfície de desenho do tamanho dado e o seu contexto 2D. */
function createSurface(width: number, height: number): { canvas: Surface; ctx: Context } {
  let canvas: Surface;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(width, height);
  } else if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
  } else {
    throw new Error('shape-canvas-unavailable');
  }
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d') as Context | null;
  if (ctx === null) throw new Error('shape-context-unavailable');
  return { canvas, ctx };
}

/** Cor pintável: vazio ou 'transparent' significa sem pintura. */
function paintable(color: string): string | null {
  const value = color.trim();
  return value === '' || value.toLowerCase() === 'transparent' ? null : value;
}

/** Aplica uma lista de comandos de caminho ao caminho atual do contexto. */
function applyPath(ctx: Context, commands: PathCommand[]): void {
  for (const command of commands) {
    if (command.type === 'move') ctx.moveTo(command.x, command.y);
    else if (command.type === 'line') ctx.lineTo(command.x, command.y);
    else if (command.type === 'arc') ctx.arc(command.x, command.y, command.radius, command.startAngle, command.endAngle);
    else ctx.closePath();
  }
}

/** Preenche e/ou contorna o caminho atual, conforme as cores e a espessura da forma. */
function paintPath(ctx: Context, shape: ShapeData): void {
  const fill = paintable(shape.fill);
  const stroke = paintable(shape.stroke);
  const lineWidth = Number.isFinite(shape.strokeWidth) ? Math.max(0, shape.strokeWidth) : 0;
  if (fill !== null) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke !== null && lineWidth > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

/** Desenha um retângulo arredondado ou uma elipse dentro da margem do contorno. */
function paintBox(ctx: Context, shape: ShapeData, pad: number): void {
  const { width, height } = contentBox(shape);
  ctx.beginPath();
  if (shape.shape === 'circle') {
    ctx.ellipse(pad + width / 2, pad + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
  } else {
    applyPath(ctx, roundedRectCommands(pad, pad, width, height, shape.cornerRadius));
  }
  paintPath(ctx, shape);
}

/** Desenha uma seta: polígono de corpo e ponta, preenchido e com contorno. */
function paintArrow(ctx: Context, shape: ShapeData, pad: number): void {
  const { width, height } = contentBox(shape);
  const points = arrowPoints(width, height);
  ctx.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) ctx.moveTo(pad + x, pad + y);
    else ctx.lineTo(pad + x, pad + y);
  });
  ctx.closePath();
  paintPath(ctx, shape);
}

/** Desenha uma linha reta com pontas arredondadas, no meio da caixa de altura de linearThickness. */
function paintLine(ctx: Context, shape: ShapeData, pad: number): void {
  const { width, height } = contentBox(shape);
  const mid = pad + height / 2;
  const stroke = paintable(shape.stroke);
  const lineWidth = Number.isFinite(shape.strokeWidth) ? Math.max(0, shape.strokeWidth) : 0;
  if (stroke === null || lineWidth <= 0) return;
  ctx.beginPath();
  ctx.moveTo(pad, mid);
  ctx.lineTo(pad + width, mid);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** Desenha a forma inteira numa superfície nova, no tamanho dado por shapeCanvasSize. */
function paintShape(shape: ShapeData): Surface {
  const size = shapeCanvasSize(shape);
  const { canvas, ctx } = createSurface(size.width, size.height);
  if (shape.shape === 'arrow') paintArrow(ctx, shape, size.pad);
  else if (shape.shape === 'line') paintLine(ctx, shape, size.pad);
  else paintBox(ctx, shape, size.pad);
  return canvas;
}

/** Cria o rasterizador de formas. A superfície só é criada no primeiro desenho; a medida não precisa de canvas. */
export function createShapeRasterizer(): ShapeRasterizer {
  const cache = new Map<string, Surface>();

  return {
    rasterize(shape) {
      const key = JSON.stringify(shape);
      const hit = cache.get(key);
      if (hit !== undefined) {
        cache.delete(key);
        cache.set(key, hit);
        return hit;
      }
      const image = paintShape(shape);
      cache.set(key, image);
      if (cache.size > CACHE_LIMIT) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      return image;
    },
    measure(shape) {
      const size = shapeCanvasSize(shape);
      return { width: size.width, height: size.height };
    },
    dispose() {
      cache.clear();
    },
  };
}
