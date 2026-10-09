// Carregamento de fontes: embutidas (public/fonts, pelo manifesto) ou Google Fonts sob demanda. Memoizado; falha vira false.
import type { Project } from '../../types/project';
import { loadGoogleFont, registerFontFace } from './googleFonts';

/** Entrada do manifesto public/fonts/fonts.json. */
export interface BundledFont {
  /** Nome da família, ex.: 'Inter'. */
  family: string;
  /** Categoria para o seletor (sans, serif, mono...). */
  category: string;
  /** Licença do arquivo. */
  license: string;
  /** Arquivo de cada peso, relativo a public/fonts. */
  files: { '400': string; '700'?: string };
}

/** Famílias embutidas no app, na ordem do seletor. */
export const BUNDLED_FAMILIES: readonly string[] = [
  'Inter',
  'Roboto',
  'Space Grotesk',
  'Michroma',
  'Comic Relief',
  'JetBrains Mono',
  'Gelasio',
  'Ubuntu',
  'DejaVu Sans',
  'Liberation Serif',
  'Noto Serif',
  'Caladea',
];

/** Manifesto por URL base, já pedido. Falha é removida, para tentar de novo. */
const manifests = new Map<string, Promise<BundledFont[]>>();
/** Resultado por família e peso, já pedido. Falha é removida, para tentar de novo. */
const requests = new Map<string, Promise<boolean>>();
/** Sobe a cada FontFace registrada com sucesso (embutida ou Google); o cache de texto usa para refazer imagens. */
let epoch = 0;

/** Época atual das fontes: muda sempre que uma fonte nova é registrada. */
export function fontEpoch(): number {
  return epoch;
}

/** Lê o manifesto public/fonts/fonts.json a partir da URL base do app; a resposta fica guardada. */
export function loadBundledFontManifest(baseUrl: string): Promise<BundledFont[]> {
  const cached = manifests.get(baseUrl);
  if (cached !== undefined) return cached;
  const url = new URL('fonts/fonts.json', baseUrl).href;
  const promise = fetch(url).then(async (response) => {
    if (!response.ok) throw new Error('font-manifest-failed');
    return (await response.json()) as BundledFont[];
  });
  manifests.set(baseUrl, promise);
  promise.catch(() => {
    if (manifests.get(baseUrl) === promise) manifests.delete(baseUrl);
  });
  return promise;
}

/** Garante que a família com o peso (negrito = 700) está carregada. Devolve false se não deu, sem lançar erro. */
export function ensureFont(family: string, bold: boolean, baseUrl: string): Promise<boolean> {
  const weight = bold ? 700 : 400;
  const key = `${family}|${weight}`;
  const cached = requests.get(key);
  if (cached !== undefined) return cached;
  const promise = resolveFont(family, weight, baseUrl).catch(() => false);
  requests.set(key, promise);
  void promise.then((ok) => {
    if (!ok && requests.get(key) === promise) requests.delete(key);
  });
  return promise;
}

/** Registra a fonte e, quando deu certo, sobe a época. */
async function resolveFont(family: string, weight: number, baseUrl: string): Promise<boolean> {
  const ok = await resolveSource(family, weight, baseUrl);
  if (ok) epoch += 1;
  return ok;
}

/** Decide entre embutida e Google, e registra o FontFace. */
async function resolveSource(family: string, weight: number, baseUrl: string): Promise<boolean> {
  const bundled = await loadBundledFontManifest(baseUrl).catch(() => null);
  const entry = bundled?.find((font) => font.family === family);
  if (entry === undefined) return loadGoogleFont(family, weight);

  const hasBold = weight === 700 && entry.files['700'] !== undefined;
  const file = (hasBold ? entry.files['700'] : undefined) ?? entry.files['400'];
  const faceWeight = hasBold ? 700 : 400;
  const url = new URL(`fonts/${file}`, baseUrl).href;
  return registerFontFace(family, `url("${url}")`, faceWeight);
}

/** Carrega todas as fontes usadas pelos clipes de texto do projeto (família + negrito). */
export async function ensureProjectFonts(project: Project, baseUrl: string): Promise<void> {
  const used = new Map<string, { family: string; bold: boolean }>();
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      const style = clip.text?.style;
      if (style === undefined || style.fontFamily === '') continue;
      used.set(`${style.fontFamily}|${style.bold}`, { family: style.fontFamily, bold: style.bold });
    }
  }
  await Promise.all([...used.values()].map((font) => ensureFont(font.family, font.bold, baseUrl)));
}
