import type { EffectDefinition } from '../registry';

/** Separação RGB: desloca o canal vermelho para a direita e o azul para a esquerda. */
export const rgbSplitEffect: EffectDefinition = {
  type: 'rgbSplit',
  category: 'effect',
  labelKey: 'effects.rgbSplit',
  params: [{ key: 'amount', type: 'number', default: 0.008, min: 0, max: 0.05, step: 0.0005 }],
  fragmentSource: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform float u_amount;
out vec4 outColor;
void main() {
  vec2 o = vec2(u_amount, 0.0);
  vec4 cr = texture(u_texture, v_uv + o);
  vec4 cg = texture(u_texture, v_uv);
  vec4 cb = texture(u_texture, v_uv - o);
  float a = max(cr.a, max(cg.a, cb.a));
  outColor = vec4(cr.r, cg.g, cb.b, a);
}
`,
};
