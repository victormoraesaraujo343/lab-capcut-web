import { describe, expect, it } from 'vitest';
import { fitStage } from '@/features/preview/stageFit';

describe('fitStage', () => {
  it('encaixa 16:9 numa caixa alta e centraliza na vertical', () => {
    const rect = fitStage(400, 800, 1920, 1080);
    const width = 368;
    const height = (368 * 1080) / 1920;
    expect(rect.width).toBeCloseTo(width);
    expect(rect.height).toBeCloseTo(height);
    expect(rect.left).toBeCloseTo(16);
    expect(rect.top).toBeCloseTo((800 - height) / 2);
  });

  it('encaixa 16:9 numa caixa larga e centraliza na horizontal', () => {
    const rect = fitStage(1200, 400, 1920, 1080);
    const height = 368;
    const width = (1920 * 368) / 1080;
    expect(rect.height).toBeCloseTo(height);
    expect(rect.width).toBeCloseTo(width);
    expect(rect.left).toBeCloseTo((1200 - width) / 2);
    expect(rect.top).toBeCloseTo(16);
  });

  it('encaixa 9:16 numa caixa larga, limitado pela altura', () => {
    const rect = fitStage(1200, 400, 1080, 1920);
    const width = (1080 * 368) / 1920;
    expect(rect.height).toBeCloseTo(368);
    expect(rect.width).toBeCloseTo(width);
    expect(rect.left).toBeCloseTo((1200 - width) / 2);
    expect(rect.top).toBeCloseTo(16);
  });

  it('encaixa 9:16 numa caixa alta, limitado pela largura', () => {
    const rect = fitStage(400, 800, 1080, 1920);
    const height = (368 * 1920) / 1080;
    expect(rect.width).toBeCloseTo(368);
    expect(rect.height).toBeCloseTo(height);
    expect(rect.left).toBeCloseTo(16);
    expect(rect.top).toBeCloseTo((800 - height) / 2);
  });

  it('devolve zero quando o palco é menor que a margem', () => {
    expect(fitStage(20, 20, 1920, 1080)).toEqual({ width: 0, height: 0, left: 0, top: 0 });
  });
});
