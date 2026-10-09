import { beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../src/i18n/pt-BR';
import type { EffectDefinition } from '../src/engine/render/registry';

type EffectsModule = typeof import('../src/engine/render/effects/index');
type RegistryModule = typeof import('../src/engine/render/registry');

/** Carrega registry e efeitos em módulos novos, para partir de um registro limpo. */
async function loadFresh(): Promise<{ registry: RegistryModule; effects: EffectsModule }> {
  vi.resetModules();
  const registry = await import('../src/engine/render/registry');
  const effects = await import('../src/engine/render/effects/index');
  return { registry, effects };
}

/** Resolve uma chave pontilhada (ex.: 'effects.blur') dentro do dicionário pt-BR. */
function resolveKey(path: string): unknown {
  let cur: unknown = t;
  for (const part of path.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

describe('efeitos embutidos', () => {
  let registry: RegistryModule;
  let effects: EffectsModule;
  let defs: EffectDefinition[];

  beforeEach(async () => {
    ({ registry, effects } = await loadFresh());
    effects.registerEffects();
    defs = registry.listEffects();
  });

  it('registra os 15 efeitos listados sem erro num registro limpo', () => {
    expect(defs).toHaveLength(15);
    expect(effects.EFFECT_TYPES).toHaveLength(15);
    expect(effects.EFFECT_TYPES).toContain('removeBackground');
  });

  it('é seguro chamar registerEffects de novo', async () => {
    expect(() => effects.registerEffects()).not.toThrow();
    expect(registry.listEffects()).toHaveLength(15);
  });

  it('todo efeito é da categoria effect e tem tipo listado em EFFECT_TYPES', () => {
    for (const def of defs) {
      expect(def.category).toBe('effect');
      expect(effects.EFFECT_TYPES).toContain(def.type);
    }
  });

  it('todo fragmentSource é GLSL ES 3.00 com saída e textura de entrada', () => {
    for (const def of defs) {
      const src = def.fragmentSource;
      expect(src.startsWith('#version 300 es'), def.type).toBe(true);
      expect(src, def.type).toContain('precision highp float;');
      expect(src, def.type).toContain('out vec4 outColor;');
      expect(src, def.type).toContain('u_texture');
      expect(src, def.type).not.toContain('texture2D');
    }
  });

  it('cada parâmetro aparece no GLSL com o uniform do tipo certo', () => {
    const uniformType: Record<string, string> = {
      number: 'float',
      boolean: 'float',
      color: 'vec3',
      select: 'int',
    };
    for (const def of defs) {
      for (const spec of def.params) {
        const decl = `uniform ${uniformType[spec.type] ?? ''} u_${spec.key};`;
        expect(def.fragmentSource, `${def.type}.${spec.key}`).toContain(decl);
      }
    }
  });

  it('valores padrão ficam dentro de min e max', () => {
    for (const def of defs) {
      for (const spec of def.params) {
        if (spec.type !== 'number') continue;
        expect(typeof spec.default, `${def.type}.${spec.key}`).toBe('number');
        const value = spec.default as number;
        if (spec.min !== undefined) expect(value, `${def.type}.${spec.key}`).toBeGreaterThanOrEqual(spec.min);
        if (spec.max !== undefined) expect(value, `${def.type}.${spec.key}`).toBeLessThanOrEqual(spec.max);
      }
    }
  });

  it('o padrão de cada select é uma das opções', () => {
    for (const def of defs) {
      for (const spec of def.params) {
        if (spec.type !== 'select') continue;
        expect(spec.options, `${def.type}.${spec.key}`).toContain(spec.default);
      }
    }
  });

  it('labelKey do efeito e de cada parâmetro existem no i18n', () => {
    for (const def of defs) {
      expect(def.labelKey.startsWith('effects.'), def.type).toBe(true);
      expect(typeof resolveKey(def.labelKey), def.labelKey).toBe('string');
      for (const spec of def.params) {
        expect(typeof resolveKey(`effects.params.${spec.key}`), `${def.type}.${spec.key}`).toBe('string');
      }
      for (const option of specOptions(def)) {
        expect(typeof resolveKey(`effects.mirrorOptions.${option}`), `${def.type}.${option}`).toBe('string');
      }
    }
  });
});

/** Opções de mirror, que têm rótulo próprio em effects.mirrorOptions. */
function specOptions(def: EffectDefinition): string[] {
  if (def.type !== 'mirror') return [];
  return def.params.flatMap((spec) => spec.options ?? []);
}
