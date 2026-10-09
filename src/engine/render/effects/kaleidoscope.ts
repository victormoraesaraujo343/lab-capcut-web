import type { EffectDefinition } from '../registry';

/** Caleidoscópio: dobra o quadro em fatias angulares iguais e espelhadas, em torno do centro. */
export const kaleidoscopeEffect: EffectDefinition = {
  type: 'kaleidoscope',
  category: 'effect',
  labelKey: 'effects.kaleidoscope',
  params: [{ key: 'segments', type: 'number', default: 6, min: 2, max: 12, step: 1 }],
  fragmentSource: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_segments;
out vec4 outColor;
void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = (v_uv - 0.5) * vec2(aspect, 1.0);
  float radius = length(p);
  float ang = atan(p.y, p.x);
  float seg = 6.283185307 / max(floor(u_segments + 0.5), 2.0);
  float a = mod(ang, seg);
  a = abs(a - seg * 0.5);
  vec2 q = vec2(cos(a), sin(a)) * radius;
  vec2 suv = vec2(q.x / aspect, q.y) + 0.5;
  outColor = texture(u_texture, suv);
}
`,
};
