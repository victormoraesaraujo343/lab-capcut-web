// Leitura de metadados (duração, dimensões e fps) de mídia importada, pelos elementos e APIs do navegador.

import { MediaImportError } from './errors';
import type { ImportableKind } from './mediaKind';

/** Metadados lidos de um arquivo de mídia. */
export interface MediaMetadata {
  /** Duração em ms (ausente para imagens). */
  durationMs?: number;
  /** Largura em pixels. */
  width?: number;
  /** Altura em pixels. */
  height?: number;
  /** Quadros por segundo (somente vídeo). */
  fps?: number;
}

const COMMON_FPS: readonly number[] = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];
const FALLBACK_FPS = 30;
const DEFAULT_TIMEOUT_MS = 15000;

/** Arredonda uma taxa de quadros medida para o valor comum mais próximo; usa 30 se a medida for inválida. */
export function snapFps(measured: number): number {
  if (!Number.isFinite(measured) || measured <= 0) return FALLBACK_FPS;
  let best = FALLBACK_FPS;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const candidate of COMMON_FPS) {
    const diff = Math.abs(candidate - measured);
    if (diff < bestDiff) {
      best = candidate;
      bestDiff = diff;
    }
  }
  return best;
}

/** Espera o evento de metadados carregados; rejeita com 'decode' em erro e 'timeout' ao esgotar o tempo. */
function waitForMetadata(element: HTMLMediaElement, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      clearTimeout(timer);
      element.removeEventListener('loadedmetadata', onLoaded);
      element.removeEventListener('error', onError);
    };
    const onLoaded = (): void => {
      cleanup();
      resolve();
    };
    const onError = (): void => {
      cleanup();
      reject(new MediaImportError('decode'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new MediaImportError('timeout'));
    }, timeoutMs);
    element.addEventListener('loadedmetadata', onLoaded);
    element.addEventListener('error', onError);
  });
}

/** Converte a duração do elemento em ms; lança 'decode' se for Infinity ou NaN. */
function readDurationMs(element: HTMLMediaElement): number {
  const seconds = element.duration;
  if (!Number.isFinite(seconds)) throw new MediaImportError('decode');
  return Math.round(seconds * 1000);
}

/** Mede o fps do vídeo tocando-o mudo e comparando dois quadros; usa 30 se não for possível medir. */
function measureFps(video: HTMLVideoElement, timeoutMs: number): Promise<number> {
  if (typeof video.requestVideoFrameCallback !== 'function') return Promise.resolve(FALLBACK_FPS);
  return new Promise<number>((resolve) => {
    let firstMediaTime: number | undefined;
    let settled = false;
    const finish = (fps: number): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.pause();
      resolve(fps);
    };
    const onFrame: VideoFrameRequestCallback = (_now, metadata) => {
      if (firstMediaTime === undefined) {
        firstMediaTime = metadata.mediaTime;
        video.requestVideoFrameCallback(onFrame);
        return;
      }
      const delta = metadata.mediaTime - firstMediaTime;
      finish(delta > 0 ? snapFps(1 / delta) : FALLBACK_FPS);
    };
    const timer = setTimeout(() => finish(FALLBACK_FPS), timeoutMs);
    video.play().then(
      () => video.requestVideoFrameCallback(onFrame),
      () => finish(FALLBACK_FPS),
    );
  });
}

/** Cria um elemento de mídia com o arquivo, aguarda os metadados e executa `work`; sempre libera o elemento e a URL. */
async function withMediaElement<T extends HTMLMediaElement>(
  tagName: 'video' | 'audio',
  file: File,
  timeoutMs: number,
  work: (element: T) => Promise<MediaMetadata>,
): Promise<MediaMetadata> {
  const url = URL.createObjectURL(file);
  const element = document.createElement(tagName) as T;
  element.preload = 'metadata';
  element.muted = true;
  element.src = url;
  try {
    await waitForMetadata(element, timeoutMs);
    return await work(element);
  } finally {
    element.pause();
    element.removeAttribute('src');
    element.load();
    URL.revokeObjectURL(url);
  }
}

/** Lê duração, largura, altura e fps de um vídeo. */
function readVideoMetadata(file: File, timeoutMs: number): Promise<MediaMetadata> {
  return withMediaElement<HTMLVideoElement>('video', file, timeoutMs, async (video) => {
    const durationMs = readDurationMs(video);
    const fps = await measureFps(video, timeoutMs);
    return { durationMs, width: video.videoWidth, height: video.videoHeight, fps };
  });
}

/** Lê a duração de um áudio. */
function readAudioMetadata(file: File, timeoutMs: number): Promise<MediaMetadata> {
  return withMediaElement<HTMLAudioElement>('audio', file, timeoutMs, async (audio) => ({
    durationMs: readDurationMs(audio),
  }));
}

/** Lê largura e altura de uma imagem, sem manter o bitmap aberto. */
async function readImageMetadata(file: File): Promise<MediaMetadata> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new MediaImportError('decode');
  }
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

/** Lê os metadados de um arquivo de mídia do tipo informado; rejeita com MediaImportError em caso de falha. */
export async function readMediaMetadata(
  file: File,
  kind: ImportableKind,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<MediaMetadata> {
  if (kind === 'image') return readImageMetadata(file);
  if (kind === 'audio') return readAudioMetadata(file, timeoutMs);
  return readVideoMetadata(file, timeoutMs);
}
