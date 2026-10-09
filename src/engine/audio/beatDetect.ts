// Detecção de batidas em áudio mono: fluxo de energia em 3 bandas, limiar adaptativo e estimativa de BPM.

/** Tamanho da janela de análise, em amostras. */
const WINDOW = 1024;
/** Salto entre janelas consecutivas, em amostras (metade da janela). */
const HOP = 512;
/** Metade do intervalo, em quadros, usado na média móvel do limiar (~0,5 s). */
const ADAPTIVE_HALF_SPAN_FRAMES = 20;
/** Frequência de corte da banda dos graves, em Hz. */
const LOW_CUTOFF_HZ = 200;
/** Frequência de corte entre médios e agudos, em Hz. */
const MID_CUTOFF_HZ = 2000;
/** Energia média mínima da janela (quadrado do RMS) para o áudio contar como sinal. */
const MIN_FRAME_ENERGY = 1e-8;
/** Deslocamento do instante do ataque dentro da janela que dispara o pico, em amostras (3/4 da janela). */
const ONSET_OFFSET_SAMPLES = (WINDOW * 3) / 4;
/** Sensibilidade padrão (0..1). */
const DEFAULT_SENSITIVITY = 0.5;
/** Intervalo mínimo padrão entre batidas, em ms. */
const DEFAULT_MIN_INTERVAL_MS = 250;
/** Faixa de BPM aceita; tempos fora dela são dobrados ou divididos ao meio. */
const BPM_MIN = 70;
const BPM_MAX = 180;

/** Opções da detecção de batidas. */
export interface OnsetOptions {
  /** Sensibilidade de 0 (só ataques muito fortes) a 1 (ataques fracos também); padrão 0.5. */
  sensitivity?: number;
  /** Intervalo mínimo entre duas batidas, em ms; padrão 250. */
  minIntervalMs?: number;
}

/** Limita um número ao intervalo [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Energia por quadro (soma dos quadrados / WINDOW) de cada uma das 3 bandas, com o total de cada quadro. */
interface BandEnergies {
  low: Float64Array;
  mid: Float64Array;
  high: Float64Array;
}

/** Quantos quadros de análise cabem no sinal dado. */
function frameCount(sampleCount: number): number {
  return sampleCount < WINDOW ? 0 : Math.floor((sampleCount - WINDOW) / HOP) + 1;
}

/** Coeficiente de um filtro passa-baixa de um polo para a frequência de corte dada. */
function onePoleCoefficient(cutoffHz: number, sampleRate: number): number {
  return 1 - Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
}

/** Soma o quadrado de cada banda de uma amostra ao quadro f, se ele existe. */
function addSquares(
  low: Float64Array,
  mid: Float64Array,
  high: Float64Array,
  f: number,
  frames: number,
  lowSample: number,
  midSample: number,
  highSample: number,
): void {
  if (f < 0 || f >= frames) return;
  low[f] = (low[f] ?? 0) + lowSample * lowSample;
  mid[f] = (mid[f] ?? 0) + midSample * midSample;
  high[f] = (high[f] ?? 0) + highSample * highSample;
}

/**
 * Separa o sinal em graves (passa-baixa), médios (faixa) e agudos (passa-alta) e soma a energia de cada banda
 * em quadros de 1024 amostras com salto de 512. Cada amostra cai em exatamente dois quadros consecutivos.
 */
function computeBandEnergies(mono: Float32Array, sampleRate: number, frames: number): BandEnergies {
  const low = new Float64Array(frames);
  const mid = new Float64Array(frames);
  const high = new Float64Array(frames);
  const a1 = onePoleCoefficient(LOW_CUTOFF_HZ, sampleRate);
  const a2 = onePoleCoefficient(MID_CUTOFF_HZ, sampleRate);
  let lp1 = 0;
  let lp2 = 0;
  for (let i = 0; i < mono.length; i++) {
    const x = mono[i] ?? 0;
    lp1 += a1 * (x - lp1);
    lp2 += a2 * (x - lp2);
    const lowSample = lp1;
    const midSample = lp2 - lp1;
    const highSample = x - lp2;
    const k = Math.floor(i / HOP);
    addSquares(low, mid, high, k - 1, frames, lowSample, midSample, highSample);
    addSquares(low, mid, high, k, frames, lowSample, midSample, highSample);
  }
  for (let f = 0; f < frames; f++) {
    low[f] = (low[f] ?? 0) / WINDOW;
    mid[f] = (mid[f] ?? 0) / WINDOW;
    high[f] = (high[f] ?? 0) / WINDOW;
  }
  return { low, mid, high };
}

