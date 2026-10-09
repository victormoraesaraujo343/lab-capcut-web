// Transição dissolver: cross-fade linear entre a camada que sai e a que entra.
import type { EffectDefinition } from '../registry';

/** Dissolver: a saída some e a entrada aparece na mesma proporção do progresso. */
export const dissolveTransition: EffectDefinition = {
  type: 'dissolve',
  category: 'transition',
  labelKey: 'transitions.names.dissolve',
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
  outColor = mix(texture(u_from, v_uv), texture(u_to, v_uv), u_progress);
}
`,
};
