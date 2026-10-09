import type { MediaRequest, MediaResponse } from '../workers/mediaProtocol';
import { MediaImportError } from './errors';
import MediaWorker from '../workers/media.worker?worker&inline';

const THUMB_BATCH_SIZE = 10;
const THUMB_MAX_COUNT = 300;
const THUMB_TARGET_WIDTH = 160;
const SHORT_VIDEO_THUMB_MS = 100;
const WAVEFORM_SAMPLE_RATE = 44100;
const LOAD_TIMEOUT_MS = 15000;
const SEEK_TIMEOUT_MS = 5000;

/** Tamanho máximo (bytes) de arquivo para calcular a forma de onda; acima disso devolve []. */
export const WAVEFORM_MAX_BYTES = 300 * 1024 * 1024;

interface PendingRequest {
  resolve: (response: MediaResponse) => void;
  reject: (error: Error) => void;
}

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, PendingRequest>();

/** Devolve o worker único, criando-o na primeira necessidade. */
function getWorker(): Worker {
  if (worker) {
    return worker;
  }
  const created = new MediaWorker();
  created.onmessage = (event: MessageEvent<MediaResponse>) => {
    const response = event.data;
    const entry = pending.get(response.requestId);
    if (!entry) {
      return;
    }
    pending.delete(response.requestId);
    if (response.type === 'error') {
      entry.reject(new Error(response.message));
    } else {
      entry.resolve(response);
    }
  };
  created.onerror = (event: ErrorEvent) => {
    rejectAll(new Error(event.message || 'Falha no worker de mídia'));
    terminateMediaWorker();
  };
  worker = created;
  return created;
}

/** Rejeita todas as requisições pendentes com o mesmo erro. */
function rejectAll(error: Error): void {
  for (const entry of pending.values()) {
    entry.reject(error);
  }
  pending.clear();
}

/** Envia uma requisição ao worker e aguarda a resposta pelo requestId. */
function sendRequest(
  build: (requestId: number) => MediaRequest,
  transfer: Transferable[],
): Promise<MediaResponse> {
  const requestId = nextRequestId++;
  const request = build(requestId);
  const target = getWorker();
  return new Promise<MediaResponse>((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    target.postMessage(request, transfer);
  });
}

/** Aguarda o vídeo concluir um seek até o tempo alvo (em segundos), com limite de tempo. */
function seekVideo(video: HTMLVideoElement, seconds: number): Promise<void> {
  if (Math.abs(video.currentTime - seconds) < 0.001 && video.readyState >= 2) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Falha ao posicionar o vídeo'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new MediaImportError('timeout'));
    }, SEEK_TIMEOUT_MS);
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = seconds;
  });
}

/** Aguarda o vídeo ter metadados e dados suficientes para desenhar um frame, com limite de tempo. */
function loadVideo(video: HTMLVideoElement): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Não foi possível carregar o vídeo'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new MediaImportError('timeout'));
    }, LOAD_TIMEOUT_MS);
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('loadeddata', onLoaded);
    video.addEventListener('error', onError);
  });
}

/**
 * Lista os tempos (ms) das miniaturas cobrindo o vídeo inteiro, com no máximo maxCount itens.
 * Se a duração couber em maxCount intervalos, usa intervalMs; senão alarga o intervalo.
 */
export function thumbnailTimes(durationMs: number, intervalMs: number, maxCount: number): number[] {
  const step = durationMs / intervalMs > maxCount ? Math.ceil(durationMs / maxCount) : intervalMs;
  const times: number[] = [];
  for (let t = 0; t < durationMs && times.length < maxCount; t += step) {
    times.push(t);
  }
  if (times.length === 0) {
    const onlyTime = durationMs > SHORT_VIDEO_THUMB_MS ? SHORT_VIDEO_THUMB_MS : 0;
    times.push(onlyTime);
  }
  return times;
}

/** Gera miniaturas JPEG do vídeo no caminho basePath, em ordem, e devolve os caminhos. */
export async function generateThumbnails(
  file: File,
  durationMs: number,
  basePath: string,
  intervalMs = 2000,
): Promise<string[]> {
  const video = document.createElement('video');
  const objectUrl = URL.createObjectURL(file);
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = objectUrl;

  try {
    const times = thumbnailTimes(durationMs, intervalMs, THUMB_MAX_COUNT);
    const batches: Promise<MediaResponse>[] = [];
    let batchFrames: ImageBitmap[] = [];
    let batchStart = 0;

    const flush = (): void => {
      const frames = batchFrames;
      const startIndex = batchStart;
      batchFrames = [];
      batchStart = startIndex + frames.length;
      batches.push(
        sendRequest(
          (requestId) => ({
            type: 'thumbs',
            requestId,
            frames,
            basePath,
            startIndex,
            targetWidth: THUMB_TARGET_WIDTH,
          }),
          frames,
        ),
      );
    };

    try {
      await loadVideo(video);
      for (const timeMs of times) {
        await seekVideo(video, timeMs / 1000);
        const frame = await createImageBitmap(video);
        batchFrames.push(frame);
        if (batchFrames.length >= THUMB_BATCH_SIZE) {
          flush();
        }
      }
      if (batchFrames.length > 0) {
        flush();
      }
    } catch (error) {
      for (const frame of batchFrames) {
        frame.close();
      }
      batchFrames = [];
      await Promise.allSettled(batches);
      throw error;
    }

    const settled = await Promise.allSettled(batches);
    const paths: string[] = [];
    for (const result of settled) {
      if (result.status === 'rejected') {
        throw result.reason instanceof Error
          ? result.reason
          : new Error('Falha ao gerar miniaturas');
      }
      const response = result.value;
      if (response.type === 'thumbs-done') {
        paths.push(...response.paths);
      } else if (response.type === 'error') {
        throw new Error(response.message);
      }
    }
    return paths;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

/** Calcula picos normalizados da forma de onda do arquivo; lista vazia se não houver áudio ou se o arquivo for grande demais. */
export async function generateWaveform(file: File, buckets = 1000): Promise<number[]> {
  if (file.size > WAVEFORM_MAX_BYTES) {
    return [];
  }
  const buffer = await file.arrayBuffer();
  const context = new OfflineAudioContext(1, 1, WAVEFORM_SAMPLE_RATE);
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(buffer);
  } catch {
    return [];
  }

  const channels: Float32Array[] = [];
  for (let i = 0; i < decoded.numberOfChannels; i++) {
    channels.push(decoded.getChannelData(i).slice());
  }

  const response = await sendRequest(
    (requestId) => ({ type: 'peaks', requestId, channels, buckets }),
    channels.map((channel) => channel.buffer),
  );
  if (response.type === 'peaks-done') {
    return response.peaks;
  }
  if (response.type === 'error') {
    throw new Error(response.message);
  }
  throw new Error('Resposta inesperada do worker de mídia');
}

/** Encerra o worker de mídia e rejeita requisições ainda pendentes. */
export function terminateMediaWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  rejectAll(new Error('Worker de mídia encerrado'));
}
