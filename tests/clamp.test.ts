import { describe, expect, it } from 'vitest';
import { clamp } from '../src/utils/clamp';

describe('clamp', () => {
  it('mantém valores dentro do intervalo', () => {
    expect(clamp(50, 0, 100)).toBe(50);
  });

  it('limita valores abaixo do mínimo', () => {
    expect(clamp(-10, 0, 100)).toBe(0);
  });

  it('limita valores acima do máximo', () => {
    expect(clamp(250, 0, 100)).toBe(100);
  });

  it('aceita os limites exatos', () => {
    expect(clamp(0, 0, 100)).toBe(0);
    expect(clamp(100, 0, 100)).toBe(100);
  });
});
