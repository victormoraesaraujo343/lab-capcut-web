// Cache genérico de quadros indexados por tempo, com remoção dos mais distantes do cursor.

/** Cache de itens indexados por tempo (µs), com capacidade limitada. */
export interface FrameCache<T> {
  /** Guarda um item no tempo dado; trocar o item de um tempo chama onEvict com o anterior. */
  put(timeUs: number, item: T): void;
  /** Devolve o item mais próximo do tempo dentro da tolerância, ou null. */
  getNearest(timeUs: number, toleranceUs: number): { timeUs: number; item: T } | null;
  /** Diz se existe um item exatamente neste tempo. */
  has(timeUs: number): boolean;
  /** Mantém só os `capacity` itens mais próximos do tempo; os demais são removidos com onEvict. */
  evictFarFrom(timeUs: number): void;
  /** Remove todos os itens, chamando onEvict em cada um. */
  clear(): void;
}

/** Cria um cache com capacidade fixa; onEvict é chamado para cada item removido (ex.: fechar um VideoFrame). */
export function createFrameCache<T>(capacity: number, onEvict: (item: T) => void): FrameCache<T> {
  const entries = new Map<number, T>();

  const remove = (timeUs: number): void => {
    const item = entries.get(timeUs);
    if (item === undefined) {
      return;
    }
    entries.delete(timeUs);
    onEvict(item);
  };

  return {
    put(timeUs, item) {
      const previous = entries.get(timeUs);
      if (previous !== undefined && previous !== item) {
        onEvict(previous);
      }
      entries.delete(timeUs);
      entries.set(timeUs, item);
    },
    getNearest(timeUs, toleranceUs) {
      let bestTime: number | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const time of entries.keys()) {
        const distance = Math.abs(time - timeUs);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestTime = time;
        }
      }
      if (bestTime === null || bestDistance > toleranceUs) {
        return null;
      }
      const item = entries.get(bestTime);
      return item === undefined ? null : { timeUs: bestTime, item };
    },
    has(timeUs) {
      return entries.has(timeUs);
    },
    evictFarFrom(timeUs) {
      if (entries.size <= capacity) {
        return;
      }
      const ranked = [...entries.keys()].sort((a, b) => Math.abs(a - timeUs) - Math.abs(b - timeUs));
      for (const time of ranked.slice(capacity)) {
        remove(time);
      }
    },
    clear() {
      for (const time of [...entries.keys()]) {
        remove(time);
      }
    },
  };
}
