import type { EffectDefinition } from '../registry';
import { GLSL_NOISE } from '../glsl/common';

/** Tremor: desloca o UV com ruído suave no tempo; precisa de margem (overscan) para não mostrar borda. */
export const shakeEffect: EffectDefinition = {
  type: 'shake',
  category: 'effect',
  labelKey: 'effects.shake',
  overscan: 0.1,
  params: [
    { key: 'intensity', type: 'number', default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: 'speed', type: 'number', default: 8, min: 0, max: 20, step: 0.1 },
  ],
  fragmentSource: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform float u_time;
uniform float u_intensity;
uniform float u_speed;
out vec4 outColor;
${GLSL_NOISE}
void main() {
  float t = u_time * u_speed;
  vec2 n = vec2(valueNoise(vec2(t, 1.7)), valueNoise(vec2(t, 9.3)));
  vec2 offset = (n * 2.0 - 1.0) * u_intensity * 0.1;
  outColor = texture(u_texture, v_uv + offset);
}
`,
};
