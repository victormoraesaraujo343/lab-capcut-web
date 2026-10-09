import type { EffectDefinition } from '../registry';
import { GLSL_LUMA } from '../glsl/common';

/** Remover fundo: alfa = smoothstep da luminância da matte; sem matte, o efeito não altera a imagem. */
export const removeBackgroundEffect: EffectDefinition = {
  type: 'removeBackground',
  category: 'effect',
  labelKey: 'effects.removeBackground',
  params: [
    { key: 'threshold', type: 'number', default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: 'feather', type: 'number', default: 0.1, min: 0, max: 0.5, step: 0.01 },
  ],
  fragmentSource: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform sampler2D u_matte;
uniform float u_hasMatte;
uniform float u_threshold;
uniform float u_feather;
out vec4 outColor;
${GLSL_LUMA}
void main() {
  vec4 src = texture(u_texture, v_uv);
  if (u_hasMatte < 0.5) {
    outColor = src;
    return;
  }
  float m = luma(texture(u_matte, v_uv).rgb);
  float w = max(u_feather * 0.5, 0.0001);
  float alpha = smoothstep(u_threshold - w, u_threshold + w, m);
  outColor = src * alpha;
}
`,
};
