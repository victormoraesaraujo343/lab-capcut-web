// Carregador único do ffmpeg.wasm: núcleo servido localmente (public/ffmpeg), nunca pela internet.
// Também guarda utilitários de arquivo e cancelamento usados pelos exportadores.
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { canFetchLocalAssets } from '../env/runtimeEnv';
import ffmpegWorkerSource from '../workers/ffmpegClass.worker?bundled-source';

let instance: FFmpeg | null = null;
let pending: Promise<FFmpeg> | null = null;
let logSink: ((line: string) => void) | undefined;

/** Cria a instância, carrega o núcleo local e liga o registro de log. */
async function startLoad(): Promise<FFmpeg> {
  if (!canFetchLocalAssets()) throw new Error('ffmpeg-needs-web-address');
  const ffmpeg = new FFmpeg();
  ffmpeg.on('log', (event) => {
    logSink?.(event.message);
  });
  const coreURL = await toBlobURL(new URL('ffmpeg/ffmpeg-core.js', document.baseURI).href, 'text/javascript');
  const wasmURL = await toBlobURL(new URL('ffmpeg/ffmpeg-core.wasm', document.baseURI).href, 'application/wasm');
  // O worker do ffmpeg vai empacotado no app (Blob), pois o caminho "./worker.js" da biblioteca não existe no build clássico.
  const classWorkerURL = URL.createObjectURL(new Blob([ffmpegWorkerSource], { type: 'text/javascript' }));
  await ffmpeg.load({ coreURL, wasmURL, classWorkerURL });
  instance = ffmpeg;
  return ffmpeg;
}

/** Devolve a instância única do ffmpeg, carregando-a na primeira vez; onLog recebe as linhas do núcleo. */
export async function loadFfmpeg(onLog?: (line: string) => void): Promise<FFmpeg> {
  logSink = onLog ?? logSink;
  if (instance?.loaded) return instance;
  pending ??= startLoad().catch((error: unknown) => {
    pending = null;
    throw error;
  });
  return pending;
}

/** Diz se a instância única já está carregada e pronta para uso. */
export function isFfmpegLoaded(): boolean {
  return instance?.loaded === true;
}

/** Encerra o worker do ffmpeg e descarta a instância; a próxima carga começa do zero. */
export function terminateFfmpeg(): void {
  const current = instance;
  instance = null;
  pending = null;
  current?.terminate();
}

/** Lança AbortError se o sinal já foi cancelado. */
export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

/** Cria o erro padrão de cancelamento (name 'AbortError'). */
export function abortError(): DOMException {
  return new DOMException('Exportação cancelada.', 'AbortError');
}

/** Lê um arquivo do sistema virtual como bytes independentes (ArrayBuffer próprio). */
export async function readOutput(ffmpeg: FFmpeg, path: string): Promise<ArrayBuffer> {
  const data = await ffmpeg.readFile(path);
  if (typeof data === 'string') throw new Error('ffmpeg-binary-expected');
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy.buffer;
}

/** Apaga arquivos do sistema virtual, ignorando os que não existem. */
export async function removeFiles(ffmpeg: FFmpeg, paths: string[]): Promise<void> {
  for (const path of paths) {
    await ffmpeg.deleteFile(path).catch(() => false);
  }
}
