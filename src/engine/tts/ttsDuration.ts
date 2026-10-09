// Estimativa da duração de uma fala sintética, usada para dimensionar o clipe antes de a voz tocar.

/** Ritmo médio de fala em caracteres por segundo, na velocidade 1x. */
const CHARS_PER_SECOND = 14;

/** Duração mínima de um clipe de fala, em ms. */
const MIN_SPEECH_MS = 800;

/** Estima em ms quanto tempo a fala leva: caracteres / 14 por segundo, ajustado pela velocidade, com mínimo de 800 ms. */
export function estimateSpeechMs(text: string, rate: number): number {
  const chars = text.trim().length;
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
  const ms = ((chars / CHARS_PER_SECOND) / safeRate) * 1000;
  return Math.max(MIN_SPEECH_MS, Math.round(ms));
}
