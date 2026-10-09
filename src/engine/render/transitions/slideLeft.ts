// Transição slideLeft: a camada nova empurra a antiga nesta direção.
import type { EffectDefinition } from '../registry';

/** Deslizar para a esquerda: a nova entra pela direita e empurra a antiga para a esquerda. */
export const slideLeftTransition: EffectDefinition = {
  type: 'slideLeft',
  category: 'transition',
  labelKey: 'transitions.names.slideLeft',
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
  vec2 dir = vec2(-1.0, 0.0);
  vec2 incoming = v_uv + dir * (1.0 - u_progress);
  vec2 outgoing = v_uv - dir * u_progress;
  if (inRange(incoming)) {
    outColor = texture(u_to, incoming);
  } else if (inRange(outgoing)) {
    outColor = texture(u_from, outgoing);
  } else {
    outColor = vec4(0.0);
  }
}
`,
};
