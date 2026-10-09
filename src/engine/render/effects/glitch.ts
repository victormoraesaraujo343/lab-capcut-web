import type { EffectDefinition } from '../registry';
import { GLSL_HASH } from '../glsl/common';

/** Glitch: faixas horizontais deslocadas e separação RGB que muda com o tempo. */
export const glitchEffect: EffectDefinition = {
  type: 'glitch',
  category: 'effect',
  labelKey: 'effects.glitch',
  params: [{ key: 'intensity', type: 'number', default: 0.5, min: 0, max: 1, step: 0.01 }],
  fragmentSource: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform float u_time;
uniform float u_intensity;
out vec4 outColor;
${GLSL_HASH}
void main() {
  float slot = floor(u_time * 12.0);
  float band = floor(v_uv.y * 24.0);
  float r1 = hash12(vec2(band, slot));
  float r2 = hash12(vec2(band + 31.0, slot + 7.0));
  float isActive = r1 > 1.0 - 0.5 * u_intensity ? 1.0 : 0.0;
  float shift = isActive * (r2 - 0.5) * 0.2 * u_intensity;
  float sep = u_intensity * 0.01 * (1.0 + 2.0 * hash12(vec2(slot, 3.0)));
  vec2 uv = vec2(v_uv.x + shift, v_uv.y);
  vec4 cr = texture(u_texture, uv + vec2(sep, 0.0));
  vec4 cg = texture(u_texture, uv);
  vec4 cb = texture(u_texture, uv - vec2(sep, 0.0));
  outColor = vec4(cr.r, cg.g, cb.b, max(cr.a, max(cg.a, cb.a)));
}
`,
};
