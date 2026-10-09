import { describe, expect, it } from 'vitest';
import { COLOR_ADJUST_PARAMS, COLOR_ADJUST_TYPE, colorAdjustDefinition } from '../src/engine/render/filters/colorAdjust';
import { FILTER_PRESETS, presetThumbnailColor, presetToFilter } from '../src/engine/render/filters/filterPresets';
import { registerFilters } from '../src/engine/render/filters';
import { getEffect } from '../src/engine/render/registry';

describe('filtros prontos', () => {
  it('são exatamente 25 e têm ids únicos', () => {
    expect(FILTER_PRESETS).toHaveLength(25);
    const ids = FILTER_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(25);
  });

  it('usam só parâmetros existentes e dentro dos limites com intensidade 1', () => {
    for (const preset of FILTER_PRESETS) {
      const filter = presetToFilter(preset.id, 1);
      for (const [key, value] of Object.entries(preset.params)) {
        const spec = COLOR_ADJUST_PARAMS.find((p) => p.key === key);
        expect(spec, `${preset.id} usa parâmetro desconhecido ${key}`).toBeDefined();
        if (!spec || value === undefined) continue;
        expect(value, `${preset.id}.${key}`).toBeGreaterThanOrEqual(spec.min ?? -Infinity);
        expect(value, `${preset.id}.${key}`).toBeLessThanOrEqual(spec.max ?? Infinity);
        expect(filter.params[key]).toBeCloseTo(value, 9);
      }
    }
  });

  it('todos os labelKey seguem filters.names.<id>', () => {
    for (const preset of FILTER_PRESETS) {
      expect(preset.labelKey).toBe(`filters.names.${preset.id}`);
    }
  });
});

describe('presetToFilter', () => {
  it('cria instância colorAdjust com todos os parâmetros e id novo a cada chamada', () => {
    const a = presetToFilter('warm', 1);
    const b = presetToFilter('warm', 1);
    expect(a.type).toBe(COLOR_ADJUST_TYPE);
    expect(a.id).not.toBe(b.id);
    expect(Object.keys(a.params).sort()).toEqual([...COLOR_ADJUST_PARAMS.map((p) => p.key), 'intensity', 'presetId'].sort());
    expect(a.params['presetId']).toBe('warm');
    expect(a.params['intensity']).toBe(1);
  });

  it('intensidade 0 devolve os valores neutros', () => {
    const filter = presetToFilter('noir', 0);
    for (const spec of COLOR_ADJUST_PARAMS) {
      expect(filter.params[spec.key]).toBe(spec.default);
    }
  });

  it('intensidade 0.5 fica no meio entre neutro e o filtro', () => {
    const full = presetToFilter('warm', 1);
    const half = presetToFilter('warm', 0.5);
    expect(half.params.temperature as number).toBeCloseTo((full.params.temperature as number) / 2, 9);
  });

  it('lança erro para id desconhecido', () => {
    expect(() => presetToFilter('nao-existe')).toThrow('filter-preset-unknown:nao-existe');
  });
});

describe('presetThumbnailColor', () => {
  it('devolve RGB dentro de 0..1', () => {
    for (const preset of FILTER_PRESETS) {
      const [r, g, b] = presetThumbnailColor(preset.id, [0.4, 0.6, 0.9]);
      for (const c of [r, g, b]) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });

  it('P&B deixa a miniatura em cinza', () => {
    const [r, g, b] = presetThumbnailColor('bw', [0.9, 0.2, 0.1]);
    expect(r).toBeCloseTo(g, 6);
    expect(g).toBeCloseTo(b, 6);
  });
});

describe('registerFilters', () => {
  it('registra o colorAdjust e pode ser chamada de novo sem erro', () => {
    registerFilters();
    registerFilters();
    expect(getEffect(COLOR_ADJUST_TYPE)).toBe(colorAdjustDefinition);
    expect(getEffect(COLOR_ADJUST_TYPE)?.category).toBe('filter');
  });
});
