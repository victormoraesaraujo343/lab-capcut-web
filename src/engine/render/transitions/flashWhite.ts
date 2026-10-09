// Transição flash branco: a imagem estoura em branco no meio e revela a entrada.
import type { EffectDefinition } from '../registry';

/** Flash branco: a transição passa por um clarão branco no meio, que revela a entrada. */
export const flashWhiteTransition: EffectDefinition = {
  type: 'flashWhite',
  category: 'transition',
  labelKey: 'transitions.names.flashWhite',
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
  float flash = 1.0 - abs(2.0 * u_progress - 1.0);
  outColor = mix(base, vec4(1.0), flash);
}
`,
};
