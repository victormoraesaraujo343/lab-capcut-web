// Testes do registro das sobreposições: categoria, GLSL ES 3.00, nomes reservados e limites dos parâmetros.
import { describe, expect, it } from 'vitest';
import { OVERLAY_TYPES, registerOverlays } from '@/engine/render/overlays';
import { getEffect, listEffects } from '@/engine/render/registry';

/** Palavras reservadas do GLSL ES 3.00 que não podem ser identificadores. */
const RESERVED = [
  'active',
  'input',
  'output',
  'filter',
  'sample',
  'common',
  'partition',
  'asm',
  'class',
  'union',
  'enum',
  'typedef',
  'template',
  'this',
  'resource',
  'goto',
  'inline',
  'noinline',
  'public',
  'static',
  'extern',
  'external',
  'interface',
  'long',
  'short',
  'half',
  'fixed',
  'unsigned',
  'superp',
  'sizeof',
  'cast',
  'namespace',
  'using',
];

registerOverlays();

describe('registro das sobreposições', () => {
  it('registra as seis sobreposições na categoria overlay, na ordem', () => {
    expect(OVERLAY_TYPES).toEqual(['lightLeak', 'dust', 'rain', 'snow', 'filmGrain', 'bokeh']);
    expect(listEffects('overlay').map((def) => def.type)).toEqual([...OVERLAY_TYPES]);
  });

  it('registrar de novo é seguro', () => {
    expect(() => registerOverlays()).not.toThrow();
    expect(listEffects('overlay')).toHaveLength(OVERLAY_TYPES.length);
  });

  it('tipo desconhecido não existe no registro', () => {
    expect(getEffect('nao-existe')).toBeUndefined();
  });
});

describe.each([...OVERLAY_TYPES])('sobreposição %s', (type) => {
  const def = getEffect(type);

  it('tem categoria overlay e nome de tradução de overlays.names', () => {
    expect(def?.category).toBe('overlay');
    expect(def?.labelKey).toBe(`overlays.names.${type}`);
  });

  it('é GLSL ES 3.00 sem textura de entrada, com saída outColor', () => {
    const src = def?.fragmentSource ?? '';
    expect(src.startsWith('#version 300 es')).toBe(true);
    expect(src).toContain('out vec4 outColor;');
    expect(src).toContain('in vec2 v_uv;');
    expect(src).toContain('uniform vec2 u_resolution;');
    expect(src).toContain('uniform float u_time;');
    expect(src).not.toMatch(/sampler2D|u_texture/);
    expect(src).toContain('void main()');
  });

  it('não usa palavras reservadas do GLSL como identificador', () => {
    const src = def?.fragmentSource ?? '';
    for (const word of RESERVED) {
      expect(src, `palavra reservada: ${word}`).not.toMatch(new RegExp(`\\b${word}\\b`));
    }
  });

  it('declara cada parâmetro como uniform u_<key> do tipo numérico', () => {
    const src = def?.fragmentSource ?? '';
    for (const spec of def?.params ?? []) {
      expect(spec.type).toBe('number');
      expect(src).toMatch(new RegExp(`uniform float u_${spec.key};`));
    }
  });

  it('tem padrões dentro dos limites mínimo e máximo', () => {
    for (const spec of def?.params ?? []) {
      const value = spec.default;
      expect(typeof value).toBe('number');
      if (typeof value !== 'number') continue;
      expect(value).toBeGreaterThanOrEqual(spec.min ?? Number.NEGATIVE_INFINITY);
      expect(value).toBeLessThanOrEqual(spec.max ?? Number.POSITIVE_INFINITY);
    }
  });
});
