// Cache de trechos esticados (tom preservado), independente de AudioContext: guarda Float32Array, não AudioBuffer.

import type { Asset } from '../../types/project';
import { stretchChannels } from './stretchClient';

/** Casas de precisão da taxa de esticamento (0,01). */
const RATE_STEPS = 100;
/** Folga, em ms, cortada antes e depois do trecho para o WSOLA não errar nas bordas. */
const PAD_MS = 50;
/** Limite de memória do cache de trechos esticados, em bytes (~200 MB). */
const DEFAULT_LIMIT_BYTES = 200 * 1024 * 1024;

/** Trecho esticado: canais em Float32Array, prontos para virar AudioBuffer em qualquer contexto. */
export interface StretchedSegment {
  /** Um Float32Array por canal, todos com o mesmo tamanho. */
  channels: Float32Array<ArrayBuffer>[];
  /** Taxa de amostragem do trecho, em Hz (igual à do buffer de origem). */
  sampleRate: number;
}

interface CacheEntry {
  segment: StretchedSegment;
  bytes: number;
}

/** Trechos prontos, na ordem de chegada (o primeiro é o mais antigo). */
const entries = new Map<string, CacheEntry>();
/** Trechos em processamento no worker, para não pedir o mesmo duas vezes. */
const inFlight = new Map<string, Promise<StretchedSegment>>();
let totalBytes = 0;
let limitBytes = DEFAULT_LIMIT_BYTES;

/** Taxa de esticamento usada de fato: arredondada a 0,01, a mesma que o cache usa como chave. */
export function roundStretchRate(rate: number): number {
  return Math.round(rate * RATE_STEPS) / RATE_STEPS;
}

/** Devolve o trecho esticado já pronto no cache, ou null se ainda não foi calculado (síncrono). */
export function peekStretchedSegment(
  asset: Asset,
  startMediaMs: number,
  spanMediaMs: number,
  rate: number,
): StretchedSegment | null {
  return entries.get(segmentKey(asset.id, startMediaMs, spanMediaMs, rate))?.segment ?? null;
}

/**
 * Corta só o trecho [startMediaMs, startMediaMs + spanMediaMs] do buffer e o estica no worker (rate 2 = metade).
 * O resultado começa exatamente em startMediaMs; o cache é compartilhado por todos os contextos.
 */
export function getStretchedSegment(
  asset: Asset,
  buffer: AudioBuffer,
  startMediaMs: number,
  spanMediaMs: number,
  rate: number,
): Promise<StretchedSegment> {
  const rounded = roundStretchRate(rate);
  const key = segmentKey(asset.id, startMediaMs, spanMediaMs, rounded);
  const ready = entries.get(key);
  if (ready !== undefined) {
    return Promise.resolve(ready.segment);
  }
  const running = inFlight.get(key);
  if (running !== undefined) {
    return running;
  }
  const job = computeSegment(buffer, startMediaMs, spanMediaMs, rounded).then(
    (segment) => {
      inFlight.delete(key);
      store(key, segment);
      return segment;
    },
    (error: unknown) => {
      inFlight.delete(key);
      throw error;
    },
  );
  inFlight.set(key, job);
  return job;
}

/** Ajusta o limite de memória do cache, em bytes (usado pelos testes; padrão ~200 MB). */
export function setStretchCacheLimit(bytes: number): void {
  limitBytes = bytes;
  trimToLimit();
}

/** Esvazia o cache de trechos esticados e restaura o limite padrão. */
export function clearStretchedSegments(): void {
  entries.clear();
  inFlight.clear();
  totalBytes = 0;
  limitBytes = DEFAULT_LIMIT_BYTES;
}

/** Chave do cache: id do asset, início e duração do recorte em ms, e a taxa em centésimos. */
function segmentKey(assetId: string, startMediaMs: number, spanMediaMs: number, rate: number): string {
  return `${assetId}|${startMediaMs}|${spanMediaMs}|${Math.round(roundStretchRate(rate) * RATE_STEPS)}`;
}

/** Recorta o trecho com folga, estica no worker e devolve só o intervalo pedido. */
async function computeSegment(
  buffer: AudioBuffer,
  startMediaMs: number,
  spanMediaMs: number,
  rate: number,
): Promise<StretchedSegment> {
  const { sampleRate, length } = buffer;
  const reqFrom = clampSample(msToSamples(startMediaMs, sampleRate), length);
  const reqTo = clampSample(msToSamples(startMediaMs + spanMediaMs, sampleRate), length);
  const reqEnd = Math.max(reqFrom, reqTo);
  const padMs = msToSamples(PAD_MS, sampleRate);
  const padFrom = Math.max(0, reqFrom - padMs);
  const padTo = Math.min(length, reqEnd + padMs);

  const cut: Float32Array<ArrayBuffer>[] = [];
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    cut.push(buffer.getChannelData(channel).slice(padFrom, padTo));
  }
  const stretched = await stretchChannels(cut, sampleRate, rate);
  const lead = Math.round((reqFrom - padFrom) / rate);
  const outLength = Math.round((reqEnd - reqFrom) / rate);
  return {
    channels: stretched.map((data) => sliceChannel(data, lead, outLength)),
    sampleRate,
  };
}

/** Grava o trecho no cache e descarta os mais antigos se passar do limite de memória. */
function store(key: string, segment: StretchedSegment): void {
  const bytes = segment.channels.reduce((sum, channel) => sum + channel.byteLength, 0);
  const previous = entries.get(key);
  if (previous !== undefined) {
    totalBytes -= previous.bytes;
  }
  entries.delete(key);
  entries.set(key, { segment, bytes });
  totalBytes += bytes;
  trimToLimit();
}

/** Remove os trechos mais antigos até caber no limite, mantendo sempre o mais recente. */
function trimToLimit(): void {
  while (totalBytes > limitBytes && entries.size > 1) {
    const oldest = entries.entries().next();
    if (oldest.done) return;
    const [oldestKey, oldestEntry] = oldest.value;
    entries.delete(oldestKey);
    totalBytes -= oldestEntry.bytes;
  }
}

/** Cópia de `length` amostras a partir de `from`, com zeros onde o dado acaba. */
function sliceChannel(data: Float32Array<ArrayBuffer>, from: number, length: number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(Math.max(0, length));
  out.set(data.subarray(Math.max(0, from), Math.max(0, from) + out.length));
  return out;
}

function msToSamples(ms: number, sampleRate: number): number {
  return Math.max(0, Math.round((ms * sampleRate) / 1000));
}

function clampSample(sample: number, length: number): number {
  return Math.min(length, Math.max(0, sample));
}

