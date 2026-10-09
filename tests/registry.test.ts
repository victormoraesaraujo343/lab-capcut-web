import { describe, expect, it } from 'vitest';
import {
  defaultParams,
  getEffect,
  listEffects,
  registerEffect,
  type EffectDefinition,
} from '../src/engine/render/registry';

function makeDef(type: string, category: EffectDefinition['category']): EffectDefinition {
  return {
    type,
    category,
    labelKey: `effect.${type}`,
    params: [
      { key: 'amount', type: 'number', default: 0.5, min: 0, max: 1, step: 0.01 },
      { key: 'invert', type: 'boolean', default: false },
      { key: 'mode', type: 'select', default: 'soft', options: ['soft', 'hard'] },
    ],
    fragmentSource: '#version 300 es\nvoid main() {}\n',
  };
}

describe('registry de efeitos', () => {
  it('registra e recupera uma definição pelo tipo', () => {
    const def = makeDef('test-get', 'filter');
    registerEffect(def);
    expect(getEffect('test-get')).toBe(def);
    expect(getEffect('test-inexistente')).toBeUndefined();
  });

  it('lança erro ao registrar o mesmo tipo duas vezes', () => {
    registerEffect(makeDef('test-dup', 'effect'));
    expect(() => registerEffect(makeDef('test-dup', 'effect'))).toThrow('effect-already-registered:test-dup');
  });

  it('filtra a listagem por categoria', () => {
    registerEffect(makeDef('test-list-filter', 'filter'));
    registerEffect(makeDef('test-list-transition', 'transition'));
    const filters = listEffects('filter').map((d) => d.type);
    expect(filters).toContain('test-list-filter');
    expect(filters).not.toContain('test-list-transition');
    const all = listEffects().map((d) => d.type);
    expect(all).toContain('test-list-transition');
  });

  it('devolve os valores padrão dos parâmetros como cópia nova', () => {
    registerEffect(makeDef('test-defaults', 'effect'));
    const first = defaultParams('test-defaults');
    expect(first).toEqual({ amount: 0.5, invert: false, mode: 'soft' });
    first.amount = 0.9;
    expect(defaultParams('test-defaults').amount).toBe(0.5);
  });

  it('devolve objeto vazio para tipo desconhecido', () => {
    expect(defaultParams('test-nada')).toEqual({});
  });
});
