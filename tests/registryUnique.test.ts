import { describe, expect, it } from 'vitest';
import { ensureEffectsRegistered } from '@/engine/render/registerAll';
import { listEffects } from '@/engine/render/registry';
import { TRANSITION_TYPES } from '@/engine/render/transitions';
import { EFFECT_TYPES } from '@/engine/render/effects';

describe('registro de efeitos, filtros e transições', () => {
  it('registra tudo sem nomes repetidos entre categorias', () => {
    ensureEffectsRegistered();
    const all = listEffects();
    const types = all.map((def) => def.type);
    expect(new Set(types).size).toBe(types.length);
    expect(listEffects('transition')).toHaveLength(TRANSITION_TYPES.length);
    expect(listEffects('effect')).toHaveLength(EFFECT_TYPES.length);
    expect(TRANSITION_TYPES).toHaveLength(15);
    expect(EFFECT_TYPES).toHaveLength(15);
  });
});
