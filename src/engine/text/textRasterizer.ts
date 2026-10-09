// Rasterizador de texto em canvas 2D: fundo, sombra, contorno, preenchimento e sublinhado, com cache LRU.
// Roda na thread principal e no worker de exportação; não usa document/window sem checar.
import type { TextData, TextStyle } from '../../types/project';
import type { TextRasterizer } from '../../types/render';
import { fontEpoch } from './fontLoader';
import { layoutText, revealText, type TextLayout, type TextLine, type TextMeasure, type TextMeasured } from './textLayout';

/** Quantidade máxima de imagens de texto guardadas no cache. */
const CACHE_LIMIT = 32;
/** Deslocamento usado para desenhar o texto fora do quadro, deixando só a sombra visível. */
const SHADOW_SHIFT = 100_000;

/** Superfície de desenho: OffscreenCanvas quando existe, senão canvas do documento. */
type Surface = OffscreenCanvas | HTMLCanvasElement;
/** Contexto 2D de qualquer uma das superfícies. */
type Context = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
/** Pinta um trecho em (x, y) no contexto. */
type Painter = (text: string, x: number, y: number) => void;

/** Plano de desenho de um texto: o que aparece, onde e com quais medidas. */
interface Plan {
  /** true quando o contexto aceita ctx.letterSpacing; senão o espaçamento é feito letra a letra. */
  native: boolean;
  /** Estilo visual. */
  style: TextStyle;
  /** String de fonte do canvas. */
  font: string;
  /** Margem em volta do bloco, em px. */
  margin: number;
  /** Largura do bloco completo (maior linha), usada para alinhar. */
  boxWidth: number;
  /** Linhas visíveis (digitação), com a largura da linha completa. */
  lines: TextLine[];
  /** Mede um trecho com a fonte e o espaçamento do texto. */
  measure: (text: string) => number;
}

/** Limita um número ao intervalo 0 a 1 (NaN vira 1). */
function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

/** Cria a superfície de desenho do tamanho dado e o seu contexto 2D. */
function createSurface(width: number, height: number): { canvas: Surface; ctx: Context } {
  let canvas: Surface;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(width, height);
  } else if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
  } else {
    throw new Error('text-canvas-unavailable');
  }
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d') as Context | null;
  if (ctx === null) throw new Error('text-context-unavailable');
  return { canvas, ctx };
}

/** Diz se o contexto aceita espaçamento entre letras nativo. */
function supportsLetterSpacing(ctx: Context): boolean {
  return 'letterSpacing' in ctx;
}

/** Tamanho em px que aparece na string de fonte (ex.: 'italic 700 64px "Roboto"' → 64); 0 se não achar. */
function fontPixels(font: string): number {
  const match = /(\d+(?:\.\d+)?)px/.exec(font);
  return match === null ? 0 : Number(match[1]);
}

/** Ascendente e descendente do navegador; sem eles, usa 0.8 e 0.2 do tamanho da fonte. */
function verticalMetrics(metrics: TextMetrics, font: string): { ascent: number; descent: number } {
  const source: { fontBoundingBoxAscent?: number; fontBoundingBoxDescent?: number; actualBoundingBoxAscent?: number; actualBoundingBoxDescent?: number } = metrics;
  const size = fontPixels(font);
  const ascent = source.fontBoundingBoxAscent ?? source.actualBoundingBoxAscent ?? size * 0.8;
  const descent = source.fontBoundingBoxDescent ?? source.actualBoundingBoxDescent ?? size * 0.2;
  return { ascent, descent };
}

/** Cria a função de medida sobre um contexto de medição. */
function createMeasure(ctx: Context, native: boolean): TextMeasure {
  return (text, font, spacing): TextMeasured => {
    ctx.font = font;
    if (native) ctx.letterSpacing = `${spacing}px`;
    const metrics = ctx.measureText(text);
    const width = native || spacing === 0 ? metrics.width : metrics.width + spacing * Array.from(text).length;
    return { width, ...verticalMetrics(metrics, font) };
  };
}

/** Pinta um trecho com o espaçamento do plano; sem espaçamento nativo, pinta letra a letra. */
function drawRun(ctx: Context, plan: Plan, text: string, x: number, y: number, paint: Painter): void {
  const spacing = plan.style.letterSpacing;
  if (plan.native || spacing === 0) {
    paint(text, x, y);
    return;
  }
  let cursor = x;
  for (const char of Array.from(text)) {
    paint(char, cursor, y);
    cursor += ctx.measureText(char).width + spacing;
  }
}

/** Posição horizontal de uma linha dentro do bloco, pelo alinhamento. */
function lineX(plan: Plan, line: TextLine): number {
  const free = plan.boxWidth - line.width;
  if (plan.style.align === 'center') return plan.margin + free / 2;
  if (plan.style.align === 'right') return plan.margin + free;
  return plan.margin;
}

