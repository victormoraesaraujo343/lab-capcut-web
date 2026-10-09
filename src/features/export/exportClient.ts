// Cliente de exportação na thread principal: mixa o áudio, escolhe o caminho de codificação e informa progresso.
import { mixProjectAudio } from '../../engine/audio/offlineMix';
import { canEncodeAac } from '../../engine/export/aacSupport';
import { muxAacWithFfmpeg } from '../../engine/export/ffmpegAacMux';
import { estimateSizeBytes, resolveExport } from '../../engine/export/exportSettings';
import { exportVideoWithFfmpeg } from '../../engine/export/ffmpegVideoExport';
import { exportMp3 } from '../../engine/export/mp3Export';
import { encodeWav } from '../../engine/export/wavEncoder';
import type {
  ExportPhase,
  ExportRequest,
  ExportResponse,
  ExportSettings,
  MixedAudio,
  ResolvedExport,
} from '../../types/export';
import type { Project } from '../../types/project';
import { createEtaEstimator } from './eta';

/** Resultado de uma exportação concluída: o arquivo e o nome sugerido para salvar. */
export interface ExportResult {
  blob: Blob;
  fileName: string;
}

/** Progresso enviado à interface: fase atual, fração global (0 a 1) e tempo restante em ms. */
export interface ExportUpdate {
  phase: ExportPhase;
  fraction: number;
  etaMs: number | null;
}

/** Controle de uma exportação em andamento. */
export interface ExportHandle {
  /** Cancela a exportação; a promessa de resultado é rejeitada com 'cancelled'. */
  cancel(): void;
  /** Resolve com o arquivo pronto ou rejeita com o código do erro. */
  result: Promise<ExportResult>;
}

/** Intervalo da fração global ocupado por cada fase. */
const PHASE_RANGE: Record<ExportPhase, { from: number; to: number }> = {
  preparing: { from: 0, to: 0.02 },
  audio: { from: 0.02, to: 0.1 },
  video: { from: 0.1, to: 0.97 },
  finalizing: { from: 0.97, to: 1 },
};

/** Taxa do MP3 em kbps. */
const MP3_KBPS = 192;
/** Taxa do AAC em kbps quando o áudio é juntado ao MP4 pelo ffmpeg. */
const AAC_KBPS = 192;
/** Id do único trabalho de cada exportação (cada uma tem o próprio worker). */
const JOB_ID = 1;
/** Mensagem de rejeição usada quando a pessoa cancela. */
export const CANCELLED_MESSAGE = 'cancelled';
/** Tamanho estimado acima do qual a montagem no navegador costuma faltar memória (1,5 GB, base decimal). */
export const LARGE_FILE_BYTES = 1_500_000_000;
/** Código de erro do worker quando o navegador não tem o codec pedido. */
const UNSUPPORTED_CODEC = 'unsupported-codec';
/** Tipos de trilha que desenham algo na saída (mesmo critério do worker). */
const VISUAL_TRACK_KINDS = new Set<string>(['video', 'sticker', 'text', 'effect']);

/** Fração global (0 a 1) de uma fase, dada a fração local dela. */
export function globalFraction(phase: ExportPhase, local: number): number {
  const { from, to } = PHASE_RANGE[phase];
  const safe = Number.isFinite(local) ? Math.min(1, Math.max(0, local)) : 0;
  return from + (to - from) * safe;
}

/** Erro de cancelamento, o mesmo que a promessa de resultado já rejeita. */
function abortError(): Error {
  return new Error(CANCELLED_MESSAGE);
}

/** Diz se o erro é o do worker sem codec suportado. */
function isUnsupportedCodec(error: unknown): boolean {
  return error instanceof Error && error.message === UNSUPPORTED_CODEC;
}

/** Envia progresso de uma fase com a fração local (0 a 1). */
type Emit = (phase: ExportPhase, local: number) => void;

/** Estado mutável da exportação: só o worker, quando há um. */
interface Session {
  worker: Worker | null;
}

/** Diz se o formato é só áudio. */
function isAudioOnly(format: ResolvedExport['format']): boolean {
  return format === 'wav' || format === 'mp3';
}

