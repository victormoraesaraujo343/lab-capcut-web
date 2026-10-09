// Índice de amostras de vídeo: busca por tempo de apresentação e por sync anterior.

/** Amostra de vídeo em ordem de decodificação, com tempos já convertidos para microssegundos. */
export interface SampleInfo {
  /** Posição da amostra na ordem de decodificação (igual à posição no array). */
  index: number;
  /** Instante de apresentação (composition time) em microssegundos. */
  ctsUs: number;
  /** Duração da amostra em microssegundos. */
  durationUs: number;
  /** true quando a amostra é um quadro-chave (sync), decodificável sozinha. */
  isSync: boolean;
  /** Posição do primeiro byte da amostra no arquivo. */
  offset: number;
  /** Tamanho da amostra em bytes. */
  size: number;
}

interface CtsIndex {
  /** Valores de cts em ordem crescente. */
  ctsSorted: number[];
  /** Índices (ordem de decodificação) correspondentes a ctsSorted. */
  positions: number[];
}

const indexCache = new WeakMap<SampleInfo[], CtsIndex>();

/** Constrói (ou reaproveita) o índice ordenado por cts de um array de amostras. */
function getCtsIndex(samples: SampleInfo[]): CtsIndex {
  const cached = indexCache.get(samples);
  if (cached) {
    return cached;
  }
  const positions = samples.map((_, position) => position);
  positions.sort((a, b) => {
    const first = samples[a];
    const second = samples[b];
    const diff = (first?.ctsUs ?? 0) - (second?.ctsUs ?? 0);
    return diff !== 0 ? diff : a - b;
  });
  const ctsSorted = positions.map((position) => samples[position]?.ctsUs ?? 0);
  const built: CtsIndex = { ctsSorted, positions };
  indexCache.set(samples, built);
  return built;
}

/**
 * Devolve o index da amostra cujo intervalo [cts, cts+dur) contém o tempo, ou -1 se nenhuma contém.
 * Funciona com amostras em ordem de decodificação (B-frames incluídos).
 */
export function findSampleAtTime(samples: SampleInfo[], timeUs: number): number {
  const { ctsSorted, positions } = getCtsIndex(samples);
  let low = 0;
  let high = ctsSorted.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const cts = ctsSorted[middle] ?? 0;
    if (cts <= timeUs) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (found < 0) {
    return -1;
  }
  const sample = samples[positions[found] ?? -1];
  if (!sample) {
    return -1;
  }
  const endUs = sample.ctsUs + Math.max(sample.durationUs, 1);
  return timeUs < endUs ? sample.index : -1;
}

/**
 * Devolve o index do último quadro-chave em ordem de decodificação com index <= decodeIndex, ou -1 se não houver.
 */
export function findSyncBefore(samples: SampleInfo[], decodeIndex: number): number {
  const start = Math.min(decodeIndex, samples.length - 1);
  for (let index = start; index >= 0; index--) {
    if (samples[index]?.isSync) {
      return index;
    }
  }
  return -1;
}

/** Devolve os índices (ordem de decodificação) da amostra de menor e de maior cts. */
export function findEdgeIndexes(samples: SampleInfo[]): { first: number; last: number } {
  let first = 0;
  let last = 0;
  for (const sample of samples) {
    if (sample.ctsUs < (samples[first]?.ctsUs ?? 0)) {
      first = sample.index;
    }
    if (sample.ctsUs > (samples[last]?.ctsUs ?? 0)) {
      last = sample.index;
    }
  }
  return { first, last };
}

/** Devolve o index da amostra que contém o tempo; fora do intervalo, o primeiro ou o último; -1 se não há amostras. */
export function clampSampleIndex(samples: SampleInfo[], timeUs: number): number {
  if (samples.length === 0) {
    return -1;
  }
  const found = findSampleAtTime(samples, timeUs);
  if (found >= 0) {
    return found;
  }
  const edges = findEdgeIndexes(samples);
  return timeUs < 0 ? edges.first : edges.last;
}

/**
 * Diz se o decodificador pode continuar de nextIndex até targetIndex sem reiniciar no sync.
 * Exige que o alvo ainda não tenha sido alimentado e esteja até windowUs à frente do último cts alimentado.
 */
export function canContinueDecode(
  samples: SampleInfo[],
  nextIndex: number,
  targetIndex: number,
  maxFedCtsUs: number,
  windowUs: number,
): boolean {
  const target = samples[targetIndex];
  if (!target || nextIndex <= 0) {
    return false;
  }
  return nextIndex <= targetIndex && target.ctsUs - maxFedCtsUs <= windowUs;
}
