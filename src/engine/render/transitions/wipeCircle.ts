// Transição íris: um círculo cresce a partir de um centro e revela a entrada.
import type { EffectDefinition } from '../registry';

/** Íris: a entrada aparece num círculo que cresce a partir do centro escolhido. */
export const wipeCircleTransition: EffectDefinition = {
  type: 'wipeCircle',
  category: 'transition',
  labelKey: 'transitions.names.wipeCircle',
  params: [
    { key: 'centerX', type: 'number', default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: 'centerY', type: 'number', default: 0.5, min: 0, max: 1, step: 0.01 },
  ],
  fragmentSource: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_from;
uniform sampler2D u_to;
uniform float u_progress;
uniform vec2 u_resolution;
uniform float u_centerX;
uniform float u_centerY;
out vec4 outColor;
void main() {
  vec2 c = vec2(u_centerX, u_centerY);
  vec2 px = (v_uv - c) * u_resolution;
  float d = length(px);
  float maxR = length(max(c, 1.0 - c) * u_resolution);
  float r = u_progress * (maxR + 2.0);
  float m = u_progress <= 0.0 ? 0.0 : 1.0 - smoothstep(r - 1.0, r + 1.0, d);
  outColor = mix(texture(u_from, v_uv), texture(u_to, v_uv), m);
}
`,
};
