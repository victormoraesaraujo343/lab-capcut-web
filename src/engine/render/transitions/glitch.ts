// Transição glitch: fatias deslocadas e separação de canais RGB no meio da transição.
import type { EffectDefinition } from '../registry';

/** Glitch: a imagem se quebra em faixas deslocadas e com canais separados, e troca no meio. */
export const glitchTransition: EffectDefinition = {
  type: 'glitchCross',
  category: 'transition',
  labelKey: 'transitions.names.glitchCross',
  params: [],
  fragmentSource: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_from;
uniform sampler2D u_to;
uniform float u_progress;
uniform vec2 u_resolution;
out vec4 outColor;
float rnd(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}
void main() {
  float amp = sin(u_progress * 3.14159265);
  float band = floor(v_uv.y * 28.0);
  float slot = floor(u_progress * 14.0);
  float shift = (rnd(band + slot * 17.0) - 0.5) * 0.12 * amp;
  vec2 off = vec2(shift, 0.0);
  float split = 0.006 * amp;
  float k = smoothstep(0.4, 0.6, u_progress);
  vec4 mixed = mix(texture(u_from, v_uv + off), texture(u_to, v_uv + off), k);
  vec4 red = mix(texture(u_from, v_uv + off + vec2(split, 0.0)), texture(u_to, v_uv + off + vec2(split, 0.0)), k);
  vec4 blue = mix(texture(u_from, v_uv + off - vec2(split, 0.0)), texture(u_to, v_uv + off - vec2(split, 0.0)), k);
  vec3 rgb = min(vec3(red.r, mixed.g, blue.b), vec3(mixed.a));
  outColor = vec4(rgb, mixed.a);
}
`,
};
