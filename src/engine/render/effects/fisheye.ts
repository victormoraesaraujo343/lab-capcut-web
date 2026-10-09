import type { EffectDefinition } from '../registry';

/** Olho de peixe: distorção radial circular; positivo estufa o centro, negativo puxa para dentro; fora da imagem fica transparente. */
export const fisheyeEffect: EffectDefinition = {
  type: 'fisheye',
  category: 'effect',
  labelKey: 'effects.fisheye',
  params: [{ key: 'strength', type: 'number', default: 0.4, min: -1, max: 1, step: 0.01 }],
  fragmentSource: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_strength;
out vec4 outColor;
void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 n = v_uv * 2.0 - 1.0;
  vec2 p = n * vec2(aspect, 1.0);
  float factor = 1.0 + u_strength * 0.5 * dot(p, p);
  if (factor <= 0.0) {
    outColor = vec4(0.0);
    return;
  }
  vec2 suv = n * factor * 0.5 + 0.5;
  if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) {
    outColor = vec4(0.0);
    return;
  }
  outColor = texture(u_texture, suv);
}
`,
};
