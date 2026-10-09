import { describe, expect, it } from 'vitest';
import { ASPECT_PRESETS, sizeForAspect } from '@/engine/project/aspect';

describe('aspect', () => {
  it('presets têm os tamanhos esperados', () => {
    expect(ASPECT_PRESETS['16:9']).toEqual({ width: 1920, height: 1080 });
    expect(ASPECT_PRESETS['9:16']).toEqual({ width: 1080, height: 1920 });
    expect(ASPECT_PRESETS['1:1']).toEqual({ width: 1080, height: 1080 });
    expect(ASPECT_PRESETS['4:5']).toEqual({ width: 1080, height: 1350 });
    expect(ASPECT_PRESETS['4:3']).toEqual({ width: 1440, height: 1080 });
  });

  it('sizeForAspect devolve o preset da proporção', () => {
    expect(sizeForAspect('9:16', { width: 1920, height: 1080 })).toEqual({ width: 1080, height: 1920 });
  });

  it('sizeForAspect com free mantém o tamanho atual sem alias', () => {
    const current = { width: 800, height: 600 };
    const result = sizeForAspect('free', current);
    expect(result).toEqual({ width: 800, height: 600 });
    expect(result).not.toBe(current);
  });
});
