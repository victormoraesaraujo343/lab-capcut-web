import { describe, expect, it } from 'vitest';
import { thumbFileName } from '../src/engine/workers/mediaProtocol';

describe('thumbFileName', () => {
  it('preenche o índice com 4 dígitos', () => {
    expect(thumbFileName(0)).toBe('0000.jpg');
    expect(thumbFileName(7)).toBe('0007.jpg');
    expect(thumbFileName(42)).toBe('0042.jpg');
  });

  it('mantém índices com mais de 4 dígitos sem cortar', () => {
    expect(thumbFileName(12345)).toBe('12345.jpg');
  });
});
