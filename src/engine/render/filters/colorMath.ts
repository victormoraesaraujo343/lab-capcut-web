// Matemática de cor pura que espelha o shader de colorAdjustGlsl.ts (usada em testes e nas miniaturas dos filtros).
// Não cobre nitidez, vinheta nem grão: esses dependem de vizinhos ou da posição do pixel.

/** Identificadores das 8 faixas de matiz do ajuste HSL. */
export type HueBandId = 'red' | 'orange' | 'yellow' | 'green' | 'aqua' | 'blue' | 'purple' | 'magenta';

/** Tripla RGB com componentes em 0..1. */
export type Rgb = [number, number, number];

/** Valores dos parâmetros de ajuste de cor; chaves ausentes valem 0 (neutro). */
export type ColorAdjustValues = Readonly<Partial<Record<string, number>>>;

/** Faixas de matiz com o centro de cada uma, em graus. */
export const HUE_BANDS: readonly { id: HueBandId; center: number }[] = [
  { id: 'red', center: 0 },
  { id: 'orange', center: 30 },
  { id: 'yellow', center: 60 },
  { id: 'green', center: 120 },
  { id: 'aqua', center: 180 },
  { id: 'blue', center: 240 },
  { id: 'purple', center: 280 },
  { id: 'magenta', center: 320 },
];

/** Distância, em graus do centro, em que o peso de uma faixa chega a zero. */
export const HUE_BAND_RANGE = 45;

/** Ganho de temperatura (R sobe e B desce por unidade). */
const TEMP_GAIN = 0.12;
/** Ganho de tonalidade (G sobe e R/B descem por unidade). */
const TINT_GAIN = 0.1;
/** Deslocamento máximo do brilho por unidade. */
const BRIGHTNESS_GAIN = 0.3;
/** Deslocamento máximo de sombras e realces por unidade. */
const TONE_GAIN = 0.25;
/** Quanto o desbotar levanta o preto (valor de cinza adicionado). */
const FADE_LIFT = 0.2;

/** Chave do parâmetro HSL de uma faixa e canal (ex.: hslRedH). */
export function hslParamKey(band: HueBandId, channel: 'H' | 'S' | 'L'): string {
  const name = band.charAt(0).toUpperCase() + band.slice(1);
  return `hsl${name}${channel}`;
}

/** Limita um número ao intervalo 0..1. */
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Interpolação suave de Hermite entre duas bordas (igual ao smoothstep do GLSL). */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Luminância relativa (Rec. 709), igual à usada no shader. */
function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Converte RGB (0..1) em [matiz em graus 0..360, saturação 0..1, luminosidade 0..1]. */
export function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  if (d <= 1e-6) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h: number;
  if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

/** Canal de cor de uma faixa de matiz; t é a posição 0..1 do canal no círculo. */
function hueChannel(p: number, q: number, t: number): number {
  const u = t - Math.floor(t);
  if (u < 1 / 6) return p + (q - p) * 6 * u;
  if (u < 0.5) return q;
  if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
  return p;
}

/** Converte [matiz em graus, saturação, luminosidade] em RGB (0..1). */
export function hslToRgb(h: number, s: number, l: number): Rgb {
  if (s <= 0) return [l, l, l];
  const hn = (((h % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hueChannel(p, q, hn + 1 / 3), hueChannel(p, q, hn), hueChannel(p, q, hn - 1 / 3)];
}

/** Peso suave (0..1) de uma faixa para um matiz em graus, pela distância circular ao centro da faixa. */
export function hueBandWeight(hue: number, band: HueBandId): number {
  const center = HUE_BANDS.find((b) => b.id === band)?.center ?? 0;
  const diff = Math.abs((((hue - center + 180) % 360) + 360) % 360 - 180);
  const w = clamp01(1 - diff / HUE_BAND_RANGE);
  return w * w * (3 - 2 * w);
}

/** Aplica o ajuste de cor (sem nitidez, vinheta e grão) a um pixel RGB sem alfa; mesma ordem do shader. */
export function applyColorAdjust(rgb: Rgb, params: ColorAdjustValues): Rgb {
  const v = (key: string): number => params[key] ?? 0;
  const exposure = Math.pow(2, v('exposure'));
  const temp = v('temperature');
  const tint = v('tint');
  const bright = v('brightness') * BRIGHTNESS_GAIN;
  const contrast = 1 + v('contrast');

  // Exposição, temperatura/tonalidade, brilho e contraste.
  let r = rgb[0] * exposure + temp * TEMP_GAIN - tint * 0.05;
  let g = rgb[1] * exposure + tint * TINT_GAIN;
  let b = rgb[2] * exposure - temp * TEMP_GAIN - tint * 0.05;
  r = clamp01((r + bright - 0.5) * contrast + 0.5);
  g = clamp01((g + bright - 0.5) * contrast + 0.5);
  b = clamp01((b + bright - 0.5) * contrast + 0.5);

  // Sombras e realces, pela luminância atual.
  const lum1 = luma(r, g, b);
  const shadowMask = 1 - smoothstep(0, 0.5, lum1);
  const highMask = smoothstep(0.5, 1, lum1);
  const toneAdd = v('shadows') * TONE_GAIN * shadowMask + v('highlights') * TONE_GAIN * highMask;
  r = clamp01(r + toneAdd);
  g = clamp01(g + toneAdd);
  b = clamp01(b + toneAdd);

  // Saturação global (-1 = cinza) e matiz global.
  const lum2 = luma(r, g, b);
  const satFactor = 1 + v('saturation');
  r = clamp01(lum2 + (r - lum2) * satFactor);
  g = clamp01(lum2 + (g - lum2) * satFactor);
  b = clamp01(lum2 + (b - lum2) * satFactor);
  let [hue, sat, light] = rgbToHsl([r, g, b]);
  if (v('hue') !== 0) {
    hue = (((hue + v('hue')) % 360) + 360) % 360;
    [r, g, b] = hslToRgb(hue, sat, light);
  }

  // HSL por faixa, com peso pela distância de matiz e ganho pela saturação do pixel.
  [hue, sat, light] = rgbToHsl([r, g, b]);
  const gate = clamp01(sat * 4);
  let total = 0;
  let dh = 0;
  let ds = 0;
  let dl = 0;
  for (const band of HUE_BANDS) {
    const w = hueBandWeight(hue, band.id) * gate;
    total += w;
    dh += w * v(hslParamKey(band.id, 'H'));
    ds += w * v(hslParamKey(band.id, 'S'));
    dl += w * v(hslParamKey(band.id, 'L'));
  }
  const norm = Math.max(1, total);
  dh /= norm;
  ds /= norm;
  dl /= norm;
  if (dh !== 0 || ds !== 0 || dl !== 0) {
    const s2 = clamp01(ds > 0 ? sat + ds * (1 - sat) : sat + ds * sat);
    const l2 = clamp01(dl > 0 ? light + dl * (1 - light) : light + dl * light);
    [r, g, b] = hslToRgb(hue + dh, s2, l2);
  }

  // Desbotar: levanta os pretos e reduz o contraste.
  const fade = v('fade');
  return [
    clamp01(clamp01(r) * (1 - 0.5 * fade) + FADE_LIFT * fade),
    clamp01(clamp01(g) * (1 - 0.5 * fade) + FADE_LIFT * fade),
    clamp01(clamp01(b) * (1 - 0.5 * fade) + FADE_LIFT * fade),
  ];
}
