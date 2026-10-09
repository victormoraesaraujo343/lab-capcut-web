// Resposta ao impulso gerada por código (ruído com decaimento exponencial), para o ConvolverNode da reverberação.

/** Limites de duração, em segundos, da resposta ao impulso gerada. */
const MIN_SECONDS = 0.05;
const MAX_SECONDS = 10;

/** Respostas já geradas por contexto, para não recalcular a mesma reverberação a cada agendamento. */
const cache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

/**
 * Amostras de ruído branco com envelope exponencial: começa em 1 e cai para exp(-decay) no fim.
 * Determinística: o mesmo seed gera sempre as mesmas amostras.
 */
export function impulseSamples(length: number, decay: number, seed: number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(Math.max(0, Math.floor(length)));
  const count = out.length;
  if (count === 0) return out;
  const perSample = Math.exp(-Math.max(0, decay) / count);
  let state = (seed >>> 0) || 1;
  let envelope = 1;
  for (let i = 0; i < count; i++) {
    state = (state ^ (state << 13)) >>> 0;
    state = (state ^ (state >>> 17)) >>> 0;
    state = (state ^ (state << 5)) >>> 0;
    out[i] = (state / 0x80000000 - 1) * envelope;
    envelope *= perSample;
  }
  return out;
}

/** Cria (ou reaproveita, por contexto) um buffer estéreo de resposta ao impulso com a duração e o decaimento dados. */
export function generateImpulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const duration = Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, seconds));
  const key = `${duration.toFixed(3)}|${decay.toFixed(3)}`;
  let perContext = cache.get(ctx);
  if (perContext === undefined) {
    perContext = new Map<string, AudioBuffer>();
    cache.set(ctx, perContext);
  }
  const existing = perContext.get(key);
  if (existing !== undefined) return existing;
  const length = Math.max(1, Math.round(duration * ctx.sampleRate));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  buffer.copyToChannel(impulseSamples(length, decay, 0x1234567), 0);
  buffer.copyToChannel(impulseSamples(length, decay, 0x7654321), 1);
  perContext.set(key, buffer);
  return buffer;
}
