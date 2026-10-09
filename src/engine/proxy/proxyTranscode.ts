// Cliente da transcodificação de prévia leve: monta o projeto temporário de um vídeo e roda o worker, que devolve o MP4 540p.
import type { Asset, Clip, Project, Track } from '@/types';
import { defaultAudioFx, defaultSpeed, defaultTransform } from '@/types';
import type { ExportRequest, ExportResponse, ResolvedExport } from '@/types/export';
import { proxyFps, proxySize } from './proxyPolicy';
import ProxyWorker from '../workers/proxy.worker?worker&inline';

/** Taxa de bits da cópia leve, em bits por segundo. */
export const PROXY_VIDEO_BITRATE = 2_500_000;
/** Codec H.264 baseline da cópia leve (máxima compatibilidade para a prévia). */
export const PROXY_VIDEO_CODEC = 'avc1.42E01F';
/** Mensagem de rejeição quando a cópia é cancelada. */
export const PROXY_CANCELLED = 'cancelled';
/** Id do único trabalho de cada cópia (cada uma tem o próprio worker). */
const PROXY_JOB_ID = 1;
/** Ids do projeto temporário de uma cópia. */
const PROXY_TRACK_ID = 'proxy-track';
const PROXY_CLIP_ID = 'proxy-clip';

/** Controle de uma transcodificação em andamento. */
export interface ProxyHandle {
  /** Cancela a transcodificação; o resultado é rejeitado com PROXY_CANCELLED. */
  cancel(): void;
  /** Resolve com o MP4 leve ou rejeita com o código do erro. */
  result: Promise<Blob>;
}

/** Monta o projeto temporário de uma cópia: um único clipe com o vídeo inteiro, em velocidade 1, sem efeitos. */
export function buildProxyProject(asset: Asset): Project {
  const durationMs = Math.max(0, Math.round(asset.durationMs ?? 0));
  const clip: Clip = {
    id: PROXY_CLIP_ID,
    assetId: asset.id,
    trackId: PROXY_TRACK_ID,
    startMs: 0,
    durationMs,
    trimInMs: 0,
    trimOutMs: 0,
    transform: defaultTransform(),
    speed: defaultSpeed(),
    volume: 1,
    keyframes: {},
    filters: [],
    effects: [],
    audio: defaultAudioFx(),
    reversed: false,
  };
  const track: Track = {
    id: PROXY_TRACK_ID,
    kind: 'video',
    name: asset.name,
    muted: true,
    locked: false,
    hidden: false,
    clips: [clip],
  };
  const now = Date.now();
  return {
    id: `${asset.id}-proxy`,
    name: asset.name,
    width: asset.width ?? 0,
    height: asset.height ?? 0,
    fps: proxyFps(asset.fps),
    aspectRatio: 'free',
    durationMs,
    tracks: [track],
    assets: [asset],
    folders: [],
    markers: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Configuração de codificação da cópia leve: MP4 H.264 sem áudio, 540p, 2,5 Mbps, quadro-chave a cada segundo. */
export function proxyExportConfig(asset: Asset): ResolvedExport {
  const size = proxySize(asset.width ?? 0, asset.height ?? 0);
  const fps = proxyFps(asset.fps);
  return {
    format: 'mp4',
    width: size.width,
    height: size.height,
    fps,
    videoBitrate: PROXY_VIDEO_BITRATE,
    audioBitrate: 0,
    videoCodec: PROXY_VIDEO_CODEC,
    audioCodec: '',
    keyFrameInterval: fps,
    startMs: 0,
    endMs: Math.max(0, Math.round(asset.durationMs ?? 0)),
    fileName: `${asset.name}.mp4`,
    mimeType: 'video/mp4',
  };
}

/** Inicia a transcodificação da cópia leve de um vídeo; onProgress recebe a fração 0..1. */
export function startProxyTranscode(asset: Asset, onProgress: (fraction: number) => void): ProxyHandle {
  if (!(asset.durationMs !== undefined && asset.durationMs > 0)) {
    return { cancel: () => undefined, result: Promise.reject(new Error('empty')) };
  }
  const worker = new ProxyWorker();
  let fail: (error: Error) => void = () => undefined;
  const result = new Promise<Blob>((resolve, reject) => {
    fail = reject;
    worker.onmessage = (event: MessageEvent<ExportResponse>) => {
      const message = event.data;
      if (message.type === 'progress') {
        onProgress(message.total > 0 ? message.done / message.total : 0);
      } else if (message.type === 'done') {
        worker.terminate();
        resolve(new Blob([message.data], { type: message.mimeType }));
      } else if (message.type === 'error') {
        worker.terminate();
        reject(new Error(message.code));
      } else {
        worker.terminate();
        reject(new Error(PROXY_CANCELLED));
      }
    };
    const crash = (): void => {
      worker.terminate();
      reject(new Error('generic'));
    };
    worker.onerror = crash;
    worker.onmessageerror = crash;
    const request: ExportRequest = {
      type: 'start',
      jobId: PROXY_JOB_ID,
      project: buildProxyProject(asset),
      config: proxyExportConfig(asset),
      audio: null,
      assetBaseUrl: document.baseURI,
    };
    worker.postMessage(request);
  });
  return {
    cancel(): void {
      const cancelRequest: ExportRequest = { type: 'cancel', jobId: PROXY_JOB_ID };
      worker.postMessage(cancelRequest);
      worker.terminate();
      fail(new Error(PROXY_CANCELLED));
    },
    result,
  };
}