/** Adiciona ao caminho atual um retângulo com cantos arredondados. */
function addRoundRect(ctx: Context, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/** Desenha o fundo: um retângulo arredondado atrás de cada linha, na altura da própria linha. */
function drawBackground(ctx: Context, plan: Plan): void {
  const { style, margin } = plan;
  const pad = style.fontSize * 0.25;
  ctx.save();
  ctx.globalAlpha = clamp01(style.backgroundOpacity);
  ctx.fillStyle = style.backgroundColor;
  ctx.beginPath();
  plan.lines.forEach((line) => {
    const top = margin + line.top;
    addRoundRect(ctx, lineX(plan, line) - pad, top - pad, line.width + pad * 2, line.height + pad * 2, style.fontSize * 0.2);
  });
  ctx.fill();
  ctx.restore();
}

/** Desenha só a sombra: o texto vai para fora do quadro e o deslocamento o traz de volta como sombra. */
function drawShadow(ctx: Context, plan: Plan, baselines: number[]): void {
  const { style } = plan;
  ctx.save();
  ctx.shadowColor = style.shadowColor;
  ctx.shadowBlur = style.shadowBlur;
  ctx.shadowOffsetX = style.shadowOffsetX + SHADOW_SHIFT;
  ctx.shadowOffsetY = style.shadowOffsetY;
  ctx.fillStyle = style.color;
  plan.lines.forEach((line, index) => {
    const y = baselines[index] ?? 0;
    drawRun(ctx, plan, line.text, lineX(plan, line) - SHADOW_SHIFT, y, (t, x, py) => ctx.fillText(t, x, py));
  });
  ctx.restore();
}

/** Desenha o contorno (antes do preenchimento, para o miolo ficar por cima). */
function drawStroke(ctx: Context, plan: Plan, baselines: number[]): void {
  const { style } = plan;
  ctx.save();
  ctx.strokeStyle = style.strokeColor;
  ctx.lineWidth = style.strokeWidth * 2;
  ctx.lineJoin = 'round';
  plan.lines.forEach((line, index) => {
    const y = baselines[index] ?? 0;
    drawRun(ctx, plan, line.text, lineX(plan, line), y, (t, x, py) => ctx.strokeText(t, x, py));
  });
  ctx.restore();
}

/** Desenha o preenchimento do texto. */
function drawFill(ctx: Context, plan: Plan, baselines: number[]): void {
  const { style } = plan;
  ctx.save();
  ctx.fillStyle = style.color;
  plan.lines.forEach((line, index) => {
    const y = baselines[index] ?? 0;
    drawRun(ctx, plan, line.text, lineX(plan, line), y, (t, x, py) => ctx.fillText(t, x, py));
  });
  ctx.restore();
}

/** Desenha um sublinhado por linha, com espessura de fontSize/14, logo abaixo da linha de base. */
function drawUnderline(ctx: Context, plan: Plan, baselines: number[]): void {
  const { style } = plan;
  const thickness = style.fontSize / 14;
  ctx.save();
  ctx.fillStyle = style.color;
  plan.lines.forEach((line, index) => {
    const y = (baselines[index] ?? 0) + style.fontSize * 0.12;
    ctx.fillRect(lineX(plan, line), y, plan.measure(line.text), thickness);
  });
  ctx.restore();
}

/** Desenha o bloco inteiro na ordem: fundo, sombra, contorno, preenchimento e sublinhado. */
function drawBlock(ctx: Context, plan: Plan): void {
  const { style } = plan;
  const baselines = plan.lines.map((line) => plan.margin + line.baseline);
  ctx.font = plan.font;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  if (plan.native) ctx.letterSpacing = `${style.letterSpacing}px`;

  if (style.backgroundOpacity > 0) drawBackground(ctx, plan);
  if (style.shadowBlur > 0 || style.shadowOffsetX !== 0 || style.shadowOffsetY !== 0) {
    drawShadow(ctx, plan, baselines);
  }
  if (style.strokeWidth > 0) drawStroke(ctx, plan, baselines);
  drawFill(ctx, plan, baselines);
  if (style.underline) drawUnderline(ctx, plan, baselines);
}

/** Layout e margem de um texto. A margem inclui meio contorno extra, para o contorno nunca ser cortado. */
function describe(data: TextData, measure: TextMeasure): { layout: TextLayout; margin: number } {
  const layout = layoutText(data, measure);
  return { layout, margin: layout.padding + Math.max(0, data.style.strokeWidth) / 2 };
}

/** Tamanho da imagem de um layout: bloco mais a margem dos dois lados, em px inteiros (mínimo 1). */
function imageSize(layout: TextLayout, margin: number): { width: number; height: number } {
  return {
    width: Math.max(1, Math.ceil(layout.width + margin * 2)),
    height: Math.max(1, Math.ceil(layout.height + margin * 2)),
  };
}

/** Desenha um texto numa superfície nova, já cortado pelo reveal. */
function paintText(data: TextData, reveal: number, native: boolean, measure: TextMeasure): Surface {
  const { layout, margin } = describe(data, measure);
  const size = imageSize(layout, margin);
  const { canvas, ctx } = createSurface(size.width, size.height);
  const font = layout.font;
  drawBlock(ctx, {
    native,
    style: data.style,
    font,
    margin,
    boxWidth: layout.width,
    lines: revealText(layout.lines, reveal),
    measure: (text) => measure(text, font, data.style.letterSpacing).width,
  });
  return canvas;
}

/** Cria o rasterizador de texto: OffscreenCanvas quando existe, senão canvas do documento. Cada imagem sai no tamanho natural do texto. */
export function createTextRasterizer(): TextRasterizer {
  const scratch = createSurface(1, 1);
  const native = supportsLetterSpacing(scratch.ctx);
  const measure = createMeasure(scratch.ctx, native);
  const cache = new Map<string, Surface>();

  return {
    rasterize(data, reveal) {
      const amount = clamp01(reveal);
      const key = JSON.stringify([data.style, data.content, data.maxWidth ?? null, Math.round(amount * 100) / 100, fontEpoch()]);
      const hit = cache.get(key);
      if (hit !== undefined) {
        cache.delete(key);
        cache.set(key, hit);
        return hit;
      }
      const image = paintText(data, amount, native, measure);
      cache.set(key, image);
      if (cache.size > CACHE_LIMIT) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      return image;
    },
    measure(data) {
      const { layout, margin } = describe(data, measure);
      return imageSize(layout, margin);
    },
    dispose() {
      cache.clear();
    },
  };
}
