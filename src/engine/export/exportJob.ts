// Orquestra uma exportação no worker: fases, cancelamento, erros mapeados para códigos e liberação de recursos.
import type { ExportErrorCode, ExportPhase, ExportResponse, MixedAudio, ResolvedExport } from '../../types/export';
import type { Project } from '../../types/project';
import type { FrameProvider } from '../../types/render';
import { ensureProjectFonts } from '../text/fontLoader';
import { encodeAudio } from './audioEncode';
import { createExportFrameProvider } from './exportFrameProvider';
import { exportGif } from './gifExport';
import { createMuxer } from './muxers';
import { encodeVideo } from './videoEncode';

/** Pedido de exportação já desempacotado do protocolo do worker. */
export interface ExportJobRequest {
  /** Projeto completo a renderizar. */
  project: Project;
  /** Configuração resolvida do formato e do intervalo. */
  config: ResolvedExport;
  /** Áudio mixado, ou null quando o projeto não tem som. */
  audio: MixedAudio | null;
  /** URL base do app, para achar public/fonts e carregar as fontes do projeto. */
  assetBaseUrl: string;
}

/** Tipos de trilha que desenham algo na saída (mesmo critério da composição). */
const VISUAL_TRACK_KINDS = new Set<string>(['video', 'sticker', 'text', 'effect']);

/** Falha com código de erro já definido. */
class ExportFailure extends Error {
  /** Código mostrado pelo diálogo. */
  readonly code: ExportErrorCode;

  /** Cria a falha com o código e a mensagem técnica. */
  constructor(code: ExportErrorCode, message: string) {
    super(message);
    this.name = 'ExportFailure';
    this.code = code;
  }
}

/** Nome de um erro (DOMException ou Error), ou '' se não houver. */
function errorName(error: unknown): string {
  return typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string'
    ? error.name
    : '';
}

/** Mensagem de um erro qualquer. */
function errorMessage(error: unknown): string {
  return typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
    ? error.message
    : String(error);
}

/** Mapeia um erro qualquer para o código de ExportErrorCode mostrado no diálogo. */
export function mapExportError(error: unknown): { code: ExportErrorCode; message: string } {
  const message = errorMessage(error);
  if (error instanceof ExportFailure) return { code: error.code, message };
  if (message.startsWith('unsupported-codec')) return { code: 'unsupported-codec', message };
  if (message.startsWith('decode:')) return { code: 'decode', message };
  if (message.startsWith('encode:') || errorName(error) === 'EncodingError') return { code: 'encode', message };
  if (error instanceof RangeError || errorName(error) === 'QuotaExceededError') return { code: 'memory', message };
  return { code: 'generic', message };
}

/** Confere se o navegador tem os codificadores que o formato pede; GIF não precisa deles. */
function assertWebCodecs(format: ResolvedExport['format']): void {
  if (format === 'gif') return;
  const available =
    typeof VideoEncoder !== 'undefined' &&
    typeof AudioEncoder !== 'undefined' &&
    typeof VideoFrame !== 'undefined' &&
    typeof AudioData !== 'undefined';
  if (!available) throw new ExportFailure('no-webcodecs', 'no-webcodecs');
}

/** Diz se algum clipe visual cruza o intervalo exportado. */
function hasVisualContent(project: Project, config: ResolvedExport): boolean {
  return project.tracks.some(
    (track) =>
      !track.hidden &&
      VISUAL_TRACK_KINDS.has(track.kind) &&
      track.clips.some((clip) => clip.startMs < config.endMs && clip.startMs + clip.durationMs > config.startMs),
  );
}

/**
 * Executa uma exportação inteira: preparing → audio → video → finalizing, e no fim posta 'done' com o arquivo.
 * Cancelado posta 'cancelled'; erros viram 'error' com código. O provedor de quadros é sempre liberado.
 */
export async function runExportJob(
  request: ExportJobRequest,
  post: (response: ExportResponse) => void,
  isCancelled: () => boolean,
  jobId: number,
): Promise<void> {
  const { project, config, audio } = request;
  const progress = (phase: ExportPhase) => (done: number, total: number): void => {
    post({ type: 'progress', jobId, phase, done, total });
  };
  const cancelled = (): void => {
    post({ type: 'cancelled', jobId });
  };
  const useAudio = config.format !== 'gif' && audio !== null && audio.channels.length > 0;
  let provider: FrameProvider | null = null;
  try {
    if (config.format !== 'mp4' && config.format !== 'webm' && config.format !== 'gif') {
      throw new ExportFailure('generic', 'format-unsupported');
    }
    assertWebCodecs(config.format);
    if (!hasVisualContent(project, config) && !useAudio) {
      throw new ExportFailure('empty', 'empty');
    }
    post({ type: 'progress', jobId, phase: 'preparing', done: 0, total: 1 });
    await ensureProjectFonts(project, request.assetBaseUrl);
    provider = createExportFrameProvider();
    if (isCancelled()) return cancelled();

    let data: ArrayBuffer;
    if (config.format === 'gif') {
      data = await exportGif(project, config, provider, progress('video'), isCancelled);
    } else {
      const muxer = createMuxer(config, useAudio, audio?.sampleRate);
      if (useAudio && audio) {
        await encodeAudio(audio, config, muxer, progress('audio'), isCancelled);
        if (isCancelled()) return cancelled();
      }
      await encodeVideo(project, config, provider, muxer, progress('video'), isCancelled);
      if (isCancelled()) return cancelled();
      post({ type: 'progress', jobId, phase: 'finalizing', done: 0, total: 1 });
      data = muxer.finalize();
    }
    if (isCancelled()) return cancelled();
    post({ type: 'done', jobId, data, mimeType: config.mimeType, fileName: config.fileName });
  } catch (error) {
    if (isCancelled()) return cancelled();
    const mapped = mapExportError(error);
    post({ type: 'error', jobId, code: mapped.code, message: mapped.message });
  } finally {
    provider?.dispose();
  }
}
