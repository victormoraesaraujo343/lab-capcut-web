// Codificação de vídeo da exportação: desenha cada quadro com renderFrame e envia ao VideoEncoder.
import type { ResolvedExport } from '../../types/export';
import type { FrameProvider } from '../../types/render';
import type { Project } from '../../types/project';
import { createCompositor } from '../render/compositor';
import { renderFrame } from '../render/renderFrame';
import type { ExportMuxer } from './muxers';

/** Acima desta fila, a exportação espera o codificador esvaziar um pouco antes de enviar outro quadro. */
const MAX_ENCODE_QUEUE = 8;
/** Tempo limite da espera por 'dequeue'; a espera nunca é indefinida. */
const QUEUE_WAIT_MS = 50;
/** Preferências de aceleração testadas nesta ordem. */
const HARDWARE_PREFERENCES: HardwareAcceleration[] = ['no-preference', 'prefer-software'];

/** Estado de erro do codificador, guardado em objeto para o TypeScript não estreitar a leitura. */
interface EncoderState {
  error: Error | null;
}

/** Número de quadros do intervalo exportado. */
export function frameCount(config: ResolvedExport): number {
  return Math.ceil(((config.endMs - config.startMs) * config.fps) / 1000);
}

/**
 * Devolve uma fonte com exatamente o tamanho pedido. Se o canvas já tem esse tamanho, devolve ele;
 * senão copia (esticando até 1 px) para o canvas auxiliar. Só acontece quando a altura arredonda diferente.
 */
export function exactCanvas(source: OffscreenCanvas, scratch: OffscreenCanvas): OffscreenCanvas {
  if (source.width === scratch.width && source.height === scratch.height) return source;
  const ctx = scratch.getContext('2d');
  if (!ctx) throw new Error('canvas-2d-unavailable');
  ctx.drawImage(source, 0, 0, scratch.width, scratch.height);
  return scratch;
}

/** Escolhe a primeira configuração de codificador suportada; lança 'unsupported-codec' se nenhuma for. */
async function resolveEncoderConfig(config: ResolvedExport): Promise<VideoEncoderConfig> {
  for (const hardwareAcceleration of HARDWARE_PREFERENCES) {
    const candidate: VideoEncoderConfig = {
      codec: config.videoCodec,
      width: config.width,
      height: config.height,
      bitrate: config.videoBitrate,
      framerate: config.fps,
      latencyMode: 'quality',
      hardwareAcceleration,
    };
    const support = await VideoEncoder.isConfigSupported(candidate).catch(() => ({ supported: false }));
    if (support.supported) return candidate;
  }
  throw new Error('unsupported-codec');
}

/** Espera o próximo 'dequeue' do codificador ou o tempo limite, o que vier primeiro. */
function waitForDequeue(encoder: VideoEncoder): Promise<void> {
  return new Promise<void>((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      encoder.removeEventListener('dequeue', done);
      resolve();
    };
    const timer = setTimeout(done, QUEUE_WAIT_MS);
    encoder.addEventListener('dequeue', done);
  });
}

/** Lança o erro guardado pelo codificador, se houver. */
function throwIfFailed(state: EncoderState): void {
  if (state.error !== null) throw state.error;
}

/**
 * Codifica o intervalo do projeto no muxer, quadro a quadro, com a pipeline de render da prévia.
 * Escala = width / project.width. Se a altura arredondar 1 px diferente de height, o quadro é esticado
 * para o tamanho exato (ver exactCanvas). Cancelamento: para e fecha o codificador sem lançar erro.
 */
export async function encodeVideo(
  project: Project,
  config: ResolvedExport,
  provider: FrameProvider,
  muxer: ExportMuxer,
  onProgress: (done: number, total: number) => void,
  isCancelled: () => boolean,
): Promise<void> {
  const { width, height } = config;
  const canvas = new OffscreenCanvas(width, height);
  const scratch = new OffscreenCanvas(width, height);
  const compositor = createCompositor(canvas);
  const state: EncoderState = { error: null };
  let encoder: VideoEncoder | null = null;
  try {
    const encoderConfig = await resolveEncoderConfig(config);
    encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (error) => {
        state.error = new Error(`encode:${error.message}`);
      },
    });
    encoder.configure(encoderConfig);
    const total = frameCount(config);
    const frameUs = Math.round(1_000_000 / config.fps);
    for (let index = 0; index < total; index++) {
      if (isCancelled()) break;
      throwIfFailed(state);
      const timeMs = config.startMs + (index * 1000) / config.fps;
      await renderFrame(compositor, project, timeMs, provider, { scale: width / project.width, exact: true });
      const source = exactCanvas(canvas, scratch);
      // Timestamp calculado do índice (não somado) para não acumular erro de arredondamento.
      const frame = new VideoFrame(source, { timestamp: Math.round((index * 1_000_000) / config.fps), duration: frameUs });
      try {
        if (encoder.encodeQueueSize > MAX_ENCODE_QUEUE) await waitForDequeue(encoder);
        encoder.encode(frame, { keyFrame: index % config.keyFrameInterval === 0 });
      } finally {
        frame.close();
      }
      onProgress(index + 1, total);
    }
    if (!isCancelled()) {
      await encoder.flush();
      throwIfFailed(state);
    }
  } finally {
    if (encoder && encoder.state !== 'closed') encoder.close();
    compositor.dispose();
  }
}
