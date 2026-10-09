// Testes do layout de texto: quebra de linhas, largura e altura, margem de desenho, corte da digitação e string de fonte.
import { describe, expect, it } from 'vitest';
import { fontString, layoutText, revealText, textPadding, wrapParagraph, type TextLine, type TextMeasure } from '../src/engine/text/textLayout';
import type { TextData, TextStyle } from '../src/types/project';

/** Estilo padrão para os testes: sem fundo, contorno, sombra nem sublinhado. */
function makeStyle(overrides: Partial<TextStyle> = {}): TextStyle {
  return {
    fontFamily: 'Inter',
    fontSize: 100,
    color: '#ffffff',
    bold: false,
    italic: false,
    underline: false,
    align: 'left',
    letterSpacing: 0,
    lineHeight: 1.2,
    strokeColor: '#000000',
    strokeWidth: 0,
    shadowColor: '#000000',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    backgroundColor: '#000000',
    backgroundOpacity: 0,
    opacity: 1,
    ...overrides,
  };
}

/** Texto de teste com o conteúdo e o estilo dados. */
function makeText(content: string, overrides: Partial<TextStyle> = {}): TextData {
  return { content, style: makeStyle(overrides) };
}

/** Medida fake: cada caractere vale 10 px, mais o espaçamento entre letras; sem métricas verticais. */
const measure: TextMeasure = (text, _font, spacing) => ({
  width: Array.from(text).length * (10 + spacing),
  ascent: 0,
  descent: 0,
});

/** Medida fake com ascendente 70 e descendente 20 px, como uma fonte de 64 px. */
const tallMeasure: TextMeasure = (text, _font, spacing) => ({
  width: Array.from(text).length * (10 + spacing),
  ascent: 70,
  descent: 20,
});

/** Linha de teste já posicionada, só com texto e largura. */
function line(text: string, width: number): TextLine {
  return { text, width, top: 0, height: 0, baseline: 0 };
}

describe('layoutText', () => {
  it('quebra só em \\n e mede cada linha', () => {
    const layout = layoutText(makeText('ab\nabcd\n'), measure);
    expect(layout.lines.map((line) => line.text)).toEqual(['ab', 'abcd', '']);
    expect(layout.lines.map((line) => line.width)).toEqual([20, 40, 0]);
  });

  it('usa a maior linha como largura e linhas × fontSize × lineHeight como altura', () => {
    const layout = layoutText(makeText('ab\nabcd', { fontSize: 50, lineHeight: 1.5 }), measure);
    expect(layout.width).toBe(40);
    expect(layout.height).toBe(2 * 50 * 1.5);
  });

  it('soma o espaçamento entre letras na largura medida', () => {
    const layout = layoutText(makeText('abc', { letterSpacing: 5 }), measure);
    expect(layout.width).toBe(45);
  });

  it('não tem margem quando não há fundo, contorno nem sombra', () => {
    expect(layoutText(makeText('oi'), measure).padding).toBe(0);
  });

  it('inclui o contorno pela metade, o desfoque e o maior deslocamento da sombra', () => {
    const padding = textPadding(
      makeStyle({ strokeWidth: 8, shadowBlur: 6, shadowOffsetX: -10, shadowOffsetY: 4 }),
    );
    expect(padding).toBe(4 + 6 + 10);
  });

  it('inclui um quarto do tamanho da fonte quando há fundo visível', () => {
    expect(textPadding(makeStyle({ fontSize: 200, backgroundOpacity: 0.5 }))).toBe(50);
    expect(textPadding(makeStyle({ fontSize: 200, backgroundOpacity: 0 }))).toBe(0);
  });

  it('soma fundo, contorno e sombra na margem do bloco', () => {
    const style = makeStyle({ fontSize: 100, backgroundOpacity: 1, strokeWidth: 4, shadowBlur: 2, shadowOffsetY: 3 });
    expect(layoutText({ content: 'x', style }, measure).padding).toBe(25 + 2 + 2 + 3);
  });

  it('monta a string de fonte com o peso e o itálico', () => {
    const layout = layoutText(makeText('x', { italic: true, bold: true, fontSize: 96 }), measure);
    expect(layout.font).toBe('italic 700 96px "Inter"');
  });

  it('dá à linha a altura do ascendente mais o descendente quando passa de fontSize × lineHeight', () => {
    const layout = layoutText(makeText('ab', { fontSize: 64, lineHeight: 1.2 }), tallMeasure);
    expect(layout.lines.map((current) => current.height)).toEqual([90]);
    expect(layout.height).toBe(90);
  });

  it('posiciona a linha de base em top + (altura − (ascendente + descendente)) / 2 + ascendente, somada ao padding', () => {
    const layout = layoutText(makeText('ab\ncd', { fontSize: 64, lineHeight: 1.2, shadowBlur: 6 }), tallMeasure);
    expect(layout.padding).toBe(6);
    expect(layout.lines.map((current) => layout.padding + current.baseline)).toEqual([6 + 70, 6 + 90 + 70]);
    expect(layout.lines.map((current) => current.top)).toEqual([0, 90]);
    expect(layout.height).toBe(180);
  });

  it('mantém cada glifo dentro da altura de cada linha, sem cortar o topo nem a base', () => {
    const layout = layoutText(makeText('ab\ncd', { fontSize: 64, lineHeight: 1.2 }), tallMeasure);
    for (const current of layout.lines) {
      expect(current.baseline - 70).toBeGreaterThanOrEqual(0);
      expect(current.baseline + 20).toBeLessThanOrEqual(layout.height);
    }
  });
});

