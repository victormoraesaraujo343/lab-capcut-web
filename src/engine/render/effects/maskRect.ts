import type { EffectDefinition } from '../registry';
import { GLSL_MASK_EDGE } from '../glsl/common';

/** Máscara retangular com cantos arredondados e pena; multiplica a imagem inteira pelo alfa da máscara. */
export const maskRectEffect: EffectDefinition = {
  type: 'maskRect',
  category: 'effect',
  labelKey: 'effects.maskRect',
  params: [
    { key: 'centerX', type: 'number', default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: 'centerY', type: 'number', default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: 'width', type: 'number', default: 0.6, min: 0, max: 1, step: 0.01 },
    { key: 'height', type: 'number', default: 0.6, min: 0, max: 1, step: 0.01 },
    { key: 'roundness', type: 'number', default: 0.1, min: 0, max: 1, step: 0.01 },
    { key: 'feather', type: 'number', default: 0.02, min: 0, max: 0.5, step: 0.01 },
    { key: 'invert', type: 'boolean', default: false },
  ],
  fragmentSource: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_centerX;
uniform float u_centerY;
uniform float u_width;
uniform float u_height;
uniform float u_roundness;
uniform float u_feather;
uniform float u_invert;
out vec4 outColor;
${GLSL_MASK_EDGE}
void main() {
  vec2 p = (v_uv - vec2(u_centerX, u_centerY)) * u_resolution;
  vec2 hs = max(vec2(u_width, u_height) * 0.5 * u_resolution, vec2(0.5));
  float r = clamp(u_roundness, 0.0, 1.0) * min(hs.x, hs.y);
  vec2 q = abs(p) - hs + r;
  float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  float fw = max(u_feather * min(hs.x, hs.y), 0.5);
  float m = maskEdge(dist, fw);
  if (u_invert > 0.5) {
    m = 1.0 - m;
  }
  outColor = texture(u_texture, v_uv) * m;
}
`,
};
