// Estilo padrão de texto: Inter 96 px branco centralizado, sem contorno, sombra ou fundo.

import type { TextStyle } from '@/types';

/** Estilo de texto padrão: Inter 96 px, branco, centralizado, sem contorno, sombra ou fundo. */
export function defaultTextStyle(): TextStyle {
  return {
    fontFamily: 'Inter',
    fontSize: 96,
    color: '#ffffff',
    bold: false,
    italic: false,
    underline: false,
    align: 'center',
    letterSpacing: 0,
    lineHeight: 1.2,
    strokeColor: '#000000',
    strokeWidth: 0,
    shadowColor: '#000000',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    backgroundColor: '#000000',
    backgroundOpacity: 0,
    opacity: 1,
  };
}
