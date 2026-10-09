// Transição escurecer: a saída escurece até preto e a entrada clareia a partir do preto.
import type { EffectDefinition } from '../registry';

/** Escurecer: a imagem vai ao preto na metade da transição e volta com a entrada. */
export const fadeBlackTransition: EffectDefinition = {
  type: 'fadeBlack',
  category: 'transition',
  labelKey: 'transitions.names.fadeBlack',
  params: [],
  fragmentSource: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_from;
uniform sampler2D u_to;
uniform float u_progress;
uniform vec2 u_resolution;
out vec4 outColor;
void main() {
  vec4 base = mix(texture(u_from, v_uv), texture(u_to, v_uv), step(0.5, u_progress));
  float dark = 1.0 - abs(2.0 * u_progress - 1.0);
  outColor = mix(base, vec4(0.0, 0.0, 0.0, 1.0), dark);
}
`,
};
