// Testes do carregamento de fontes: embutidas por URL local, Google sob demanda, falhas, memoização e parser do CSS do Google.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { googleFontCssUrl, pickFontFileUrl } from '../src/engine/text/googleFonts';
import type { Project } from '../src/types/project';

const BASE = 'https://app.test/';

/** Manifesto de teste com uma família de dois pesos e uma só com 400. */
const MANIFEST = [
  { family: 'Inter', category: 'sans', license: 'OFL', files: { '400': 'Inter-Regular.ttf', '700': 'Inter-Bold.ttf' } },
  { family: 'Michroma', category: 'display', license: 'OFL', files: { '400': 'Michroma-Regular.ttf' } },
];

/** CSS de exemplo do Google: primeiro o bloco latin-ext, depois o latin. */
const GOOGLE_CSS = `
/* latin-ext */
@font-face {
  font-family: 'Lobster';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/lobster/v1/ext.woff2) format('woff2');
  unicode-range: U+0100-024F;
}
/* latin */
@font-face {
  font-family: 'Lobster';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/lobster/v1/latin.woff2) format('woff2');
  unicode-range: U+0000-00FF;
}
`;

/** Registro de um FontFace criado pelo teste. */
interface FakeFace {
  family: string;
  source: string;
  weight: string;
  fail: boolean;
}

const created: FakeFace[] = [];
let failLoad = false;

/** FontFace falso: guarda o que foi pedido e falha no load quando o teste manda. */
class FakeFontFace {
  readonly family: string;
  readonly source: string;
  readonly weight: string;

  /** Cria o registro e lembra dele para as asserções. */
  constructor(family: string, source: string, descriptors: { weight: string }) {
    this.family = family;
    this.source = source;
    this.weight = descriptors.weight;
    created.push({ family, source, weight: descriptors.weight, fail: failLoad });
  }

  /** Carrega o arquivo: rejeita se o teste pediu falha. */
  load(): Promise<FakeFontFace> {
    return failLoad ? Promise.reject(new Error('load-failed')) : Promise.resolve(this);
  }
}

/** Projeto de teste com clipes de texto nas fontes dadas. */
function projectWithFonts(fonts: Array<{ family: string; bold: boolean }>): Project {
  const clips = fonts.map((font, index) => ({
    id: `c${index}`,
    text: { content: 'x', style: { fontFamily: font.family, bold: font.bold } },
  }));
  return { tracks: [{ id: 't1', clips }, { id: 't2', clips: [{ id: 'v1' }] }] } as unknown as Project;
}

