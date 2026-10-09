// Estilos prontos de texto, estilo CapCut: 20 combinações de fonte, cor, contorno, sombra, fundo e animação.

import type { TextAnimation, TextStyle } from '@/types';

/** Estilo pronto de texto: campos de estilo que ele altera e, opcionalmente, uma animação de entrada. */
export interface TextPreset {
  /** Identificador único do estilo. */
  id: string;
  /** Campos de estilo aplicados sobre o estilo base. */
  style: Partial<TextStyle>;
  /** Animação de entrada sugerida pelo estilo. */
  animationIn?: TextAnimation;
}

/** Estilos prontos disponíveis, usando só as fontes embutidas. */
export const TEXT_PRESETS: TextPreset[] = [
  {
    id: 'classic-outline',
    style: { fontFamily: 'Inter', bold: true, color: '#ffffff', strokeColor: '#000000', strokeWidth: 6 },
  },
  {
    id: 'yellow-caption',
    style: {
      fontFamily: 'Roboto',
      bold: true,
      fontSize: 64,
      color: '#ffd400',
      shadowColor: 'rgba(0,0,0,0.8)',
      shadowBlur: 8,
      shadowOffsetX: 0,
      shadowOffsetY: 4,
    },
  },
  {
    id: 'black-box',
    style: {
      fontFamily: 'Inter',
      fontSize: 64,
      color: '#ffffff',
      backgroundColor: '#000000',
      backgroundOpacity: 0.6,
    },
  },
  {
    id: 'white-box',
    style: {
      fontFamily: 'Roboto',
      bold: true,
      fontSize: 64,
      color: '#000000',
      backgroundColor: '#ffffff',
      backgroundOpacity: 1,
    },
  },
  {
    id: 'neon-cyan',
    style: {
      fontFamily: 'Space Grotesk',
      bold: true,
      color: '#00f0ff',
      shadowColor: '#00f0ff',
      shadowBlur: 30,
    },
    animationIn: { type: 'fadeIn', durationMs: 400 },
  },
  {
    id: 'neon-pink',
    style: {
      fontFamily: 'Space Grotesk',
      bold: true,
      color: '#ff2fb9',
      shadowColor: '#ff2fb9',
      shadowBlur: 24,
    },
  },
  {
    id: 'serif-elegant',
    style: {
      fontFamily: 'Gelasio',
      italic: true,
      fontSize: 80,
      color: '#f5f1e8',
      letterSpacing: 2,
    },
  },
  {
    id: 'typewriter',
    style: { fontFamily: 'JetBrains Mono', fontSize: 64, color: '#c8ffc8' },
    animationIn: { type: 'typewriter', durationMs: 1200 },
  },
  {
    id: 'retro',
    style: {
      fontFamily: 'Michroma',
      fontSize: 56,
      color: '#ffb703',
      letterSpacing: 4,
      shadowColor: '#fb8500',
      shadowBlur: 0,
      shadowOffsetX: 4,
      shadowOffsetY: 4,
    },
  },
  {
    id: 'comic',
    style: {
      fontFamily: 'Comic Relief',
      bold: true,
      fontSize: 88,
      color: '#ffffff',
      strokeColor: '#000000',
      strokeWidth: 12,
    },
    animationIn: { type: 'pop', durationMs: 400 },
  },
  {
    id: 'minimal-thin',
    style: { fontFamily: 'Inter', bold: false, fontSize: 56, color: '#f0f0f0', letterSpacing: 8 },
  },
  {
    id: 'red-highlight',
    style: {
      fontFamily: 'Inter',
      bold: true,
      fontSize: 72,
      color: '#ffffff',
      backgroundColor: '#e63946',
      backgroundOpacity: 1,
    },
  },
  {
    id: 'gradient-sim',
    style: {
      fontFamily: 'Ubuntu',
      bold: true,
      fontSize: 96,
      color: '#ff5e62',
      shadowColor: '#ffb347',
      shadowBlur: 18,
    },
  },
  {
    id: 'tiktok-caption',
    style: {
      fontFamily: 'Space Grotesk',
      bold: true,
      fontSize: 84,
      color: '#ffffff',
      strokeColor: '#000000',
      strokeWidth: 10,
    },
    animationIn: { type: 'pop', durationMs: 400 },
  },
  {
    id: 'label',
    style: {
      fontFamily: 'Roboto',
      bold: true,
      fontSize: 56,
      color: '#111111',
      backgroundColor: '#7cf4c7',
      backgroundOpacity: 1,
    },
  },
  {
    id: 'long-shadow',
    style: {
      fontFamily: 'Inter',
      bold: true,
      fontSize: 96,
      color: '#ffffff',
      shadowColor: '#000000',
      shadowBlur: 0,
      shadowOffsetX: 12,
      shadowOffsetY: 12,
    },
  },
  {
    id: 'vintage',
    style: {
      fontFamily: 'Caladea',
      italic: true,
      fontSize: 80,
      color: '#f4e4c1',
      shadowColor: '#3d2b1f',
      shadowBlur: 4,
      shadowOffsetX: 2,
      shadowOffsetY: 2,
    },
  },
  {
    id: 'technical',
    style: {
      fontFamily: 'JetBrains Mono',
      fontSize: 48,
      color: '#7cfc00',
      letterSpacing: 1,
      backgroundColor: '#0b1a0b',
      backgroundOpacity: 0.8,
    },
  },
  {
    id: 'soft',
    style: {
      fontFamily: 'Ubuntu',
      fontSize: 72,
      color: '#fdf6ec',
      lineHeight: 1.4,
      shadowColor: 'rgba(0,0,0,0.35)',
      shadowBlur: 20,
    },
    animationIn: { type: 'fadeIn', durationMs: 400 },
  },
  {
    id: 'impact',
    style: {
      fontFamily: 'Inter',
      bold: true,
      fontSize: 160,
      color: '#ffffff',
      letterSpacing: -2,
      lineHeight: 1,
    },
    animationIn: { type: 'pop', durationMs: 400 },
  },
];

/** Identificador do estilo de legenda padrão. */
export const CAPTION_PRESET_ID = 'yellow-caption';

/** Aplica os campos do estilo pronto sobre o estilo base e devolve um novo estilo (não altera o base). */
export function applyPreset(base: TextStyle, preset: TextPreset): TextStyle {
  return { ...base, ...preset.style };
}
