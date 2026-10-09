import type { EffectDefinition } from '../registry';
import { OVERLAY_HUE, OVERLAY_PREMULT } from './glslCommon';

/** Luz vazada: manchas quentes e suaves que derivam pelo quadro, com cor escolhida pelo matiz. */
export const lightLeakOverlay: EffectDefinition = {
  type: 'lightLeak',
  category: 'overlay',
  labelKey: 'overlays.names.lightLeak',
  params: [
    { key: 'intensity', type: 'number', default: 0.6, min: 0, max: 1, step: 0.01 },
    { key: 'speed', type: 'number', default: 0.5, min: 0, max: 3, step: 0.05 },
    { key: 'hue', type: 'number', default: 0.07, min: 0, max: 1, step: 0.01 },
  ],
  fragmentSource: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_intensity;
uniform float u_speed;
uniform float u_hue;
out vec4 outColor;
${OVERLAY_HUE}
${OVERLAY_PREMULT}
void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2(v_uv.x * aspect, v_uv.y);
  float t = u_time * u_speed;
  float glow = 0.0;
  vec3 color = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 c = vec2(
      aspect * (0.2 + 0.6 * (0.5 + 0.5 * sin(t * (0.37 + 0.11 * fi) + fi * 2.3))),
      0.25 + 0.5 * (0.5 + 0.5 * cos(t * (0.29 + 0.07 * fi) + fi * 1.7))
    );
    float d = length((p - c) * vec2(1.0, 1.4));
    float blob = exp(-d * d * 6.0);
    glow += blob;
    color += ovHueRgb(u_hue + 0.06 * fi) * blob;
  }
  vec3 rgb = color / max(glow, 0.0001);
  outColor = ovPremult(rgb, min(glow, 1.0) * clamp(u_intensity, 0.0, 1.0));
}
`,
};
