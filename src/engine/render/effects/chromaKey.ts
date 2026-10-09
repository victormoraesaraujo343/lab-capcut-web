import type { EffectDefinition } from '../registry';

/** Fundo verde (chroma key): remove a cor-chave medindo distância em CbCr, com alfa suave e remoção de reflexo. */
export const chromaKeyEffect: EffectDefinition = {
  type: 'chromaKey',
  category: 'effect',
  labelKey: 'effects.chromaKey',
  params: [
    { key: 'keyColor', type: 'color', default: '#00ff00' },
    { key: 'similarity', type: 'number', default: 0.4, min: 0, max: 1, step: 0.01 },
    { key: 'smoothness', type: 'number', default: 0.1, min: 0, max: 1, step: 0.01 },
    { key: 'spill', type: 'number', default: 0.5, min: 0, max: 1, step: 0.01 },
  ],
  fragmentSource: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform vec3 u_keyColor;
uniform float u_similarity;
uniform float u_smoothness;
uniform float u_spill;
out vec4 outColor;
vec2 chromaOf(vec3 c) {
  return vec2(-0.1687 * c.r - 0.3313 * c.g + 0.5 * c.b, 0.5 * c.r - 0.4187 * c.g - 0.0813 * c.b);
}
void main() {
  vec4 src = texture(u_texture, v_uv);
  if (src.a <= 0.0) {
    outColor = vec4(0.0);
    return;
  }
  vec3 c = clamp(src.rgb / src.a, 0.0, 1.0);
  float d = distance(chromaOf(c), chromaOf(u_keyColor));
  float edge0 = u_similarity * 0.5;
  float edge1 = edge0 + max(u_smoothness * 0.25, 0.0001);
  float keep = smoothstep(edge0, edge1, d);
  vec3 kc = u_keyColor;
  float kmax = max(kc.r, max(kc.g, kc.b));
  float kmin = min(kc.r, min(kc.g, kc.b));
  float domOn = kmax - kmin > 0.05 ? 1.0 : 0.0;
  vec3 dom = vec3(
    kc.r >= kmax - 0.001 ? domOn : 0.0,
    kc.g >= kmax - 0.001 ? domOn : 0.0,
    kc.b >= kmax - 0.001 ? domOn : 0.0
  );
  float omax = max(c.r * (1.0 - dom.r), max(c.g * (1.0 - dom.g), c.b * (1.0 - dom.b)));
  vec3 despilled = mix(c, min(c, vec3(omax)), dom);
  c = mix(c, despilled, clamp(u_spill, 0.0, 1.0));
  float a = src.a * keep;
  outColor = vec4(c * a, a);
}
`,
};