/** Diz se o navegador tem o codificador de vídeo do WebCodecs. */
function hasVideoEncoder(): boolean {
  return typeof VideoEncoder !== 'undefined';
}

/** Diz se algum clipe visual cruza o intervalo exportado [0, endMs). */
function hasVisualClips(project: Project, endMs: number): boolean {
  return project.tracks.some(
    (track) =>
      !track.hidden &&
      VISUAL_TRACK_KINDS.has(track.kind) &&
      track.clips.some((clip) => clip.startMs < endMs && clip.startMs + clip.durationMs > 0),
  );
}

/** Cria o emissor de progresso: calcula a fração global, o tempo restante e ignora tudo depois do cancelamento. */
function createEmitter(onUpdate: (update: ExportUpdate) => void, signal: AbortSignal): Emit {
  const eta = createEtaEstimator();
  return (phase, local) => {
    if (signal.aborted) return;
    const fraction = globalFraction(phase, local);
    onUpdate({ phase, fraction, etaMs: eta.update(fraction, Date.now()) });
  };
}

/** Garante que há áudio mixado quando a exportação precisa dele. */
function requireAudio(mix: MixedAudio | null): MixedAudio {
  if (mix === null) throw new Error('empty');
  return mix;
}

/** Codifica mp4/webm/gif no worker; o worker é guardado na sessão para ser encerrado depois. */
async function encodeInWorker(
  project: Project,
  config: ResolvedExport,
  audio: MixedAudio | null,
  emit: Emit,
  session: Session,
  signal: AbortSignal,
): Promise<Blob> {
  if (signal.aborted) throw abortError();
  return new Promise<Blob>((resolve, reject) => {
    const worker = new Worker(new URL('../../engine/workers/export.worker.ts', import.meta.url), { type: 'module' });
    session.worker = worker;
    worker.onmessage = (event: MessageEvent<ExportResponse>) => {
      const message = event.data;
      if (message.type === 'progress') {
        emit(message.phase, message.total > 0 ? message.done / message.total : 0);
      } else if (message.type === 'done') {
        resolve(new Blob([message.data], { type: message.mimeType }));
      } else if (message.type === 'error') {
        reject(new Error(message.code));
      } else {
        reject(new Error(CANCELLED_MESSAGE));
      }
    };
    const fail = (): void => reject(new Error(estimateSizeBytes(config) > LARGE_FILE_BYTES ? 'memory' : 'generic'));
    worker.onerror = fail;
    worker.onmessageerror = fail;
    const request: ExportRequest = {
      type: 'start',
      jobId: JOB_ID,
      project,
      config,
      audio,
      assetBaseUrl: document.baseURI,
    };
    const transfer = audio ? audio.channels.map((channel) => channel.buffer as ArrayBuffer) : [];
    worker.postMessage(request, transfer);
  });
}

/** Encerra o worker da sessão, se ainda houver um. */
function terminateWorker(session: Session): void {
  session.worker?.terminate();
  session.worker = null;
}

/** Codifica o vídeo no ffmpeg da thread principal (sem codec no navegador), com o áudio mixado junto. */
async function encodeWithFfmpeg(
  project: Project,
  config: ResolvedExport,
  mix: MixedAudio | null,
  emit: Emit,
  signal: AbortSignal,
): Promise<Blob> {
  emit('video', 0);
  const bytes = await exportVideoWithFfmpeg(
    project,
    config,
    mix,
    (phase, done, total) => emit(phase, total > 0 ? done / total : 0),
    signal,
  );
  return new Blob([bytes], { type: config.mimeType });
}

/** Codifica mp4/webm no worker; se o navegador recusar o codec, cai para o ffmpeg. Só falha se o ffmpeg também falhar. */
async function encodeVideoWithFallback(
  project: Project,
  config: ResolvedExport,
  mix: MixedAudio | null,
  emit: Emit,
  signal: AbortSignal,
  session: Session,
): Promise<Blob> {
  try {
    return await encodeInWorker(project, config, mix, emit, session, signal);
  } catch (error: unknown) {
    terminateWorker(session);
    if (!isUnsupportedCodec(error) || config.format === 'gif') throw error;
    if (signal.aborted) throw abortError();
    return encodeWithFfmpeg(project, config, mix, emit, signal);
  }
}

