import type { EffectDefinition } from '../registry';
import { GLSL_LUMA, GLSL_NOISE } from '../glsl/common';

/** Fita VHS: ruído, linhas de varredura, borrão de croma e leve tremor vertical. */
export const vhsEffect: EffectDefinition = {
  type: 'vhs',
  category: 'effect',
  labelKey: 'effects.vhs',
  params: [{ key: 'intensity', type: 'number', default: 0.5, min: 0, max: 1, step: 0.01 }],
  fragmentSource: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_intensity;
out vec4 outColor;
${GLSL_NOISE}
${GLSL_LUMA}
void main() {
  float jitter = (valueNoise(vec2(u_time * 24.0, 2.0)) - 0.5) * 0.006 * u_intensity;
  vec2 uv = vec2(v_uv.x, v_uv.y + jitter);
  float spread = (1.0 + 3.0 * u_intensity) / u_resolution.x;
  vec4 c = texture(u_texture, uv);
  vec4 soft = (
    texture(u_texture, uv - vec2(spread * 2.0, 0.0)) +
    texture(u_texture, uv - vec2(spread, 0.0)) +
    texture(u_texture, uv + vec2(spread, 0.0)) +
    texture(u_texture, uv + vec2(spread * 2.0, 0.0))
  ) * 0.25;
  float y = luma(c.rgb);
  vec3 chromaSharp = c.rgb - vec3(y);
  vec3 chromaSoft = soft.rgb - vec3(luma(soft.rgb));
  vec3 rgb = vec3(y) + mix(chromaSharp, chromaSoft, u_intensity);
  float row = floor(v_uv.y * u_resolution.y);
  rgb *= 1.0 - 0.18 * u_intensity * mod(row, 2.0);
  float grain = hash12(v_uv * u_resolution + vec2(floor(u_time * 24.0) * 7.0, 3.0)) - 0.5;
  float a = c.a;
  rgb += vec3(grain * 0.15 * u_intensity * a);
  rgb = clamp(rgb, vec3(0.0), vec3(a));
  outColor = vec4(rgb, a);
}
`,
};
