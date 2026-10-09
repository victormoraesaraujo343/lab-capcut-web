import type { EffectDefinition } from '../registry';
import { OVERLAY_HASH, OVERLAY_PREMULT, OVERLAY_UNIT } from './glslCommon';

/** Neve: flocos em três camadas de profundidade, com balanço lateral; os do fundo são menores e mais lentos. */
export const snowOverlay: EffectDefinition = {
  type: 'snow',
  category: 'overlay',
  labelKey: 'overlays.names.snow',
  params: [
    { key: 'density', type: 'number', default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: 'speed', type: 'number', default: 0.6, min: 0, max: 3, step: 0.05 },
    { key: 'size', type: 'number', default: 1, min: 0.5, max: 3, step: 0.05 },
  ],
  fragmentSource: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_density;
uniform float u_speed;
uniform float u_size;
out vec4 outColor;
${OVERLAY_HASH}
${OVERLAY_UNIT}
${OVERLAY_PREMULT}
// Uma camada de flocos: grade que desce no referencial móvel (cada flocos fica fixo nele, então cai sem saltos).
// fallCells = velocidade em células por segundo; radiusPx já vem em px do quadro.
float ovFlakeLayer(vec2 p, float cellPx, float fallCells, float radiusPx, float t, vec2 seed) {
  vec2 qm = p / cellPx - vec2(0.0, fallCells * t);
  vec2 base = floor(qm);
  float acc = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 id = base + vec2(float(i), float(j));
      float h1 = ovHash(id + seed);
      float h2 = ovHash(id + seed + vec2(11.3, 4.1));
      float h3 = ovHash(id + seed + vec2(23.7, 8.9));
      float present = step(h3, u_density);
      vec2 center = id + vec2(h1, h2) + vec2(0.18 * sin(t * (0.7 + h2) + h1 * 6.2832), 0.0);
      float r = radiusPx * (0.6 + 0.8 * h1);
      float d = length(qm - center) * cellPx;
      acc += present * (1.0 - smoothstep(r * 0.15, r, d));
    }
  }
  return acc;
}
void main() {
  float unit = ovUnit();
  vec2 p = v_uv * u_resolution;
  // Três profundidades: (célula base px, velocidade base px/s, raio base px, peso).
  float far = 0.45 * ovFlakeLayer(p, 40.0 * unit, u_speed, 4.0 * u_size * unit, u_time, vec2(0.0, 0.0));
  float mid = 0.7 * ovFlakeLayer(p, 66.0 * unit, u_speed * 40.0 / 66.0, 6.5 * u_size * unit, u_time, vec2(41.0, 17.0));
  float near = 1.0 * ovFlakeLayer(p, 110.0 * unit, u_speed * 70.0 / 110.0, 10.0 * u_size * unit, u_time, vec2(73.0, 29.0));
  outColor = ovPremult(vec3(0.97, 0.98, 1.0), clamp(far + mid + near, 0.0, 1.0));
}
`,
};
