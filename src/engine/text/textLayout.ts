// Layout puro de texto: quebra de linhas, medidas, margem para contorno/sombra/fundo e corte da digitação.
import type { TextData, TextStyle } from '../../types/project';

/** Uma linha já medida e posicionada. Todas as posições são em px do projeto, sem a margem de desenho. */
export interface TextLine {
  /** Conteúdo da linha, sem quebra de linha. */
  text: string;
  /** Largura da linha em px do projeto, já com o espaçamento entre letras. */
  width: number;
  /** Distância do topo do bloco até o topo desta linha. */
  top: number;
  /** Altura desta linha: no mínimo fontSize × lineHeight, ou ascendente + descendente se for maior. */
  height: number;
  /** Distância do topo do bloco até a linha de base desta linha. */
  baseline: number;
}

/** Resultado do layout de um texto, em px do projeto, sem a margem de desenho. */
export interface TextLayout {
  /** Linhas do texto, na ordem em que aparecem. */
  lines: TextLine[];
  /** Maior largura entre as linhas. */
  width: number;
  /** Soma da altura de todas as linhas. */
  height: number;
  /** Margem em volta do bloco para fundo, contorno e sombra não serem cortados. */
  padding: number;
  /** String de fonte do canvas, ex.: 'italic 700 96px "Inter"'. */
  font: string;
}

/** Medidas de um trecho, em px: largura, ascendente (acima da linha de base) e descendente (abaixo). */
export interface TextMeasured {
  /** Largura em px, já com o espaçamento entre letras. */
  width: number;
  /** Altura acima da linha de base. */
  ascent: number;
  /** Altura abaixo da linha de base. */
  descent: number;
}

/** Mede um trecho: (texto, fonte CSS, espaçamento entre letras em px) → largura e métricas verticais em px. */
export type TextMeasure = (text: string, font: string, letterSpacingPx: number) => TextMeasured;

/** Monta a string de fonte do canvas a partir do estilo, ex.: 'italic 700 96px "Inter"'. */
export function fontString(style: TextStyle): string {
  const family = style.fontFamily.replace(/["\\]/g, '');
  const parts = [style.italic ? 'italic' : '', style.bold ? '700' : '400', `${style.fontSize}px`, `"${family}"`];
  return parts.filter((part) => part !== '').join(' ');
}

/** Margem necessária para o fundo (quando visível), o contorno, o desfoque e o deslocamento da sombra. */
export function textPadding(style: TextStyle): number {
  const background = style.backgroundOpacity > 0 ? style.fontSize * 0.25 : 0;
  const stroke = Math.max(0, style.strokeWidth) / 2;
  const blur = Math.max(0, style.shadowBlur);
  const offset = Math.max(Math.abs(style.shadowOffsetX), Math.abs(style.shadowOffsetY));
  return background + stroke + blur + offset;
}

/**
 * Quebra um parágrafo em palavras para nenhuma linha passar de maxWidth. Palavra maior que a largura fica sozinha numa linha.
 * Os espaços só somem nas quebras; as palavras nunca são cortadas.
 */
export function wrapParagraph(paragraph: string, maxWidth: number, widthOf: (text: string) => number): string[] {
  const [first = '', ...rest] = paragraph.split(' ');
  const rows: string[] = [];
  let current: string = first;
  for (const word of rest) {
    const candidate: string = `${current} ${word}`;
    if (widthOf(candidate) <= maxWidth) {
      current = candidate;
    } else {
      rows.push(current);
      current = word;
    }
  }
  rows.push(current);
  return rows;
}

/** Quebra o texto em '\n' e, com maxWidth, também por palavras; mede cada linha e posiciona a linha de base para o glifo caber na altura da linha. */
export function layoutText(data: TextData, measure: TextMeasure): TextLayout {
  const { style } = data;
  const font = fontString(style);
  const lines: TextLine[] = [];
  const limit = data.maxWidth;
  const wrapAt = limit !== undefined && Number.isFinite(limit) && limit > 0 ? limit : null;
  const widthOf = (text: string): number => measure(text, font, style.letterSpacing).width;
  const segments = data.content
    .split('\n')
    .flatMap((paragraph) => (wrapAt === null ? [paragraph] : wrapParagraph(paragraph, wrapAt, widthOf)));
  let top = 0;
  for (const text of segments) {
    const { width, ascent, descent } = measure(text, font, style.letterSpacing);
    const height = Math.max(style.fontSize * style.lineHeight, ascent + descent);
    const baseline = top + (height - (ascent + descent)) / 2 + ascent;
    lines.push({ text, width, top, height, baseline });
    top += height;
  }
  const width = lines.reduce((max, line) => Math.max(max, line.width), 0);
  return { lines, width, height: top, padding: textPadding(style), font };
}

/**
 * Corta o texto para a digitação: mostra a fração 'reveal' (0 a 1) dos caracteres do total, contando do início.
 * A largura de cada linha continua a do texto completo, para o bloco não se mexer enquanto digita.
 */
export function revealText(lines: TextLine[], reveal: number): TextLine[] {
  const amount = Number.isFinite(reveal) ? Math.min(1, Math.max(0, reveal)) : 1;
  const total = lines.reduce((sum, line) => sum + Array.from(line.text).length, 0);
  let budget = Math.floor(amount * total);
  return lines.map((line) => {
    const chars = Array.from(line.text);
    const take = Math.min(budget, chars.length);
    budget -= take;
    return { ...line, text: chars.slice(0, take).join('') };
  });
}
