// Copia binários WebAssembly de terceiros para public/, para o app funcionar offline e sem CDN:
// núcleo do ffmpeg.wasm (exportação de reserva) e runtime do ONNX (legendas automáticas).
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const copies = [
  { from: 'node_modules/@ffmpeg/core/dist/esm/', to: 'public/ffmpeg/', files: ['ffmpeg-core.js', 'ffmpeg-core.wasm'] },
  { from: 'node_modules/onnxruntime-web/dist/', to: 'public/ort/', files: ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm'] },
];
for (const { from, to, files } of copies) {
  mkdirSync(root + to, { recursive: true });
  for (const name of files) copyFileSync(root + from + name, root + to + name);
}
