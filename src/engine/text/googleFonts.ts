// Google Fonts sob demanda: lê o CSS da família, escolhe o arquivo latin e registra o FontFace no escopo atual.
const GOOGLE_CSS_ORIGIN = 'https://fonts.googleapis.com/css2';
/** Subconjuntos preferidos, na ordem: o primeiro encontrado no CSS vence. */
const PREFERRED_SUBSETS: readonly string[] = ['latin', 'latin-ext'];

/** Caracteres de nome de família aceitos na URL (letras, números e espaço). */
const FAMILY_FORBIDDEN = /[^\p{L}\p{N} ]+/gu;

/** Monta a URL do CSS da família no peso dado, ex.: '...css2?family=Space+Grotesk:wght@400&display=swap'. */
export function googleFontCssUrl(family: string, weight: number): string {
  const name = family
    .trim()
    .replace(FAMILY_FORBIDDEN, '')
    .split(/\s+/)
    .filter((part) => part !== '')
    .join('+');
  return `${GOOGLE_CSS_ORIGIN}?family=${name}:wght@${weight}&display=swap`;
}

/** Extrai do CSS do Google a URL do arquivo do primeiro subconjunto preferido (latin antes de latin-ext). */
export function pickFontFileUrl(css: string): string | null {
  const blocks = new Map<string, string>();
  const pattern = /\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g;
  for (const match of css.matchAll(pattern)) {
    const subset = match[1];
    const body = match[2];
    if (subset !== undefined && body !== undefined && !blocks.has(subset)) blocks.set(subset, body);
  }
  for (const subset of PREFERRED_SUBSETS) {
    const body = blocks.get(subset);
    if (body === undefined) continue;
    const url = /url\(\s*['"]?([^'")\s]+)['"]?\s*\)/.exec(body)?.[1];
    if (url !== undefined && url.startsWith('https://')) return url;
  }
  return null;
}

/** Cria o FontFace e o adiciona ao conjunto de fontes do escopo atual (worker ou janela). Falha → false. */
export async function registerFontFace(family: string, source: string, weight: number): Promise<boolean> {
  const scope = fontScope();
  if (scope === null || typeof FontFace === 'undefined') return false;
  try {
    const face = new FontFace(family, source, { weight: String(weight) });
    await face.load();
    scope.add(face);
    return true;
  } catch {
    return false;
  }
}

/** Conjunto de fontes do escopo: self.fonts no worker ou na janela, document.fonts como reserva. */
function fontScope(): FontFaceSet | null {
  if (typeof self !== 'undefined' && self.fonts) return self.fonts;
  if (typeof document !== 'undefined') return document.fonts;
  return null;
}

/** Carrega uma família do Google Fonts no peso dado. Sem rede, CSS sem arquivo ou erro → false. */
export async function loadGoogleFont(family: string, weight: number): Promise<boolean> {
  try {
    const response = await fetch(googleFontCssUrl(family, weight), { mode: 'cors' });
    if (!response.ok) return false;
    const fileUrl = pickFontFileUrl(await response.text());
    if (fileUrl === null) return false;
    return await registerFontFace(family, `url("${fileUrl}")`, weight);
  } catch {
    return false;
  }
}
