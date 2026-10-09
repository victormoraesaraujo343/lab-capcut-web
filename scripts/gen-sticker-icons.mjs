// Gera src/engine/stickers/stickerIcons.generated.ts a partir dos ícones do lucide-react (licença ISC).
// Uso: node scripts/gen-sticker-icons.mjs

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ICON_DIR = join(ROOT, 'node_modules', 'lucide-react', 'dist', 'esm', 'icons');
const OUT_FILE = join(ROOT, 'src', 'engine', 'stickers', 'stickerIcons.generated.ts');

/** Ícones do lucide usados nas figurinhas (os que não existirem na versão instalada são pulados). */
const WANTED = [
  'heart', 'star', 'smile', 'laugh', 'frown', 'thumbs-up', 'flame', 'sparkles', 'zap', 'sun',
  'moon', 'cloud', 'umbrella', 'snowflake', 'flower', 'leaf', 'music', 'camera', 'gift', 'party-popper',
  'cake', 'crown', 'rocket', 'plane', 'map-pin', 'coffee', 'pizza', 'ice-cream-cone', 'check', 'x',
  'arrow-right', 'arrow-left', 'arrow-up', 'arrow-down', 'corner-down-right', 'message-circle', 'bell', 'megaphone',
  'trophy', 'medal', 'target', 'gem', 'lightbulb', 'eye', 'hand', 'mail',
  'phone', 'shopping-bag', 'tag', 'percent', 'dollar-sign', 'clock', 'calendar', 'play',
  'pause', 'volume-2', 'wifi', 'battery', 'home', 'globe',
];

/** Segue apelidos (arquivos que só reexportam outro ícone) até o arquivo com os dados. */
async function resolveIconFile(name, depth = 0) {
  const file = join(ICON_DIR, `${name}.mjs`);
  const source = await readFile(file, 'utf8');
  const alias = source.match(/export \{ default \} from '\.\/([^']+)\.mjs';/);
  if (alias === null || depth > 3) return file;
  return resolveIconFile(alias[1], depth + 1);
}

/** Lê os nós SVG de um ícone (sem o atributo key do React). */
async function readNodes(name) {
  const file = await resolveIconFile(name);
  const mod = await import(pathToFileURL(file).href);
  const data = mod.__iconData;
  if (data === undefined || !Array.isArray(data.node)) return null;
  return data.node.map(([tag, attrs]) => {
    const clean = {};
    for (const [key, value] of Object.entries(attrs)) {
      if (key !== 'key' && typeof value === 'string') clean[key] = value;
    }
    return [tag, clean];
  });
}

/** Monta o texto do arquivo TypeScript gerado. */
function render(entries) {
  const lines = [
    '// ARQUIVO GERADO por scripts/gen-sticker-icons.mjs. Não edite à mão: rode o script de novo.',
    '// Ícones: Lucide (https://lucide.dev), licença ISC, © Lucide Icons and Contributors.',
    '',
    '/** Nós SVG dos ícones de figurinha: [tag, atributos]. */',
    'export const STICKER_ICONS: Record<string, [string, Record<string, string>][]> = {',
  ];
  for (const [name, nodes] of entries) {
    lines.push(`  ${JSON.stringify(name)}: ${JSON.stringify(nodes)},`);
  }
  lines.push('};', '');
  return lines.join('\n');
}

const entries = [];
const missing = [];
for (const name of WANTED) {
  const nodes = await readNodes(name);
  if (nodes === null) missing.push(name);
  else entries.push([name, nodes]);
}

await mkdir(dirname(OUT_FILE), { recursive: true });
await writeFile(OUT_FILE, render(entries), 'utf8');
process.stdout.write(`Ícones gerados: ${entries.length}. Pulados (não existem): ${missing.join(', ') || 'nenhum'}\n`);
