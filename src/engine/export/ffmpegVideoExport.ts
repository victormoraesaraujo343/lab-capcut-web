// Exportação de vídeo com ffmpeg.wasm para navegadores sem WebCodecs: quadros JPEG desenhados na thread principal.
// Usa a mesma pipeline de desenho da prévia (renderFrame) e codifica tudo no ffmpeg do navegador.
import type { FFmpeg } from '@ffmpeg/ffmpeg';
import type { MixedAudio, ResolvedExport } from '../../types/export';
import type { Project } from '../../types/project';
import type { Compositor, FrameProvider } from '../../types/render';
import { createPreviewFrameProvider } from '../decode/previewFrameProvider';
import { ensureProjectFonts } from '../text/fontLoader';
import { createCompositor } from '../render/compositor';
import { renderFrame } from '../render/renderFrame';
import { encodeWav } from './wavEncoder';
import { frameCount } from './videoEncode';
import { AUDIO_INPUT, videoArgs, videoOutputName } from './ffmpegArgs';
import { abortError, loadFfmpeg, readOutput, removeFiles, terminateFfmpeg, throwIfAborted } from './ffmpegLoader';

/** Qualidade do JPEG de cada quadro (0 a 1). */
const JPEG_QUALITY = 0.92;

/** Quantos quadros desenhar antes de ceder a thread à interface. */
const YIELD_EVERY = 30;

/** Exporta o projeto em MP4/WebM pelo ffmpeg.wasm; onProgress informa a fase ('video' ou 'finalizing') com feito/total. */
export async function exportVideoWithFfmpeg(
  project: Project,
  config: ResolvedExport,
  audio: MixedAudio | null,
  onProgress: (phase: 'video' | 'finalizing', done: number, total: number) => void,
  signal: AbortSignal,
): Promise<ArrayBuffer> {
  throwIfAborted(signal);
  const ffmpeg = await loadFfmpeg();
  const canvas = document.createElement('canvas');
  canvas.width = config.width;
  canvas.height = config.height;
  const compositor = createCompositor(canvas);
  const exact = document.createElement('canvas');
  exact.width = config.width;
  exact.height = config.height;
  const exactCtx = exact.getContext('2d');
  if (!exactCtx) throw new Error('canvas-2d-unavailable');
  const provider = createPreviewFrameProvider({ proxiesEnabled: () => false });
  const total = Math.max(1, frameCount(config));
  const written: string[] = [];
  const outputName = videoOutputName(config.format);
  const onAbort = (): void => {
    terminateFfmpeg();
  };

  signal.addEventListener('abort', onAbort, { once: true });
  try {
    // Sem WebCodecs também é preciso carregar as fontes dos textos antes de desenhar.
    await ensureProjectFonts(project, document.baseURI);
    if (audio) {
      await ffmpeg.writeFile(AUDIO_INPUT, new Uint8Array(encodeWav(audio)));
      written.push(AUDIO_INPUT);
    }
    await drawFrames(ffmpeg, {
      project,
      config,
      compositor,
      canvas,
      exact,
      exactCtx,
      provider,
      total,
      written,
      onProgress,
      signal,
    });
    throwIfAborted(signal);
    const code = await runEncoder(ffmpeg, config, audio !== null, onProgress, signal);
    throwIfAborted(signal);
    if (code !== 0) throw new Error(`ffmpeg-exec-failed:${code}`);
    written.push(outputName);
    return await readOutput(ffmpeg, outputName);
  } catch (error: unknown) {
    if (signal.aborted) throw abortError();
    throw error;
  } finally {
    signal.removeEventListener('abort', onAbort);
    provider.dispose();
    compositor.dispose();
    if (!signal.aborted) await removeFiles(ffmpeg, written);
  }
}

/** Nome do quadro no sistema virtual; combina com o padrão frame%06d.jpg. */
function frameName(index: number): string {
  return `frame${String(index).padStart(6, '0')}.jpg`;
}

/** Converte o canvas em JPEG (bytes). */
async function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('jpeg-encode-failed'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
  return new Uint8Array(await blob.arrayBuffer());
}

/** Espera um ciclo de evento para a interface respirar. */
function yieldToUi(): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/** Entrada da etapa de quadros: projeto, configuração, recursos de desenho e progresso. */
interface DrawOptions {
  project: Project;
  config: ResolvedExport;
  compositor: Compositor;
  canvas: HTMLCanvasElement;
  /** Canvas do tamanho exato da saída (width x height, pares); recebe o quadro antes do JPEG. */
  exact: HTMLCanvasElement;
  exactCtx: CanvasRenderingContext2D;
  provider: FrameProvider;
  total: number;
  written: string[];
  onProgress: (phase: 'video' | 'finalizing', done: number, total: number) => void;
  signal: AbortSignal;
}

/** Desenha cada quadro do intervalo e grava o JPEG no sistema virtual. */
async function drawFrames(ffmpeg: FFmpeg, options: DrawOptions): Promise<void> {
  const { project, config, compositor, canvas, exact, exactCtx, provider, total, written, onProgress, signal } = options;
  const scale = config.width / project.width;
  for (let index = 0; index < total; index += 1) {
    throwIfAborted(signal);
    const timelineMs = config.startMs + (index * 1000) / config.fps;
    await renderFrame(compositor, project, timelineMs, provider, { scale, exact: true });
    // O compositor pode arredondar a altura 1 px diferente; o quadro é esticado para o tamanho exato da saída.
    exactCtx.drawImage(canvas, 0, 0, exact.width, exact.height);
    const name = frameName(index);
    await ffmpeg.writeFile(name, await canvasToJpeg(exact));
    written.push(name);
    onProgress('video', index + 1, total);
    if ((index + 1) % YIELD_EVERY === 0) await yieldToUi();
  }
}

/** Roda o ffmpeg que monta o arquivo final, relatando o progresso como porcentagem. */
async function runEncoder(
  ffmpeg: FFmpeg,
  config: ResolvedExport,
  hasAudio: boolean,
  onProgress: (phase: 'video' | 'finalizing', done: number, total: number) => void,
  signal: AbortSignal,
): Promise<number> {
  const onFfmpegProgress = (event: { progress: number }): void => {
    if (!Number.isFinite(event.progress)) return;
    onProgress('finalizing', Math.round(Math.min(1, Math.max(0, event.progress)) * 100), 100);
  };
  onProgress('finalizing', 0, 100);
  ffmpeg.on('progress', onFfmpegProgress);
  try {
    return await ffmpeg.exec(videoArgs(config, hasAudio), -1, { signal });
  } finally {
    ffmpeg.off('progress', onFfmpegProgress);
  }
}
