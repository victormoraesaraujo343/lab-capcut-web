import type { EffectDefinition } from '../registry';
import { OVERLAY_HASH, OVERLAY_PREMULT, OVERLAY_UNIT } from './glslCommon';

/** Poeira de película: partículas claras que cintilam e flutuam, com riscos verticais ocasionais. */
export const dustOverlay: EffectDefinition = {
  type: 'dust',
  category: 'overlay',
  labelKey: 'overlays.names.dust',
  params: [
    { key: 'amount', type: 'number', default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: 'size', type: 'number', default: 1, min: 0.5, max: 3, step: 0.05 },
  ],
  fragmentSource: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_amount;
uniform float u_size;
out vec4 outColor;
${OVERLAY_HASH}
${OVERLAY_UNIT}
${OVERLAY_PREMULT}
void main() {
  float unit = ovUnit();
  float cell = 120.0 * unit;
  vec2 q = (v_uv * u_resolution) / cell;
  // Referencial que se move para cima: cada partícula fica fixa nele, então desce na tela sem saltos.
  vec2 qm = q - vec2(0.0, u_time * 0.25);
  vec2 base = floor(qm);
  float dots = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 id = base + vec2(float(i), float(j));
      float h1 = ovHash(id);
      float h2 = ovHash(id + vec2(17.3, 9.1));
      float h3 = ovHash(id + vec2(3.7, 71.9));
      float present = step(h1, u_amount * 0.7);
      vec2 center = id + vec2(h2, h3);
      float radius = (3.5 + 6.0 * h3) * u_size * unit;
      float d = length(qm - center) * cell;
      float core = 1.0 - smoothstep(radius * 0.45, radius, d);
      float twinkle = 0.55 + 0.45 * sin(u_time * (1.5 + 3.0 * h2) + h1 * 40.0);
      dots += core * twinkle * present;
    }
  }
  // Risco vertical fino que aparece em cerca de 18% dos intervalos de 1/6 s.
  float slot = floor(u_time * 6.0);
  float sx = ovHash(vec2(slot, 5.0));
  float on = step(0.55, ovHash(vec2(slot, 11.0)));
  float width = 2.0 * unit / u_resolution.x;
  float scratch = (1.0 - smoothstep(0.0, width, abs(v_uv.x - sx))) * on * u_amount;
  float alpha = clamp(dots * 0.9 + scratch * 0.55, 0.0, 1.0);
  outColor = ovPremult(vec3(0.96, 0.93, 0.86), alpha);
}
`,
};
