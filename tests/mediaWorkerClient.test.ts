import { describe, expect, it } from 'vitest';
import { thumbnailTimes } from '../src/engine/decode/mediaWorkerClient';

describe('thumbnailTimes', () => {
  it('usa um único tempo para vídeo curto', () => {
    expect(thumbnailTimes(50, 2000, 300)).toEqual([0]);
    expect(thumbnailTimes(0, 2000, 300)).toEqual([0]);
  });

  it('gera um tempo a cada 2s para vídeo de 10s', () => {
    expect(thumbnailTimes(10000, 2000, 300)).toEqual([0, 2000, 4000, 6000, 8000]);
  });

  it('alarga o intervalo para vídeo de 2h e cobre até o fim com 300 itens', () => {
    const durationMs = 2 * 60 * 60 * 1000;
    const times = thumbnailTimes(durationMs, 2000, 300);
    expect(times).toHaveLength(300);
    expect(times[0]).toBe(0);
    expect(times[1]).toBe(Math.ceil(durationMs / 300));
    const last = times[times.length - 1] ?? 0;
    expect(last).toBeLessThan(durationMs);
    expect(last + Math.ceil(durationMs / 300)).toBeGreaterThanOrEqual(durationMs);
  });
});
