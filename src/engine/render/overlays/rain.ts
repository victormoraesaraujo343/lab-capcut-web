import type { EffectDefinition } from '../registry';
import { OVERLAY_HASH, OVERLAY_PREMULT, OVERLAY_UNIT } from './glslCommon';

/** Chuva: gotas diagonais em três camadas de profundidade; as mais próximas são maiores e mais rápidas. */
export const rainOverlay: EffectDefinition = {
  type: 'rain',
  category: 'overlay',
  labelKey: 'overlays.names.rain',
  params: [
    { key: 'density', type: 'number', default: 0.6, min: 0, max: 1, step: 0.01 },
    { key: 'speed', type: 'number', default: 1, min: 0, max: 3, step: 0.05 },
    { key: 'angle', type: 'number', default: 12, min: -45, max: 45, step: 1 },
  ],
  fragmentSource: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_density;
uniform float u_speed;
uniform float u_angle;
out vec4 outColor;
${OVERLAY_HASH}
${OVERLAY_UNIT}
${OVERLAY_PREMULT}
// Uma camada de gotas no sistema girado: cada coluna tem no máximo uma gota, que desce e volta ao topo.
float ovRainLayer(vec2 rp, float depth, float diag, float t) {
  float unit = ovUnit();
  float cw = 16.0 * depth * unit;
  float colIndex = floor(rp.x / cw);
  float h1 = ovHash(vec2(colIndex, depth * 13.0));
  float h2 = ovHash(vec2(colIndex + 3.1, depth * 29.0));
  float h3 = ovHash(vec2(colIndex + 7.7, depth * 41.0));
  float h4 = ovHash(vec2(colIndex + 1.9, depth * 53.0));
  float present = step(h4, u_density);
  float len = (110.0 + 190.0 * h3) * depth * unit;
  float span = diag + len;
  float fall = (0.6 + h2) * u_speed * 600.0 * depth * unit;
  float head = -0.5 * diag + mod(h1 * span + t * fall, span);
  float s = (rp.y - (head - len)) / len;
  float inY = smoothstep(0.0, 0.25, s) * (1.0 - smoothstep(0.8, 1.0, s));
  float cx = (colIndex + 0.5) * cw;
  float halfW = max(0.6, 0.9 * depth * unit);
  float inX = 1.0 - smoothstep(halfW, halfW + 1.0, abs(rp.x - (cx + (h3 - 0.5) * 0.6 * cw)));
  return present * inX * inY * (0.3 + 0.25 * depth);
}
void main() {
  // Coordenadas centradas no quadro e giradas pelo ângulo: a chuva cai no eixo y da rotação.
  vec2 pc = v_uv * u_resolution - 0.5 * u_resolution;
  float ang = radians(u_angle);
  float cs = cos(ang);
  float sn = sin(ang);
  vec2 rp = vec2(cs * pc.x - sn * pc.y, sn * pc.x + cs * pc.y);
  float diag = length(u_resolution);
  float acc = ovRainLayer(rp, 0.6, diag, u_time)
    + ovRainLayer(rp, 1.0, diag, u_time)
    + ovRainLayer(rp, 1.5, diag, u_time);
  outColor = ovPremult(vec3(0.78, 0.84, 0.92), clamp(acc, 0.0, 1.0));
}
`,
};
