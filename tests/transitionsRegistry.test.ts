import { beforeAll, describe, expect, it } from 'vitest';
import { listEffects, getEffect } from '@/engine/render/registry';
import { DEFAULT_TRANSITION_MS, TRANSITION_TYPES, registerTransitions } from '@/engine/render/transitions';

describe('registro das transições', () => {
  beforeAll(() => {
    registerTransitions();
    registerTransitions();
  });

  it('registra as 15 transições, sem duplicar ao chamar de novo', () => {
    expect(TRANSITION_TYPES).toHaveLength(15);
    expect(listEffects('transition')).toHaveLength(15);
    expect(DEFAULT_TRANSITION_MS).toBe(500);
  });

  it('cada transição tem categoria, chave de nome e shader com a convenção', () => {
    for (const type of TRANSITION_TYPES) {
      const def = getEffect(type);
      expect(def, type).toBeDefined();
      expect(def?.category).toBe('transition');
      expect(def?.labelKey).toBe(`transitions.names.${type}`);
      const src = def?.fragmentSource ?? '';
      expect(src.startsWith('#version 300 es'), type).toBe(true);
      expect(src, type).toContain('u_from');
      expect(src, type).toContain('u_to');
      expect(src, type).toContain('u_progress');
      expect(src, type).toContain('out vec4 outColor');
    }
  });
});
