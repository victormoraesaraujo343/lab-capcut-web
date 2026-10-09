import type { EffectDefinition } from '../registry';
import { GLSL_MASK_EDGE } from '../glsl/common';

/** Máscara elíptica (circular quando os raios forem iguais em pixels) com pena; multiplica a imagem pelo alfa. */
export const maskCircleEffect: EffectDefinition = {
  type: 'maskCircle',
  category: 'effect',
  labelKey: 'effects.maskCircle',
  params: [
    { key: 'centerX', type: 'number', default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: 'centerY', type: 'number', default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: 'radiusX', type: 'number', default: 0.35, min: 0, max: 1, step: 0.01 },
    { key: 'radiusY', type: 'number', default: 0.35, min: 0, max: 1, step: 0.01 },
    { key: 'feather', type: 'number', default: 0.05, min: 0, max: 0.5, step: 0.01 },
    { key: 'invert', type: 'boolean', default: false },
  ],
  fragmentSource: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform float u_centerX;
uniform float u_centerY;
uniform float u_radiusX;
uniform float u_radiusY;
uniform float u_feather;
uniform float u_invert;
out vec4 outColor;
${GLSL_MASK_EDGE}
void main() {
  vec2 q = (v_uv - vec2(u_centerX, u_centerY)) / max(vec2(u_radiusX, u_radiusY), vec2(0.001));
  float dist = length(q) - 1.0;
  float m = maskEdge(dist, max(u_feather * 0.5, 0.002));
  if (u_invert > 0.5) {
    m = 1.0 - m;
  }
  outColor = texture(u_texture, v_uv) * m;
}
`,
};
