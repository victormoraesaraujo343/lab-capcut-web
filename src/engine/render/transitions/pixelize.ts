// Transição pixelizar: a imagem vira blocos grandes no meio e a entrada volta a partir deles.
import type { EffectDefinition } from '../registry';

/** Pixelizar: a imagem se transforma em blocos, que crescem até o meio e depois encolhem na entrada. */
export const pixelizeTransition: EffectDefinition = {
  type: 'pixelize',
  category: 'transition',
  labelKey: 'transitions.names.pixelize',
  params: [{ key: 'maxBlock', type: 'number', default: 48, min: 2, max: 200, step: 1 }],
  fragmentSource: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_from;
uniform sampler2D u_to;
uniform float u_progress;
uniform vec2 u_resolution;
uniform float u_maxBlock;
out vec4 outColor;
void main() {
  float peak = 1.0 - abs(2.0 * u_progress - 1.0);
  float block = max(1.0, peak * u_maxBlock);
  vec2 px = v_uv * u_resolution;
  vec2 cell = (floor(px / block) + 0.5) * block;
  vec2 uv = cell / u_resolution;
  outColor = mix(texture(u_from, uv), texture(u_to, uv), step(0.5, u_progress));
}
`,
};
