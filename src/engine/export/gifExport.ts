// Exportação GIF: desenha cada quadro com renderFrame, lê os pixels e passa ao codificador GIF.
import type { ResolvedExport } from '../../types/export';
import type { Project } from '../../types/project';
import type { FrameProvider } from '../../types/render';
import { createCompositor } from '../render/compositor';
import { renderFrame } from '../render/renderFrame';
import { createGifEncoder } from './gifEncoder';
import { frameCount } from './videoEncode';

/**
 * Renderiza o intervalo como GIF animado e devolve os bytes. Se cancelado, devolve um buffer vazio
 * (quem chamou checa o cancelamento depois).
 */
export async function exportGif(
  project: Project,
  config: ResolvedExport,
  provider: FrameProvider,
  onProgress: (done: number, total: number) => void,
  isCancelled: () => boolean,
): Promise<ArrayBuffer> {
  const { width, height } = config;
  const canvas = new OffscreenCanvas(width, height);
  const compositor = createCompositor(canvas);
  try {
    // Canvas 2D de leitura: drawImage estica o quadro WebGL para exatamente width x height.
    const readCanvas = new OffscreenCanvas(width, height);
    const ctx = readCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('canvas-2d-unavailable');
    const encoder = createGifEncoder(width, height, config.fps);
    const total = frameCount(config);
    for (let index = 0; index < total; index++) {
      if (isCancelled()) return new ArrayBuffer(0);
      const timeMs = config.startMs + (index * 1000) / config.fps;
      await renderFrame(compositor, project, timeMs, provider, { scale: width / project.width, exact: true });
      ctx.drawImage(compositor.canvas, 0, 0, width, height);
      encoder.addFrame(ctx.getImageData(0, 0, width, height).data);
      onProgress(index + 1, total);
    }
    if (isCancelled()) return new ArrayBuffer(0);
    return toArrayBuffer(encoder.finish());
  } finally {
    compositor.dispose();
  }
}

/** Copia os bytes para um ArrayBuffer próprio (transferível ao thread principal). */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
