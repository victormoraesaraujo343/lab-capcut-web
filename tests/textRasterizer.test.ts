// Testes do rasterizador de texto com canvas falso: cache por época de fonte, largura máxima e opacidade só no compositor.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultTextStyle } from '../src/engine/text/defaultTextStyle';
import { ensureFont, fontEpoch } from '../src/engine/text/fontLoader';
import { createTextRasterizer } from '../src/engine/text/textRasterizer';
import type { TextData } from '../src/types/project';

/** Alphas (globalAlpha) de cada fillText/strokeText desenhado pelo canvas falso. */
let paintedAlphas: number[] = [];

/** Contexto 2D falso: mede 10 px por caractere e registra a opacidade de cada pintura. */
class FakeContext {
  font = '';
  letterSpacing = '0px';
  globalAlpha = 1;
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 0;
  lineJoin = '';
  textBaseline = '';
  textAlign = '';
  shadowColor = '';
  shadowBlur = 0;
  shadowOffsetX = 0;
  shadowOffsetY = 0;

  /** Mede o texto: 10 px por caractere, com métricas verticais de uma fonte de 64 px. */
  measureText(text: string): { width: number; fontBoundingBoxAscent: number; fontBoundingBoxDescent: number } {
    return { width: Array.from(text).length * 10, fontBoundingBoxAscent: 70, fontBoundingBoxDescent: 20 };
  }

  /** Pinta texto preenchido e guarda a opacidade usada. */
  fillText(): void {
    paintedAlphas.push(this.globalAlpha);
  }

  /** Pinta o contorno e guarda a opacidade usada. */
  strokeText(): void {
    paintedAlphas.push(this.globalAlpha);
  }

  /** Operações sem efeito para a análise. */
  save(): void {}
  restore(): void {}
  beginPath(): void {}
  moveTo(): void {}
  arcTo(): void {}
  closePath(): void {}
  fill(): void {}
  fillRect(): void {}
}

/** Superfície falsa: guarda largura, altura e um contexto próprio. */
class FakeSurface {
  width: number;
  height: number;
  readonly context = new FakeContext();

  /** Cria a superfície no tamanho dado. */
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  /** Devolve o contexto 2D falso. */
  getContext(): FakeContext {
    return this.context;
  }
}

/** FontFace falso que sempre carrega. */
class FakeFontFace {
  readonly family: string;
  readonly source: string;

  /** Guarda família e origem. */
  constructor(family: string, source: string) {
    this.family = family;
    this.source = source;
  }

  /** Carregamento sempre bem-sucedido. */
  load(): Promise<FakeFontFace> {
    return Promise.resolve(this);
  }
}

/** Texto de teste com o estilo dado. */
function makeText(overrides: Partial<TextData> = {}): TextData {
  return { content: 'aaa', style: defaultTextStyle(), ...overrides };
}

describe('createTextRasterizer', () => {
  let fontSet: { add: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    paintedAlphas = [];
    fontSet = { add: vi.fn() };
    vi.stubGlobal('OffscreenCanvas', FakeSurface);
    vi.stubGlobal('FontFace', FakeFontFace);
    vi.stubGlobal('fonts', fontSet);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.endsWith('fonts/fonts.json')) {
          return new Response(JSON.stringify([{ family: 'Inter', category: 'sans', license: 'OFL', files: { '400': 'Inter.ttf' } }]));
        }
        return new Response('', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reutiliza a imagem do cache quando nada mudou', () => {
    const rasterizer = createTextRasterizer();
    const first = rasterizer.rasterize(makeText(), 1);
    expect(rasterizer.rasterize(makeText(), 1)).toBe(first);
  });

  it('refaz a imagem quando uma fonte nova é registrada, para o texto sair na fonte certa', async () => {
    const rasterizer = createTextRasterizer();
    const before = rasterizer.rasterize(makeText(), 1);
    const epochBefore = fontEpoch();
    expect(await ensureFont('Inter', false, 'https://app.test/')).toBe(true);
    expect(fontEpoch()).toBe(epochBefore + 1);
    const after = rasterizer.rasterize(makeText(), 1);
    expect(after).not.toBe(before);
    expect(fontSet.add).toHaveBeenCalledTimes(1);
  });

  it('refaz a imagem quando a largura máxima muda', () => {
    const rasterizer = createTextRasterizer();
    const wide = rasterizer.rasterize(makeText({ content: 'aaa bbb ccc' }), 1);
    const narrow = rasterizer.rasterize(makeText({ content: 'aaa bbb ccc', maxWidth: 75 }), 1);
    expect(narrow).not.toBe(wide);
    expect(narrow.height).toBeGreaterThan(wide.height);
  });

  it('desenha tudo com alpha 1: a opacidade do estilo fica só no compositor', () => {
    const rasterizer = createTextRasterizer();
    const style = { ...defaultTextStyle(), opacity: 0.5, strokeWidth: 4, shadowBlur: 2, shadowOffsetX: 3, backgroundOpacity: 0 };
    rasterizer.rasterize(makeText({ style, content: 'ab' }), 1);
    expect(paintedAlphas.length).toBeGreaterThan(0);
    expect(paintedAlphas.every((alpha) => alpha === 1)).toBe(true);
  });
});
