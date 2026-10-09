// Transição aproximar: a saída cresce e some; a entrada cresce a partir de longe.
import type { EffectDefinition } from '../registry';

/** Aproximar: a saída avança em direção à câmera e a entrada chega do fundo até o tamanho normal. */
export const zoomInTransition: EffectDefinition = {
  type: 'zoomIn',
  category: 'transition',
  labelKey: 'transitions.names.zoomIn',
  params: [],
  fragmentSource: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_from;
uniform sampler2D u_to;
uniform float u_progress;
uniform vec2 u_resolution;
out vec4 outColor;
bool inRange(vec2 q) {
  return all(greaterThanEqual(q, vec2(0.0))) && all(lessThanEqual(q, vec2(1.0)));
}
void main() {
  vec2 c = vec2(0.5);
  vec2 fromUv = c + (v_uv - c) / (1.0 + u_progress);
  vec2 toUv = c + (v_uv - c) / (2.0 - u_progress);
  vec4 a = inRange(fromUv) ? texture(u_from, fromUv) : vec4(0.0);
  vec4 b = inRange(toUv) ? texture(u_to, toUv) : vec4(0.0);
  outColor = mix(a, b, u_progress);
}
`,
};