/** Codifica o MP4 só de vídeo no worker e junta o áudio mixado em AAC com ffmpeg; o signal aborta as duas etapas. */
async function encodeMp4WithFfmpegAudio(
  project: Project,
  config: ResolvedExport,
  mix: MixedAudio,
  emit: Emit,
  signal: AbortSignal,
  session: Session,
): Promise<Blob> {
  let videoOnly: Blob;
  try {
    videoOnly = await encodeInWorker(project, config, null, emit, session, signal);
  } catch (error: unknown) {
    terminateWorker(session);
    if (!isUnsupportedCodec(error)) throw error;
    if (signal.aborted) throw abortError();
    return encodeWithFfmpeg(project, config, mix, emit, signal);
  }
  terminateWorker(session);
  if (signal.aborted) throw abortError();
  const bytes = await muxAacWithFfmpeg(
    await videoOnly.arrayBuffer(),
    mix,
    AAC_KBPS,
    (fraction) => emit('finalizing', fraction),
    signal,
  );
  return new Blob([bytes], { type: config.mimeType });
}

/** Executa a exportação inteira e devolve o arquivo; lança o código de erro quando falha. */
async function runExport(
  project: Project,
  settings: ExportSettings,
  emit: Emit,
  signal: AbortSignal,
  session: Session,
): Promise<ExportResult> {
  const resolved = resolveExport(project, settings);
  const visual = hasVisualClips(project, resolved.endMs);
  const finish = (blob: Blob): ExportResult => ({ blob, fileName: resolved.fileName });
  if (resolved.format === 'gif') {
    if (!visual) throw new Error('empty');
    if (!hasVideoEncoder()) throw new Error('no-webcodecs');
  }

  emit('preparing', 0);
  const mix = resolved.format === 'gif'
    ? null
    : await mixProjectAudio(project, resolved.startMs, resolved.endMs, {
        signal,
        onProgress: (fraction) => emit('audio', fraction),
      });
  if (mix === null && (isAudioOnly(resolved.format) || !visual)) {
    throw new Error('empty');
  }

  switch (resolved.format) {
    case 'wav':
      return finish(new Blob([encodeWav(requireAudio(mix))], { type: resolved.mimeType }));
    case 'mp3': {
      const bytes = await exportMp3(requireAudio(mix), MP3_KBPS, (fraction) => emit('finalizing', fraction), signal);
      return finish(new Blob([bytes], { type: resolved.mimeType }));
    }
    default:
      break;
  }

  if (hasVideoEncoder()) {
    if (resolved.format === 'mp4' && mix !== null) {
      const aac = await canEncodeAac();
      if (signal.aborted) throw abortError();
      if (!aac) return finish(await encodeMp4WithFfmpegAudio(project, resolved, mix, emit, signal, session));
    }
    return finish(await encodeVideoWithFallback(project, resolved, mix, emit, signal, session));
  }
  if (resolved.format === 'gif') throw new Error('no-webcodecs');
  return finish(await encodeWithFfmpeg(project, resolved, mix, emit, signal));
}

/**
 * Inicia uma exportação do projeto inteiro. onUpdate recebe o progresso; o resultado é o arquivo pronto.
 * O worker é sempre encerrado no fim, com sucesso, erro ou cancelamento.
 */
export function startExport(
  project: Project,
  settings: ExportSettings,
  onUpdate: (update: ExportUpdate) => void,
): ExportHandle {
  const controller = new AbortController();
  const session: Session = { worker: null };
  const emit = createEmitter(onUpdate, controller.signal);
  const aborted = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener('abort', () => reject(new Error(CANCELLED_MESSAGE)), { once: true });
  });
  const work = runExport(project, settings, emit, controller.signal, session);
  const result = Promise.race([work, aborted]).finally(() => terminateWorker(session));

  return {
    cancel(): void {
      if (controller.signal.aborted) return;
      controller.abort();
      const cancelRequest: ExportRequest = { type: 'cancel', jobId: JOB_ID };
      session.worker?.postMessage(cancelRequest);
      terminateWorker(session);
    },
    result,
  };
}
