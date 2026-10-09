// Shader GLSL ES 3.00 do ajuste de cor. As fórmulas espelham colorMath.ts (applyColorAdjust) e não usam loops dinâmicos.
import { HUE_BANDS, HUE_BAND_RANGE, hslParamKey } from './colorMath';

/** Parâmetros base do ajuste de cor (sem HSL), na ordem do shader. */
const BASE_UNIFORMS = [
  'brightness',
  'contrast',
  'saturation',
  'temperature',
  'tint',
  'hue',
  'exposure',
  'highlights',
  'shadows',
  'sharpen',
  'vignette',
  'vignetteSoftness',
  'grain',
  'fade',
];

/** Declarações `uniform float` dos parâmetros base e dos 24 parâmetros HSL. */
const UNIFORM_DECLS = [
  ...BASE_UNIFORMS,
  ...HUE_BANDS.flatMap((band) => [
    hslParamKey(band.id, 'H'),
    hslParamKey(band.id, 'S'),
    hslParamKey(band.id, 'L'),
  ]),
]
  .map((name) => `uniform float u_${name};`)
  .join('\n');

/** Trecho que acumula o peso e os deslocamentos de cada faixa HSL (uma chamada por faixa, sem loop). */
const BAND_ACCUMULATE = HUE_BANDS.map((band) => {
  const h = hslParamKey(band.id, 'H');
  const s = hslParamKey(band.id, 'S');
  const l = hslParamKey(band.id, 'L');
  return `  w = bandWeight(hsl.x, ${band.center.toFixed(1)}) * gate;
  total += w;
  dh += w * u_${h};
  ds += w * u_${s};
  dl += w * u_${l};`;
}).join('\n');

/** Código fonte do fragment shader do ajuste de cor (saída pré-multiplicada). */
export const COLOR_ADJUST_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
${UNIFORM_DECLS}
out vec4 outColor;

float lumaOf(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 rgb2hsl(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float l = (mx + mn) * 0.5;
  float d = mx - mn;
  if (d <= 1e-6) return vec3(0.0, 0.0, l);
  float s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
  float h;
  if (mx == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
  else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
  else h = (c.r - c.g) / d + 4.0;
  return vec3(h * 60.0, s, l);
}

float hueChannel(float p, float q, float t) {
  float u = fract(t);
  if (u < 1.0 / 6.0) return p + (q - p) * 6.0 * u;
  if (u < 0.5) return q;
  if (u < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - u) * 6.0;
  return p;
}

vec3 hsl2rgb(vec3 hsl) {
  if (hsl.y <= 0.0) return vec3(hsl.z);
  float h = fract(hsl.x / 360.0);
  float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
  float p = 2.0 * hsl.z - q;
  return vec3(hueChannel(p, q, h + 1.0 / 3.0), hueChannel(p, q, h), hueChannel(p, q, h - 1.0 / 3.0));
}

float bandWeight(float hue, float center) {
  float d = abs(mod(hue - center + 180.0, 360.0) - 180.0);
  float w = clamp(1.0 - d / ${HUE_BAND_RANGE.toFixed(1)}, 0.0, 1.0);
  return w * w * (3.0 - 2.0 * w);
}

vec3 adjustColor(vec3 c) {
  c *= exp2(u_exposure);
  c.r += u_temperature * 0.12 - u_tint * 0.05;
  c.g += u_tint * 0.1;
  c.b += -u_temperature * 0.12 - u_tint * 0.05;
  c = clamp((c + vec3(u_brightness * 0.3) - 0.5) * (1.0 + u_contrast) + 0.5, 0.0, 1.0);

  float l1 = lumaOf(c);
  float shadowMask = 1.0 - smoothstep(0.0, 0.5, l1);
  float highMask = smoothstep(0.5, 1.0, l1);
  c = clamp(c + vec3(u_shadows * 0.25 * shadowMask + u_highlights * 0.25 * highMask), 0.0, 1.0);

  float l2 = lumaOf(c);
  c = clamp(mix(vec3(l2), c, 1.0 + u_saturation), 0.0, 1.0);
  if (u_hue != 0.0) {
    vec3 h0 = rgb2hsl(c);
    c = clamp(hsl2rgb(vec3(mod(h0.x + u_hue, 360.0), h0.y, h0.z)), 0.0, 1.0);
  }

  vec3 hsl = rgb2hsl(c);
  float gate = clamp(hsl.y * 4.0, 0.0, 1.0);
  float total = 0.0;
  float dh = 0.0;
  float ds = 0.0;
  float dl = 0.0;
  float w = 0.0;
${BAND_ACCUMULATE}
  float norm = max(1.0, total);
  dh /= norm;
  ds /= norm;
  dl /= norm;
  if (dh != 0.0 || ds != 0.0 || dl != 0.0) {
    float s2 = ds > 0.0 ? hsl.y + ds * (1.0 - hsl.y) : hsl.y + ds * hsl.y;
    float l3 = dl > 0.0 ? hsl.z + dl * (1.0 - hsl.z) : hsl.z + dl * hsl.z;
    c = clamp(hsl2rgb(vec3(mod(hsl.x + dh, 360.0), clamp(s2, 0.0, 1.0), clamp(l3, 0.0, 1.0))), 0.0, 1.0);
  }

  return clamp(c * (1.0 - 0.5 * u_fade) + vec3(0.2 * u_fade), 0.0, 1.0);
}

vec3 neighborColor(vec2 uv, vec3 fallback) {
  vec4 s = texture(u_texture, uv);
  if (s.a <= 0.0) return fallback;
  return adjustColor(clamp(s.rgb / s.a, 0.0, 1.0));
}

void main() {
  vec4 src = texture(u_texture, v_uv);
  if (src.a <= 0.0) {
    outColor = vec4(0.0);
    return;
  }
  vec3 c = adjustColor(clamp(src.rgb / src.a, 0.0, 1.0));

  if (u_sharpen > 0.0) {
    vec2 texel = 1.0 / u_resolution;
    vec3 around = neighborColor(v_uv + vec2(texel.x, 0.0), c)
      + neighborColor(v_uv - vec2(texel.x, 0.0), c)
      + neighborColor(v_uv + vec2(0.0, texel.y), c)
      + neighborColor(v_uv - vec2(0.0, texel.y), c);
    c = clamp(c + (c * 4.0 - around) * (u_sharpen * 0.25), 0.0, 1.0);
  }

  if (u_vignette > 0.0) {
    float aspect = u_resolution.x / u_resolution.y;
    vec2 p = (v_uv - 0.5) * vec2(aspect, 1.0);
    float d = length(p) / length(vec2(aspect, 1.0) * 0.5);
    float m = smoothstep(0.45, 0.45 + mix(0.15, 0.6, u_vignetteSoftness), d);
    c *= 1.0 - u_vignette * m;
  }

  if (u_grain > 0.0) {
    vec2 seed = gl_FragCoord.xy + vec2(u_time * 61.0, u_time * 37.0);
    float n = fract(sin(dot(seed, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
    c = clamp(c + vec3(n * u_grain * 0.12), 0.0, 1.0);
  }

  outColor = vec4(c * src.a, src.a);
}
`;
