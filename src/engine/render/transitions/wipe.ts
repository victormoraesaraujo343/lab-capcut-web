// Transição cortina: uma linha varre o quadro e revela a entrada na direção do ângulo.
import type { EffectDefinition } from '../registry';

/** Cortina: a entrada é revelada por uma linha que varre o quadro no ângulo escolhido. */
export const wipeTransition: EffectDefinition = {
  type: 'wipe',
  category: 'transition',
  labelKey: 'transitions.names.wipe',
  params: [{ key: 'angle', type: 'number', default: 0, min: 0, max: 360, step: 1 }],
  fragmentSource: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_from;
uniform sampler2D u_to;
uniform float u_progress;
uniform vec2 u_resolution;
uniform float u_angle;
out vec4 outColor;
void main() {
  float a = radians(u_angle);
  vec2 dir = vec2(cos(a), sin(a));
  vec2 px = (v_uv - 0.5) * u_resolution;
  float pos = dot(px, dir);
  float extent = 0.5 * (abs(dir.x) * u_resolution.x + abs(dir.y) * u_resolution.y);
  float edge = mix(-extent, extent, u_progress);
  float m = 1.0 - smoothstep(edge - 1.0, edge + 1.0, pos);
  outColor = mix(texture(u_from, v_uv), texture(u_to, v_uv), m);
}
`,
};
