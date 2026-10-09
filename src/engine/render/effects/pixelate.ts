import type { EffectDefinition } from '../registry';

/** Pixeliza a imagem em blocos quadrados de tamanho fixo em pixels. */
export const pixelateEffect: EffectDefinition = {
  type: 'pixelate',
  category: 'effect',
  labelKey: 'effects.pixelate',
  params: [{ key: 'size', type: 'number', default: 12, min: 2, max: 100, step: 1 }],
  fragmentSource: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_size;
out vec4 outColor;
void main() {
  float s = max(u_size, 1.0);
  vec2 px = v_uv * u_resolution;
  vec2 cell = (floor(px / s) + 0.5) * s;
  outColor = texture(u_texture, cell / u_resolution);
}
`,
};
