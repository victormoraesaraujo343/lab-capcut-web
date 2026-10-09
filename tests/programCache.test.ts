import { describe, expect, it } from 'vitest';
import { uniformValuesFor } from '../src/engine/render/programCache';
import type { EffectDefinition } from '../src/engine/render/registry';

const definition: EffectDefinition = {
  type: 'tint',
  category: 'effect',
  labelKey: 'effects.tint',
  fragmentSource: '',
  params: [
    { key: 'amount', type: 'number', default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: 'invert', type: 'boolean', default: false },
    { key: 'color', type: 'color', default: '#ff8000' },
    { key: 'mode', type: 'select', default: 'soft', options: ['hard', 'soft', 'screen'] },
  ],
};

describe('uniformValuesFor', () => {
  it('converte número, booleano, cor e seleção nos tipos dos uniforms', () => {
    const values = uniformValuesFor(definition, { amount: 0.25, invert: true, color: '#0000ff', mode: 'screen' });
    expect(values).toEqual({
      u_amount: 0.25,
      u_invert: 1,
      u_color: [0, 0, 1],
      u_mode: 2,
    });
  });

  it('usa o valor padrão quando o parâmetro não foi informado', () => {
    const values = uniformValuesFor(definition, {});
    expect(values.u_amount).toBe(0.5);
    expect(values.u_invert).toBe(0);
    expect(values.u_color).toEqual([1, 128 / 255, 0]);
    expect(values.u_mode).toBe(1);
  });

  it('cor inválida vira preto e seleção desconhecida vira a primeira opção', () => {
    const values = uniformValuesFor(definition, { color: 'vermelho', mode: 'inexistente' });
    expect(values.u_color).toEqual([0, 0, 0]);
    expect(values.u_mode).toBe(0);
  });

  it('aceita cor curta #rgb', () => {
    const values = uniformValuesFor(definition, { color: '#f00' });
    expect(values.u_color).toEqual([1, 0, 0]);
  });

  it('um efeito sem parâmetros não gera uniforms', () => {
    expect(uniformValuesFor({ ...definition, params: [] }, { amount: 1 })).toEqual({});
  });
});
