// Copia o núcleo do ffmpeg.wasm para public/ffmpeg, para a exportação de reserva funcionar offline.
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const from = `${root}node_modules/@ffmpeg/core/dist/esm/`;
const to = `${root}public/ffmpeg/`;
mkdirSync(to, { recursive: true });
for (const name of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) copyFileSync(from + name, to + name);