/** Fluxo positivo de energia: soma, nas 3 bandas, do aumento de energia em relação ao quadro anterior; normalizado pelo máximo (0..1). Null se não há sinal. */
function computeFlux(energies: BandEnergies, frames: number): Float64Array | null {
  const flux = new Float64Array(frames);
  let peakFlux = 0;
  let peakEnergy = 0;
  for (let f = 0; f < frames; f++) {
    const previous = f === 0 ? null : f - 1;
    let total = 0;
    for (const band of [energies.low, energies.mid, energies.high]) {
      const current = band[f] ?? 0;
      const before = previous === null ? 0 : (band[previous] ?? 0);
      total += Math.max(0, current - before);
    }
    flux[f] = total;
    peakFlux = Math.max(peakFlux, total);
    const frameEnergy = (energies.low[f] ?? 0) + (energies.mid[f] ?? 0) + (energies.high[f] ?? 0);
    peakEnergy = Math.max(peakEnergy, frameEnergy);
  }
  if (peakFlux <= 0 || peakEnergy < MIN_FRAME_ENERGY) return null;
  for (let f = 0; f < frames; f++) {
    flux[f] = (flux[f] ?? 0) / peakFlux;
  }
  return flux;
}

/** Média móvel do fluxo em torno de cada quadro, em uma janela de ±ADAPTIVE_HALF_SPAN_FRAMES. */
function localMeans(flux: Float64Array, frames: number): Float64Array {
  const prefix = new Float64Array(frames + 1);
  for (let f = 0; f < frames; f++) {
    prefix[f + 1] = (prefix[f] ?? 0) + (flux[f] ?? 0);
  }
  const means = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    const from = Math.max(0, f - ADAPTIVE_HALF_SPAN_FRAMES);
    const to = Math.min(frames - 1, f + ADAPTIVE_HALF_SPAN_FRAMES);
    const sum = (prefix[to + 1] ?? 0) - (prefix[from] ?? 0);
    means[f] = sum / (to - from + 1);
  }
  return means;
}

/** Índice da primeira posição, numa lista ordenada, com valor maior ou igual ao dado. */
function lowerBound(sorted: number[], value: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((sorted[mid] ?? 0) < value) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** Diz se há outra batida a menos de minIntervalMs de value, numa lista ordenada. */
function hasNeighbour(sorted: number[], value: number, minIntervalMs: number): boolean {
  const index = lowerBound(sorted, value);
  const after = sorted[index];
  const before = sorted[index - 1];
  return (after !== undefined && after - value < minIntervalMs) || (before !== undefined && value - before < minIntervalMs);
}

/**
 * Detecta os instantes das batidas (ataques) do áudio mono, em ms desde o início do sinal.
 * Limiar local = média móvel do fluxo × (2 − sensibilidade): sensibilidade maior aceita ataques mais fracos.
 * Picos locais são aceitos do mais forte para o mais fraco, respeitando o intervalo mínimo entre batidas.
 */
export function detectOnsets(mono: Float32Array, sampleRate: number, options: OnsetOptions = {}): number[] {
  if (!(sampleRate > 0)) return [];
  const sensitivity = clamp(options.sensitivity ?? DEFAULT_SENSITIVITY, 0, 1);
  const minIntervalMs = Math.max(0, options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS);
  const frames = frameCount(mono.length);
  if (frames === 0) return [];

  const energies = computeBandEnergies(mono, sampleRate, frames);
  const flux = computeFlux(energies, frames);
  if (flux === null) return [];
  const means = localMeans(flux, frames);
  const multiplier = 2 - sensitivity;

  const candidates: { frame: number; strength: number }[] = [];
  for (let f = 0; f < frames; f++) {
    const value = flux[f] ?? 0;
    const before = f === 0 ? -1 : (flux[f - 1] ?? 0);
    const after = f === frames - 1 ? -1 : (flux[f + 1] ?? 0);
    const isPeak = value >= before && value > after;
    if (isPeak && value > (means[f] ?? 0) * multiplier) {
      candidates.push({ frame: f, strength: value });
    }
  }
  candidates.sort((a, b) => b.strength - a.strength || a.frame - b.frame);

  const accepted: number[] = [];
  for (const candidate of candidates) {
    const ms = frameToMs(candidate.frame, sampleRate);
    if (hasNeighbour(accepted, ms, minIntervalMs)) continue;
    accepted.splice(lowerBound(accepted, ms), 0, ms);
  }
  return accepted;
}

/** Instante, em ms e arredondado a 0,1 ms, do ataque associado a um quadro. */
function frameToMs(frame: number, sampleRate: number): number {
  const samples = frame * HOP + ONSET_OFFSET_SAMPLES;
  return Math.round((samples / sampleRate) * 10000) / 10;
}

/** Estima o BPM pela mediana dos intervalos entre batidas, dobrado ou dividido para ficar entre 70 e 180; null se não houver intervalos. */
export function estimateTempo(onsetsMs: number[]): number | null {
  const intervals: number[] = [];
  for (let i = 1; i < onsetsMs.length; i++) {
    const gap = (onsetsMs[i] ?? 0) - (onsetsMs[i - 1] ?? 0);
    if (gap > 0) intervals.push(gap);
  }
  if (intervals.length === 0) return null;
  intervals.sort((a, b) => a - b);
  const middle = intervals.length >> 1;
  const median =
    intervals.length % 2 === 1
      ? (intervals[middle] ?? 0)
      : ((intervals[middle - 1] ?? 0) + (intervals[middle] ?? 0)) / 2;
  let bpm = 60000 / median;
  while (bpm < BPM_MIN) bpm *= 2;
  while (bpm > BPM_MAX) bpm /= 2;
  return Math.round(bpm * 10) / 10;
}
