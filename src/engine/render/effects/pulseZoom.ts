import type { EffectDefinition } from '../registry';

/** Zoom pulsante no ritmo das batidas por minuto: entra no tempo e relaxa até o próximo. */
export const pulseZoomEffect: EffectDefinition = {
  type: 'pulseZoom',
  category: 'effect',
  labelKey: 'effects.pulseZoom',
  params: [
    { key: 'amount', type: 'number', default: 0.08, min: 0, max: 0.5, step: 0.01 },
    { key: 'bpm', type: 'number', default: 120, min: 30, max: 240, step: 1 },
  ],
  fragmentSource: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform float u_time;
uniform float u_amount;
uniform float u_bpm;
out vec4 outColor;
void main() {
  float beat = fract(u_time * u_bpm / 60.0);
  float pulse = pow(1.0 - beat, 3.0);
  float scale = 1.0 - u_amount * pulse;
  vec2 uv = (v_uv - 0.5) * scale + 0.5;
  outColor = texture(u_texture, uv);
}
`,
};
