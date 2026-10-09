import type { EffectDefinition } from '../registry';
import { OVERLAY_HASH, OVERLAY_HUE, OVERLAY_PREMULT } from './glslCommon';

/** Bokeh: discos desfocados e coloridos que flutuam devagar, com borda mais clara. */
export const bokehOverlay: EffectDefinition = {
  type: 'bokeh',
  category: 'overlay',
  labelKey: 'overlays.names.bokeh',
  params: [
    { key: 'count', type: 'number', default: 12, min: 1, max: 40, step: 1 },
    { key: 'size', type: 'number', default: 1, min: 0.5, max: 3, step: 0.05 },
  ],
  fragmentSource: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_count;
uniform float u_size;
out vec4 outColor;
${OVERLAY_HASH}
${OVERLAY_HUE}
${OVERLAY_PREMULT}
void main() {
  float aspect = u_resolution.x / u_resolution.y;
  // Coordenadas em alturas do quadro: o eixo x vai de 0 a aspect.
  vec2 p = vec2(v_uv.x * aspect, v_uv.y);
  float accA = 0.0;
  vec3 accC = vec3(0.0);
  for (int i = 0; i < 40; i++) {
    if (float(i) >= u_count) break;
    float fi = float(i);
    float h1 = ovHash(vec2(fi * 37.17 + 1.3, 1.0 * 113.7));
    float h2 = ovHash(vec2(fi * 37.17 + 2.3, 2.0 * 113.7));
    float h3 = ovHash(vec2(fi * 37.17 + 3.3, 3.0 * 113.7));
    float h4 = ovHash(vec2(fi * 37.17 + 4.3, 4.0 * 113.7));
    float r = (0.02 + 0.05 * h3) * u_size;
    float ph = u_time * (0.04 + 0.04 * h4) + h1 * 6.2832;
    vec2 c = vec2(
      aspect * (0.1 + 0.8 * h1 + 0.08 * sin(ph)),
      0.1 + 0.8 * h2 + 0.06 * cos(ph * 0.7 + h4 * 6.2832)
    );
    float d = length(p - c) / r;
    float soft = 1.0 - smoothstep(0.7, 1.0, d);
    float rim = smoothstep(0.75, 0.95, d) * (1.0 - smoothstep(0.95, 1.05, d));
    float a = soft * 0.22 + rim * 0.3;
    vec3 tint = mix(vec3(1.0), ovHueRgb(0.08 + 0.5 * h4), 0.5);
    accA += a;
    accC += tint * a;
  }
  outColor = ovPremult(accC / max(accA, 0.0001), min(accA, 1.0));
}
`,
};
