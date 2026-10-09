import type { EffectDefinition } from '../registry';
import { OVERLAY_HASH, OVERLAY_PREMULT } from './glslCommon';

/** Grão de filme: ruído fino que muda 24 vezes por segundo, como a película em movimento. */
export const filmGrainOverlay: EffectDefinition = {
  type: 'filmGrain',
  category: 'overlay',
  labelKey: 'overlays.names.filmGrain',
  params: [{ key: 'amount', type: 'number', default: 0.35, min: 0, max: 1, step: 0.01 }],
  fragmentSource: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_amount;
out vec4 outColor;
${OVERLAY_HASH}
${OVERLAY_PREMULT}
void main() {
  float frame = floor(u_time * 24.0);
  float n = ovHash(floor(v_uv * u_resolution) + vec2(frame * 13.7, frame * 3.1));
  outColor = ovPremult(vec3(n), clamp(u_amount, 0.0, 1.0) * 0.4);
}
`,
};
