import type { EffectDefinition } from '../registry';

/** Espelha a metade esquerda sobre a direita, a superior sobre a inferior, ou as duas (quatro lados). */
export const mirrorEffect: EffectDefinition = {
  type: 'mirror',
  category: 'effect',
  labelKey: 'effects.mirror',
  params: [
    {
      key: 'mode',
      type: 'select',
      default: 'horizontal',
      options: ['horizontal', 'vertical', 'quad'],
    },
  ],
  fragmentSource: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform int u_mode;
out vec4 outColor;
void main() {
  vec2 uv = v_uv;
  if (u_mode == 0 || u_mode == 2) {
    uv.x = min(uv.x, 1.0 - uv.x);
  }
  if (u_mode == 1 || u_mode == 2) {
    uv.y = min(uv.y, 1.0 - uv.y);
  }
  outColor = texture(u_texture, uv);
}
`,
};
