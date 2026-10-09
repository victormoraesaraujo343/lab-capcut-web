// Comparação pura de imagens RGBA: conta pixels que diferem demais da referência.

/** Limites da comparação: diferença por canal aceita e fração máxima de pixels ruins. */
export interface CompareOptions {
  /** Diferença máxima aceita em cada canal (0 a 255); padrão 8. */
  tolerance?: number;
  /** Fração máxima de pixels ruins para passar (0 a 1); padrão 0.005. */
  maxBadRatio?: number;
}

/** Resultado da comparação entre duas imagens. */
export interface CompareResult {
  /** true quando a fração de pixels ruins é aceitável. */
  ok: boolean;
  /** Fração de pixels com algum canal acima da tolerância. */
  badRatio: number;
  /** Maior diferença encontrada em qualquer canal. */
  maxDelta: number;
}

/** Compara duas imagens RGBA do mesmo tamanho; lança erro se os buffers não batem com width x height. */
export function compareImages(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  width: number,
  height: number,
  options: CompareOptions = {},
): CompareResult {
  const tolerance = options.tolerance ?? 8;
  const maxBadRatio = options.maxBadRatio ?? 0.005;
  const pixelCount = width * height;
  if (a.length !== pixelCount * 4 || b.length !== pixelCount * 4) {
    throw new Error('compare-size-mismatch');
  }

  let badPixels = 0;
  let maxDelta = 0;
  for (let p = 0; p < pixelCount; p++) {
    const offset = p * 4;
    let pixelMax = 0;
    for (let c = 0; c < 4; c++) {
      const delta = Math.abs((a[offset + c] ?? 0) - (b[offset + c] ?? 0));
      if (delta > pixelMax) pixelMax = delta;
    }
    if (pixelMax > maxDelta) maxDelta = pixelMax;
    if (pixelMax > tolerance) badPixels++;
  }

  const badRatio = pixelCount === 0 ? 0 : badPixels / pixelCount;
  return { ok: badRatio <= maxBadRatio, badRatio, maxDelta };
}
