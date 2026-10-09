// Miniaturas leves dos itens da biblioteca, sem WebGL: degradê CSS para filtros e ícone + cor para efeitos e transições.

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Aperture,
  Blend,
  CircleDashed,
  CircleDot,
  Columns3,
  Droplet,
  FlipHorizontal2,
  Grid3x3,
  Hexagon,
  Maximize2,
  Moon,
  Pipette,
  Rainbow,
  RotateCw,
  Scan,
  Sparkles,
  SquareDashed,
  Sun,
  Tv,
  Vibrate,
  ZoomIn,
  ZoomOut,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { Rgb } from '@/engine/render/filters/colorMath';
import { presetThumbnailColor } from '@/engine/render/filters/filterPresets';

/** Miniatura de efeito ou transição: ícone representativo e cor de fundo da categoria. */
export interface IconThumbnail {
  /** Ícone que representa o tipo. */
  Icon: LucideIcon;
  /** Cor de fundo do cartão, pela categoria. */
  background: string;
}

/** Cores de amostra (0..1) de uma cena típica: pele, céu, folhagem e sombra. */
const SAMPLE_COLORS: readonly Rgb[] = [
  [0.85, 0.65, 0.5],
  [0.45, 0.7, 0.9],
  [0.3, 0.6, 0.35],
  [0.15, 0.12, 0.2],
];

/** Fundo dos cartões de efeito. */
const EFFECT_BACKGROUND = '#4a3566';

/** Fundo dos cartões de transição. */
const TRANSITION_BACKGROUND = '#24506b';

/** Ícone usado quando o tipo não tem um ícone próprio. */
const FALLBACK_ICON: LucideIcon = Sparkles;

/** Ícone de cada efeito, pelo tipo. */
const EFFECT_ICONS: Readonly<Record<string, LucideIcon>> = {
  blur: Droplet,
  pixelate: Grid3x3,
  mirror: FlipHorizontal2,
  shake: Vibrate,
  glitch: Zap,
  vhs: Tv,
  pulseZoom: Maximize2,
  chromaKey: Pipette,
  maskRect: SquareDashed,
  maskCircle: CircleDot,
  maskLinear: Scan,
  rgbSplit: Rainbow,
  fisheye: Aperture,
  kaleidoscope: Hexagon,
};

/** Ícone de cada transição, pelo tipo. */
const TRANSITION_ICONS: Readonly<Record<string, LucideIcon>> = {
  dissolve: Blend,
  fadeBlack: Moon,
  slideLeft: ArrowLeft,
  slideRight: ArrowRight,
  slideUp: ArrowUp,
  slideDown: ArrowDown,
  zoomIn: ZoomIn,
  zoomOut: ZoomOut,
  blurCross: Droplet,
  wipe: Columns3,
  wipeCircle: CircleDashed,
  glitchCross: Zap,
  spin: RotateCw,
  flashWhite: Sun,
  pixelize: Grid3x3,
};

/** Converte um canal 0..1 em um número 0..255. */
function channel(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 255);
}

/** Cor CSS rgb() de uma amostra 0..1. */
function toCss([r, g, b]: Rgb): string {
  return `rgb(${channel(r)}, ${channel(g)}, ${channel(b)})`;
}

/** Degradê CSS da esquerda para a direita com as 4 cores de amostra já passadas pelo filtro pronto. */
export function filterThumbnailBackground(presetId: string): string {
  const last = SAMPLE_COLORS.length - 1;
  const stops = SAMPLE_COLORS.map((rgb, index) => {
    const position = Math.round((index / last) * 100);
    return `${toCss(presetThumbnailColor(presetId, rgb))} ${position}%`;
  });
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

/** Miniatura de um efeito: ícone do tipo sobre a cor da categoria Efeitos. */
export function effectThumbnail(type: string): IconThumbnail {
  return { Icon: EFFECT_ICONS[type] ?? FALLBACK_ICON, background: EFFECT_BACKGROUND };
}

/** Miniatura de uma transição: ícone do tipo sobre a cor da categoria Transições. */
export function transitionThumbnail(type: string): IconThumbnail {
  return { Icon: TRANSITION_ICONS[type] ?? FALLBACK_ICON, background: TRANSITION_BACKGROUND };
}