describe('fontLoader', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let fontSet: { add: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.resetModules();
    created.length = 0;
    failLoad = false;
    fontSet = { add: vi.fn() };
    vi.stubGlobal('FontFace', FakeFontFace);
    vi.stubGlobal('fonts', fontSet);
    fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith('fonts/fonts.json')) return new Response(JSON.stringify(MANIFEST));
      if (url.startsWith('https://fonts.googleapis.com/')) return new Response(GOOGLE_CSS);
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('carrega uma família embutida pela URL local, no peso 400', async () => {
    const { ensureFont } = await import('../src/engine/text/fontLoader');
    expect(await ensureFont('Inter', false, BASE)).toBe(true);
    expect(created).toEqual([
      { family: 'Inter', source: 'url("https://app.test/fonts/Inter-Regular.ttf")', weight: '400', fail: false },
    ]);
    expect(fontSet.add).toHaveBeenCalledTimes(1);
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('googleapis'))).toBe(false);
  });

  it('usa o arquivo em negrito quando a família tem 700', async () => {
    const { ensureFont } = await import('../src/engine/text/fontLoader');
    expect(await ensureFont('Inter', true, BASE)).toBe(true);
    expect(created[0]).toMatchObject({ source: 'url("https://app.test/fonts/Inter-Bold.ttf")', weight: '700' });
  });

  it('usa o arquivo regular com peso 400 quando a família não tem negrito', async () => {
    const { ensureFont } = await import('../src/engine/text/fontLoader');
    expect(await ensureFont('Michroma', true, BASE)).toBe(true);
    expect(created[0]).toMatchObject({ source: 'url("https://app.test/fonts/Michroma-Regular.ttf")', weight: '400' });
  });

  it('busca no Google Fonts uma família que não é embutida', async () => {
    const { ensureFont } = await import('../src/engine/text/fontLoader');
    expect(await ensureFont('Lobster', false, BASE)).toBe(true);
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).toContain('https://fonts.googleapis.com/css2?family=Lobster:wght@400&display=swap');
    expect(created[0]).toMatchObject({
      family: 'Lobster',
      source: 'url("https://fonts.gstatic.com/s/lobster/v1/latin.woff2")',
      weight: '400',
    });
  });

  it('devolve false quando o Google falha, sem lançar erro', async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError('offline');
    });
    const { ensureFont } = await import('../src/engine/text/fontLoader');
    expect(await ensureFont('Lobster', false, BASE)).toBe(false);
    expect(fontSet.add).not.toHaveBeenCalled();
  });

  it('devolve false quando o arquivo não carrega', async () => {
    failLoad = true;
    const { ensureFont } = await import('../src/engine/text/fontLoader');
    expect(await ensureFont('Inter', false, BASE)).toBe(false);
    expect(fontSet.add).not.toHaveBeenCalled();
  });

  it('memoiza por família e peso: uma só carga e uma só ida ao manifesto', async () => {
    const { ensureFont } = await import('../src/engine/text/fontLoader');
    const [first, second] = await Promise.all([ensureFont('Inter', false, BASE), ensureFont('Inter', false, BASE)]);
    expect(await ensureFont('Inter', false, BASE)).toBe(true);
    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(created).toHaveLength(1);
    expect(fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('fonts.json'))).toHaveLength(1);
  });

  it('carrega as fontes usadas pelos clipes de texto do projeto, sem repetir', async () => {
    const { ensureProjectFonts } = await import('../src/engine/text/fontLoader');
    const project = projectWithFonts([
      { family: 'Inter', bold: false },
      { family: 'Inter', bold: false },
      { family: 'Inter', bold: true },
    ]);
    await ensureProjectFonts(project, BASE);
    expect(created.map((face) => `${face.family}:${face.weight}`).sort()).toEqual(['Inter:400', 'Inter:700']);
  });

  it('tenta de novo uma família que falhou na rede, em vez de guardar o false', async () => {
    let offline = true;
    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = String(input);
      if (url.startsWith('https://fonts.googleapis.com/')) {
        if (offline) throw new TypeError('offline');
        return new Response(GOOGLE_CSS);
      }
      if (url.endsWith('fonts/fonts.json')) return new Response(JSON.stringify(MANIFEST));
      return new Response('', { status: 404 });
    });
    const { ensureFont } = await import('../src/engine/text/fontLoader');
    expect(await ensureFont('Lobster', false, BASE)).toBe(false);
    offline = false;
    expect(await ensureFont('Lobster', false, BASE)).toBe(true);
    expect(created).toHaveLength(1);
  });

  it('não guarda a falha do manifesto: a próxima chamada busca de novo', async () => {
    fetchMock.mockImplementationOnce(async () => new Response('', { status: 500 }));
    const { loadBundledFontManifest } = await import('../src/engine/text/fontLoader');
    await expect(loadBundledFontManifest(BASE)).rejects.toThrow('font-manifest-failed');
    expect(await loadBundledFontManifest(BASE)).toHaveLength(MANIFEST.length);
  });

  it('sobe a época de fontes só quando uma FontFace é registrada com sucesso', async () => {
    const { ensureFont, fontEpoch } = await import('../src/engine/text/fontLoader');
    const before = fontEpoch();
    failLoad = true;
    expect(await ensureFont('Michroma', false, BASE)).toBe(false);
    expect(fontEpoch()).toBe(before);
    failLoad = false;
    expect(await ensureFont('Michroma', false, BASE)).toBe(true);
    expect(fontEpoch()).toBe(before + 1);
    await ensureFont('Michroma', false, BASE);
    expect(fontEpoch()).toBe(before + 1);
  });

  it('expõe as 12 famílias embutidas para o seletor', async () => {
    const { BUNDLED_FAMILIES } = await import('../src/engine/text/fontLoader');
    expect(BUNDLED_FAMILIES).toHaveLength(12);
    expect(BUNDLED_FAMILIES).toContain('Space Grotesk');
  });
});

describe('googleFonts', () => {
  it('monta a URL do CSS trocando espaços por +', () => {
    expect(googleFontCssUrl('Space Grotesk', 700)).toBe(
      'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700&display=swap',
    );
  });

  it('escolhe o arquivo latin antes do latin-ext', () => {
    expect(pickFontFileUrl(GOOGLE_CSS)).toBe('https://fonts.gstatic.com/s/lobster/v1/latin.woff2');
  });

  it('usa latin-ext quando não há latin', () => {
    const css = GOOGLE_CSS.slice(0, GOOGLE_CSS.indexOf('/* latin */'));
    expect(pickFontFileUrl(css)).toBe('https://fonts.gstatic.com/s/lobster/v1/ext.woff2');
  });

  it('devolve null quando o CSS não tem arquivo utilizável', () => {
    expect(pickFontFileUrl('body { color: red; }')).toBeNull();
  });
});
