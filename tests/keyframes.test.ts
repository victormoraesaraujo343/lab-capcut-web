// Testes puros dos keyframes: easing, valores antes/entre/depois e avaliação da transformação.
import { describe, expect, it } from 'vitest';
import { ease, evaluateKeyframes, evaluateNumber, evaluateTransform } from '@/engine/render/keyframes';
import { defaultTransform, type Keyframe, type KeyframeMap } from '@/types';

describe('ease', () => {
  it('aplica as curvas nos pontos conhecidos', () => {
    expect(ease('linear', 0.5)).toBeCloseTo(0.5);
    expect(ease('easeIn', 0.5)).toBeCloseTo(0.25);
    expect(ease('easeOut', 0.5)).toBeCloseTo(0.75);
    expect(ease('easeInOut', 0.25)).toBeCloseTo(0.0625);
    expect(ease('easeInOut', 0.75)).toBeCloseTo(0.9375);
  });

  it('mantém hold em 0 até t chegar a 1', () => {
    expect(ease('hold', 0)).toBe(0);
    expect(ease('hold', 0.99)).toBe(0);
    expect(ease('hold', 1)).toBe(1);
  });

  it('limita t ao intervalo 0 a 1', () => {
    expect(ease('linear', -1)).toBe(0);
    expect(ease('linear', 2)).toBe(1);
  });
});

describe('evaluateKeyframes', () => {
  const list: Keyframe<number>[] = [
    { timeMs: 0, value: 0, easing: 'linear' },
    { timeMs: 1000, value: 100, easing: 'hold' },
    { timeMs: 2000, value: 200, easing: 'linear' },
  ];

  it('devolve o fallback quando não há lista', () => {
    expect(evaluateKeyframes(undefined, 500, 7)).toBe(7);
    expect(evaluateKeyframes([], 500, 7)).toBe(7);
  });

  it('antes do primeiro e depois do último devolve os extremos', () => {
    expect(evaluateKeyframes(list, -100, 7)).toBe(0);
    expect(evaluateKeyframes(list, 3000, 7)).toBe(200);
  });

  it('interpola entre pontos com o easing do ponto anterior', () => {
    expect(evaluateKeyframes(list, 500, 7)).toBeCloseTo(50);
    expect(evaluateKeyframes(list, 1500, 7)).toBe(100);
  });

  it('mantém o valor em hold até o próximo keyframe', () => {
    expect(evaluateKeyframes(list, 1000, 7)).toBe(100);
    expect(evaluateKeyframes(list, 1999, 7)).toBe(100);
  });

  it('usa easeIn do ponto anterior na interpolação', () => {
    const eased: Keyframe<number>[] = [
      { timeMs: 0, value: 0, easing: 'easeIn' },
      { timeMs: 1000, value: 1, easing: 'linear' },
    ];
    expect(evaluateKeyframes(eased, 500, 0)).toBeCloseTo(0.25);
  });
});

describe('evaluateNumber e evaluateTransform', () => {
  it('evaluateNumber usa o fallback quando a chave não existe', () => {
    expect(evaluateNumber({}, 'x', 100, 9)).toBe(9);
  });

  it('evaluateTransform anima x e crop.left e mantém o resto da base', () => {
    const base = { ...defaultTransform(), x: 10, opacity: 0.8 };
    const keys: KeyframeMap = {
      x: [
        { timeMs: 0, value: 0, easing: 'linear' },
        { timeMs: 1000, value: 100, easing: 'linear' },
      ],
      'crop.left': [
        { timeMs: 0, value: 0, easing: 'hold' },
        { timeMs: 500, value: 0.4, easing: 'linear' },
      ],
    };
    const result = evaluateTransform(base, keys, 250);
    expect(result.x).toBeCloseTo(25);
    expect(result.crop.left).toBe(0);
    expect(result.opacity).toBe(0.8);
    expect(result.y).toBe(0);
  });
});
