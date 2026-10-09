import type { EffectDefinition } from '../registry';
import { GLSL_MASK_EDGE } from '../glsl/common';

/** Máscara linear: mostra um lado de uma linha com ângulo e posição ajustáveis, com pena. */
export const maskLinearEffect: EffectDefinition = {
  type: 'maskLinear',
  category: 'effect',
  labelKey: 'effects.maskLinear',
  params: [
    { key: 'angle', type: 'number', default: 0, min: -180, max: 180, step: 1 },
    { key: 'offset', type: 'number', default: 0, min: -1, max: 1, step: 0.01 },
    { key: 'feather', type: 'number', default: 0.05, min: 0, max: 0.5, step: 0.01 },
    { key: 'invert', type: 'boolean', default: false },
  ],
  fragmentSource: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_angle;
uniform float u_offset;
uniform float u_feather;
uniform float u_invert;
out vec4 outColor;
${GLSL_MASK_EDGE}
void main() {
  float a = radians(u_angle);
  vec2 dir = vec2(cos(a), sin(a));
  vec2 p = (v_uv - 0.5) * u_resolution;
  float ext = (abs(dir.x) * u_resolution.x + abs(dir.y) * u_resolution.y) * 0.5;
  float line = clamp(u_offset, -1.0, 1.0) * ext;
  float fw = max(u_feather * ext, 0.5);
  float m = maskEdge(dot(p, dir) - line, fw);
  if (u_invert > 0.5) {
    m = 1.0 - m;
  }
  outColor = texture(u_texture, v_uv) * m;
}
`,
};
