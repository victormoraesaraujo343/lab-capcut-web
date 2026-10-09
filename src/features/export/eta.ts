// Estimativa do tempo restante de uma exportação: média móvel exponencial da velocidade de progresso.

/** Amostra mínima, em ms, antes de mostrar qualquer estimativa. */
const MIN_SAMPLE_MS = 2000;
/** Fração mínima do progresso antes de estimar (evita chutes no começo). */
const MIN_FRACTION = 0.02;
/** Peso de cada nova medição na média móvel (0 a 1; maior = reage mais rápido). */
const SMOOTHING = 0.2;

/** Estimador de tempo restante; update recebe a fração global (0 a 1) e o instante atual em ms. */
export interface EtaEstimator {
  /** Devolve os ms restantes, ou null enquanto não há amostra suficiente. */
  update(fraction: number, nowMs: number): number | null;
}

/** Cria um estimador novo, sem histórico. */
export function createEtaEstimator(): EtaEstimator {
  let sampleStartMs: number | null = null;
  let lastFraction = 0;
  let lastMs = 0;
  let speed: number | null = null;

  return {
    // Atualiza a velocidade média com a variação desde a última amostra e calcula o que falta.
    update(fraction: number, nowMs: number): number | null {
      if (!Number.isFinite(fraction) || !Number.isFinite(nowMs)) return null;
      if (sampleStartMs === null) {
        if (fraction < MIN_FRACTION) return null;
        sampleStartMs = nowMs;
        lastFraction = fraction;
        lastMs = nowMs;
        return null;
      }
      if (fraction > lastFraction && nowMs > lastMs) {
        const instant = (fraction - lastFraction) / (nowMs - lastMs);
        speed = speed === null ? instant : SMOOTHING * instant + (1 - SMOOTHING) * speed;
        lastFraction = fraction;
        lastMs = nowMs;
      }
      if (nowMs - sampleStartMs < MIN_SAMPLE_MS || speed === null || speed <= 0) return null;
      return Math.max(0, (1 - fraction) / speed);
    },
  };
}
