import { describe, expect, it } from 'vitest';
import { reverseChannels } from '@/engine/audio/reverseAudio';

describe('reverseChannels', () => {
  it('inverte a ordem das amostras de cada canal', () => {
    const left = new Float32Array([1, 2, 3, 4]);
    const right = new Float32Array([0.5, -0.5]);
    const [outLeft, outRight] = reverseChannels([left, right]);
    expect(Array.from(outLeft ?? [])).toEqual([4, 3, 2, 1]);
    expect(Array.from(outRight ?? [])).toEqual([-0.5, 0.5]);
  });

  it('não altera os canais recebidos', () => {
    const channel = new Float32Array([1, 2, 3]);
    reverseChannels([channel]);
    expect(Array.from(channel)).toEqual([1, 2, 3]);
  });

  it('devolve arrays novos, sem compartilhar memória com a entrada', () => {
    const channel = new Float32Array([1, 2]);
    const [out] = reverseChannels([channel]);
    expect(out).not.toBe(channel);
  });

  it('aceita canal vazio e lista vazia', () => {
    expect(reverseChannels([])).toEqual([]);
    const [empty] = reverseChannels([new Float32Array(0)]);
    expect(empty?.length).toBe(0);
  });
});