describe('layoutText com maxWidth', () => {
  it('quebra por palavra quando a linha passaria de maxWidth', () => {
    const layout = layoutText({ ...makeText('aaa bbb ccc'), maxWidth: 75 }, measure);
    expect(layout.lines.map((current) => current.text)).toEqual(['aaa bbb', 'ccc']);
  });

  it('usa a maior linha como largura da imagem, não maxWidth', () => {
    const layout = layoutText({ ...makeText('aaa bbb ccc'), maxWidth: 75 }, measure);
    expect(layout.width).toBe(70);
  });

  it('deixa a palavra maior que a largura sozinha numa linha, sem cortá-la', () => {
    const layout = layoutText({ ...makeText('aa bbbbbbbbbb cc'), maxWidth: 50 }, measure);
    expect(layout.lines.map((current) => current.text)).toEqual(['aa', 'bbbbbbbbbb', 'cc']);
  });

  it('preserva as quebras de linha existentes e quebra cada parágrafo separadamente', () => {
    const layout = layoutText({ ...makeText('aaa bbb\nccc ddd eee\n\nfff'), maxWidth: 75 }, measure);
    expect(layout.lines.map((current) => current.text)).toEqual(['aaa bbb', 'ccc ddd', 'eee', '', 'fff']);
  });

  it('não quebra nada sem maxWidth', () => {
    const layout = layoutText(makeText('aaa bbb ccc'), measure);
    expect(layout.lines.map((current) => current.text)).toEqual(['aaa bbb ccc']);
  });

  it('o reveal continua contando caracteres na ordem, pelas linhas quebradas', () => {
    const layout = layoutText({ ...makeText('aaa bbb ccc'), maxWidth: 75 }, measure);
    // 10 caracteres no total (7 + 3); 0.5 × 10 = 5 visíveis: 'aaa b' e nada na segunda linha.
    expect(revealText(layout.lines, 0.5).map((current) => current.text)).toEqual(['aaa b', '']);
  });
});

describe('wrapParagraph', () => {
  it('devolve uma linha vazia para parágrafo vazio', () => {
    expect(wrapParagraph('', 50, (text) => text.length * 10)).toEqual(['']);
  });
});

describe('fontString', () => {
  it('usa 400 quando não é negrito e omite o itálico quando não há', () => {
    expect(fontString(makeStyle({ fontFamily: 'Roboto', fontSize: 40 }))).toBe('400 40px "Roboto"');
  });

  it('remove aspas do nome da família', () => {
    expect(fontString(makeStyle({ fontFamily: 'Odd"Name' }))).toBe('400 100px "OddName"');
  });
});

describe('revealText', () => {
  const lines = [line('abc', 30), line('de', 20)];

  it('mostra tudo com reveal 1 e nada com reveal 0', () => {
    expect(revealText(lines, 1).map((line) => line.text)).toEqual(['abc', 'de']);
    expect(revealText(lines, 0).map((line) => line.text)).toEqual(['', '']);
  });

  it('corta pelo total de caracteres, contando as linhas em sequência', () => {
    // 5 caracteres no total; 0.6 × 5 = 3 visíveis: 'abc' inteiro e nada na segunda linha.
    expect(revealText(lines, 0.6).map((line) => line.text)).toEqual(['abc', '']);
    // 0.8 × 5 = 4 visíveis: 'abc' e 'd'.
    expect(revealText(lines, 0.8).map((line) => line.text)).toEqual(['abc', 'd']);
  });

  it('mantém a largura de cada linha, para o bloco não se mexer', () => {
    expect(revealText(lines, 0.2).map((line) => line.width)).toEqual([30, 20]);
  });

  it('conta caracteres e não unidades de código', () => {
    const emoji = [line('😀😀', 20)];
    expect(revealText(emoji, 0.5).map((line) => line.text)).toEqual(['😀']);
  });

  it('limita o reveal ao intervalo de 0 a 1', () => {
    expect(revealText(lines, 3).map((line) => line.text)).toEqual(['abc', 'de']);
    expect(revealText(lines, -1).map((line) => line.text)).toEqual(['', '']);
  });
});
