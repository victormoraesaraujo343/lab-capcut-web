// Cliente da detecção de batidas: decodifica o áudio do asset na thread principal e roda a análise num worker.
import { createAudioBufferCache } from './audioBufferCache';
import type { Asset } from '../../types/project';

/** Taxa de amostragem usada para decodificar o áudio do asset, em Hz. */
const DECODE_SAMPLE_RATE = 44100;

/** Trecho da mídia original a analisar, em ms. */
export interface MediaRange {
  /** Início do trecho na mídia, em ms. */
  startMs: number;
  /** Fim do trecho na mídia, em ms. */
  endMs: number;
}

/** Resultado da detecção: batidas em ms de mídia e BPM estimado. */
export interface BeatsResult {
  /** Instantes das batidas, em ms desde o início da mídia original. */
  onsetsMs: number[];
  /** BPM estimado, ou null se não houver batidas suficientes. */
  bpm: number | null;
}

/** Pedido de detecção enviado ao worker; o mono é transferido e não pode mais ser usado aqui. */
export interface BeatsRequest {
  type: 'detect';
  jobId: number;
  mono: Float32Array;
  sampleRate: number;
  sensitivity: number;
}

/** Resposta do worker: batidas em ms do trecho enviado, ou erro. */
export type BeatsResponse =
  | { type: 'done'; jobId: number; onsetsMs: number[]; bpm: number | null }
  | { type: 'error'; jobId: number; message: string };

/** Job aguardando resposta do worker. */
interface PendingBeatsJob {
  resolve: (result: BeatsResult) => void;
  reject: (reason: unknown) => void;
}

/** Worker único, criado sob demanda. */
let worker: Worker | null = null;
/** Jobs ainda sem resposta, por id. */
const pendingJobs = new Map<number, PendingBeatsJob>();
/** Próximo id de job. */
let nextJobId = 1;

/**
 * Detecta as batidas do trecho do asset (áudio ou vídeo) e devolve os instantes em ms de mídia.
 * Null se o asset não tem áudio decodificável.
 */
export async function detectAssetBeats(
  asset: Asset,
  range: MediaRange,
  sensitivity: number,
): Promise<BeatsResult | null> {
  const cache = createAudioBufferCache(new OfflineAudioContext(1, 1, DECODE_SAMPLE_RATE));
  const audio = await cache.get(asset);
  if (audio === null) return null;
  const sampleRate = audio.sampleRate;
  const start = clampIndex(Math.floor((range.startMs * sampleRate) / 1000), audio.length);
  const end = clampIndex(Math.ceil((range.endMs * sampleRate) / 1000), audio.length);
  if (end <= start) return { onsetsMs: [], bpm: null };
  const mono = downmixRange(audio, start, end);
  const sliceStartMs = (start / sampleRate) * 1000;
  const result = await runDetection(mono, sampleRate, sensitivity);
  return { onsetsMs: result.onsetsMs.map((ms) => ms + sliceStartMs), bpm: result.bpm };
}

/** Prende um índice de amostra a [0, total]. */
function clampIndex(index: number, total: number): number {
  return Math.min(total, Math.max(0, index));
}

/** Média dos canais do intervalo [start, end) num único canal mono em um array novo. */
function downmixRange(audio: AudioBuffer, start: number, end: number): Float32Array {
  const mono = new Float32Array(end - start);
  const channels = audio.numberOfChannels;
  for (let channel = 0; channel < channels; channel++) {
    const data = audio.getChannelData(channel);
    for (let i = 0; i < mono.length; i++) {
      mono[i] = (mono[i] ?? 0) + (data[start + i] ?? 0) / channels;
    }
  }
  return mono;
}

/** Envia o mono ao worker e espera as batidas do trecho. */
function runDetection(mono: Float32Array, sampleRate: number, sensitivity: number): Promise<BeatsResult> {
  const jobId = nextJobId++;
  return new Promise<BeatsResult>((resolve, reject) => {
    pendingJobs.set(jobId, { resolve, reject });
    const request: BeatsRequest = { type: 'detect', jobId, mono, sampleRate, sensitivity };
    getWorker().postMessage(request, [mono.buffer]);
  });
}

/** Devolve o worker, criando-o na primeira chamada. */
function getWorker(): Worker {
  if (worker !== null) return worker;
  const created = new Worker(new URL('../workers/beats.worker.ts', import.meta.url), { type: 'module' });
  created.onmessage = (event: MessageEvent<BeatsResponse>) => handleResponse(event.data);
  created.onerror = () => failAll(new Error('Falha no worker de batidas.'));
  worker = created;
  return created;
}

/** Entrega a resposta do worker ao job correspondente. */
function handleResponse(response: BeatsResponse): void {
  const job = pendingJobs.get(response.jobId);
  if (job === undefined) return;
  pendingJobs.delete(response.jobId);
  if (response.type === 'error') {
    job.reject(new Error(response.message));
    return;
  }
  job.resolve({ onsetsMs: response.onsetsMs, bpm: response.bpm });
}

/** Rejeita todos os jobs pendentes e descarta o worker, que será recriado no próximo uso. */
function failAll(error: Error): void {
  for (const job of pendingJobs.values()) job.reject(error);
  pendingJobs.clear();
  worker?.terminate();
  worker = null;
}
