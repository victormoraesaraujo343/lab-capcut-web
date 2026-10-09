// Cache de AudioBuffers esticados (tom preservado), por contexto, buffer e taxa arredondada a 0,01.

import { wsolaStretch } from './timeStretch';

/** Casas de precisão da taxa de esticamento (0,01). */
const RATE_STEPS = 100;

/** Buffers esticados: contexto -> buffer de origem -> taxa em centésimos -> buffer esticado. */
const cache = new WeakMap<BaseAudioContext, WeakMap<AudioBuffer, Map<number, AudioBuffer>>>();

/** Taxa de esticamento usada de fato: arredondada a 0,01, a mesma que o cache usa como chave. */
export function roundStretchRate(rate: number): number {
  return Math.round(rate * RATE_STEPS) / RATE_STEPS;
}

/**
 * Devolve o buffer esticado por `rate` (rate 2 = metade da duração), mantendo o tom.
 * Cada combinação de buffer e taxa é processada uma única vez por contexto.
 */
export function getStretchedBuffer(ctx: BaseAudioContext, buffer: AudioBuffer, rate: number): AudioBuffer {
  const key = Math.round(rate * RATE_STEPS);
  let byBuffer = cache.get(ctx);
  if (byBuffer === undefined) {
    byBuffer = new WeakMap<AudioBuffer, Map<number, AudioBuffer>>();
    cache.set(ctx, byBuffer);
  }
  let byRate = byBuffer.get(buffer);
  if (byRate === undefined) {
    byRate = new Map<number, AudioBuffer>();
    byBuffer.set(buffer, byRate);
  }
  const cached = byRate.get(key);
  if (cached !== undefined) return cached;

  const channels: Float32Array<ArrayBuffer>[] = [];
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    channels.push(wsolaStretch(buffer.getChannelData(channel), buffer.sampleRate, key / RATE_STEPS));
  }
  const length = channels[0]?.length ?? 0;
  const stretched = ctx.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
  channels.forEach((data, channel) => stretched.copyToChannel(data, channel));
  byRate.set(key, stretched);
  return stretched;
}
