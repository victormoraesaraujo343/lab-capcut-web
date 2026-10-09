// Transição desfoque: a saída desfoca enquanto a entrada entra em foco.
import type { EffectDefinition } from '../registry';

/** Desfoque: a saída fica cada vez mais borrada e a entrada sai do borrão para o foco. */
export const blurTransition: EffectDefinition = {
  type: 'blurCross',
  category: 'transition',
  labelKey: 'transitions.names.blurCross',
  params: [{ key: 'strength', type: 'number', default: 24, min: 0, max: 80, step: 1 }],
  fragmentSource: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_from;
uniform sampler2D u_to;
uniform float u_progress;
uniform vec2 u_resolution;
uniform float u_strength;
out vec4 outColor;
vec4 blurred(sampler2D tex, vec2 uv, float radius) {
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  for (int i = -3; i <= 3; i++) {
    for (int j = -3; j <= 3; j++) {
      float w = 1.0 / (1.0 + float(i * i + j * j));
      acc += texture(tex, uv + vec2(float(i), float(j)) * (radius / 3.0) / u_resolution) * w;
      wsum += w;
    }
  }
  return acc / wsum;
}
void main() {
  vec4 a = blurred(u_from, v_uv, u_strength * u_progress);
  vec4 b = blurred(u_to, v_uv, u_strength * (1.0 - u_progress));
  outColor = mix(a, b, u_progress);
}
`,
};
