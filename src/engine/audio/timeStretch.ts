// Esticamento de tempo sem mudar o tom (WSOLA): muda a duração de um canal mantendo a altura do som.

/** Tamanho da janela de análise, em segundos. */
const WINDOW_S = 0.04;
/** Busca de correlação para cada lado, em segundos. */
const SEARCH_S = 0.01;

/**
 * Muda a duração de um canal de áudio mantendo o tom. rate = 2 gera metade da duração; rate = 0,5 o dobro.
 * Usa WSOLA: janelas de Hann sobrepostas, com a posição de cada janela ajustada pela maior correlação.
 */
export function wsolaStretch(input: Float32Array, sampleRate: number, rate: number): Float32Array<ArrayBuffer> {
  if (!(rate > 0) || !Number.isFinite(rate)) {
    throw new RangeError('A taxa de esticamento deve ser positiva.');
  }
  if (rate === 1) return new Float32Array(input);
  const outLength = Math.round(input.length / rate);
  if (outLength === 0 || input.length === 0) return new Float32Array(0);

  const win = Math.max(8, Math.round(WINDOW_S * sampleRate));
  const hop = win >> 1;
  const search = Math.max(1, Math.round(SEARCH_S * sampleRate));
  const window = hannWindow(win);
  // Cópia com folga de zeros no fim: as leituras de janela nunca saem do vetor.
  const padded = new Float32Array(input.length + 2 * win);
  padded.set(input);

  const frames = Math.ceil(outLength / hop);
  const acc = new Float32Array((frames - 1) * hop + win);
  const norm = new Float32Array(acc.length);
  let previous = 0;
  for (let k = 0; k < frames; k++) {
    const start = k === 0 ? 0 : bestOffset(padded, input.length, window, hop, previous, Math.round(k * hop * rate), search);
    previous = start;
    const base = k * hop;
    for (let i = 0; i < win; i++) {
      const w = window[i] ?? 0;
      acc[base + i] = (acc[base + i] ?? 0) + (padded[start + i] ?? 0) * w;
      norm[base + i] = (norm[base + i] ?? 0) + w;
    }
  }
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const n = norm[i] ?? 0;
    out[i] = n > 1e-6 ? (acc[i] ?? 0) / n : 0;
  }
  return out;
}

/** Janela de Hann periódica: soma 1 quando sobreposta em meio passo. */
function hannWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
  }
  return w;
}

/**
 * Posição de entrada da próxima janela: a que melhor continua o trecho anterior (correlação na metade
 * sobreposta), perto da posição ideal `nominal` (±search).
 */
function bestOffset(
  padded: Float32Array,
  inputLength: number,
  window: Float32Array,
  hop: number,
  previous: number,
  nominal: number,
  search: number,
): number {
  const target = previous + hop;
  const lo = Math.max(0, nominal - search);
  const hi = Math.min(inputLength, nominal + search);
  let best = Math.min(Math.max(0, nominal), inputLength);
  let bestScore = -Infinity;
  for (let c = lo; c <= hi; c++) {
    let score = 0;
    for (let i = 0; i < hop; i++) {
      score += (padded[c + i] ?? 0) * (window[i] ?? 0) * (padded[target + i] ?? 0);
    }
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}
