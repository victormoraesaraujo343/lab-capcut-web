import type { EffectDefinition } from '../registry';

/** Desfoque gaussiano separável: passada 0 horizontal, passada 1 vertical. */
export const blurEffect: EffectDefinition = {
  type: 'blur',
  category: 'effect',
  labelKey: 'effects.blur',
  passes: 2,
  params: [{ key: 'radius', type: 'number', default: 12, min: 0, max: 50, step: 0.5 }],
  fragmentSource: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform int u_pass;
uniform float u_radius;
out vec4 outColor;
void main() {
  vec2 dir = u_pass == 0 ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec2 spacing = dir * (u_radius / 6.0) / u_resolution;
  vec4 sum = vec4(0.0);
  float wsum = 0.0;
  for (int i = -6; i <= 6; i++) {
    float fi = float(i);
    float w = exp(-(fi * fi) / 18.0);
    sum += texture(u_texture, v_uv + spacing * fi) * w;
    wsum += w;
  }
  outColor = sum / wsum;
}
`,
};
