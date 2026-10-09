// Transição girar: a saída gira para fora e a entrada gira para o lugar.
import type { EffectDefinition } from '../registry';

/** Girar: a saída gira e some, enquanto a entrada gira de volta para a posição normal. */
export const spinTransition: EffectDefinition = {
  type: 'spin',
  category: 'transition',
  labelKey: 'transitions.names.spin',
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
vec2 rot(vec2 q, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * q.x - s * q.y, s * q.x + c * q.y);
}
void main() {
  vec2 q = (v_uv - 0.5) * u_resolution;
  float aOut = u_progress * 1.5707963;
  float aIn = (u_progress - 1.0) * 1.5707963;
  vec2 fromUv = rot(q, -aOut) / u_resolution + 0.5;
  vec2 toUv = rot(q, -aIn) / u_resolution + 0.5;
  vec4 a = inRange(fromUv) ? texture(u_from, fromUv) : vec4(0.0);
  vec4 b = inRange(toUv) ? texture(u_to, toUv) : vec4(0.0);
  outColor = mix(a, b, u_progress);
}
`,
};
