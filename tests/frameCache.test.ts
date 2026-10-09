import { describe, expect, it, vi } from 'vitest';
import { createFrameCache } from '../src/engine/decode/frameCache';

describe('createFrameCache', () => {
  it('devolve o item mais próximo dentro da tolerância', () => {
    const cache = createFrameCache<string>(10, () => undefined);
    cache.put(1000, 'a');
    cache.put(2000, 'b');
    expect(cache.getNearest(1400, 500)).toEqual({ timeUs: 1000, item: 'a' });
    expect(cache.getNearest(1600, 500)).toEqual({ timeUs: 2000, item: 'b' });
    expect(cache.getNearest(5000, 500)).toBeNull();
  });

  it('informa se há item exatamente no tempo', () => {
    const cache = createFrameCache<string>(10, () => undefined);
    cache.put(1000, 'a');
    expect(cache.has(1000)).toBe(true);
    expect(cache.has(1001)).toBe(false);
  });

  it('não remove nada ao inserir; a capacidade é imposta por evictFarFrom', () => {
    const onEvict = vi.fn<(item: string) => void>();
    const cache = createFrameCache<string>(2, onEvict);
    cache.put(1, 'a');
    cache.put(2, 'b');
    cache.put(3, 'c');
    expect(onEvict).not.toHaveBeenCalled();
    expect(cache.has(1)).toBe(true);
    cache.evictFarFrom(3);
    expect(cache.has(1)).toBe(false);
    expect(cache.has(2)).toBe(true);
    expect(cache.has(3)).toBe(true);
  });

  it('mantém só os itens mais próximos do cursor em evictFarFrom', () => {
    const onEvict = vi.fn<(item: number) => void>();
    const cache = createFrameCache<number>(3, onEvict);
    for (const time of [0, 100, 200, 300, 400, 500]) {
      cache.put(time, time);
    }
    cache.evictFarFrom(300);
    expect([0, 100, 200, 300, 400, 500].filter((time) => cache.has(time))).toEqual([200, 300, 400]);
    expect(onEvict.mock.calls.map(([item]) => item).sort((a, b) => a - b)).toEqual([0, 100, 500]);
  });

  it('chama onEvict ao trocar o item de um tempo e ao limpar', () => {
    const onEvict = vi.fn<(item: string) => void>();
    const cache = createFrameCache<string>(5, onEvict);
    cache.put(10, 'old');
    cache.put(10, 'new');
    expect(onEvict).toHaveBeenCalledWith('old');
    cache.clear();
    expect(onEvict).toHaveBeenLastCalledWith('new');
    expect(cache.has(10)).toBe(false);
    expect(cache.getNearest(10, 1000)).toBeNull();
  });
});
