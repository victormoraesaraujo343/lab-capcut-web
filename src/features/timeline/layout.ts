// Medidas compartilhadas da linha do tempo (contrato entre régua, cabeçalhos e trilhas).
import type { TrackKind } from '@/types';

/** Altura de cada trilha em px, por tipo. */
export const TRACK_ROW_HEIGHT: Record<TrackKind, number> = {
  video: 64,
  audio: 48,
  text: 36,
  sticker: 36,
  effect: 32,
};

/** Largura da coluna de cabeçalhos das trilhas, em px. */
export const TRACK_HEADER_WIDTH = 148;

/** Altura da régua de tempo, em px. */
export const RULER_HEIGHT = 28;

/** Espaço vertical entre trilhas, em px. */
export const TRACK_GAP = 4;

/** Folga após o fim do projeto para poder arrastar além dele, em ms. */
export const TIMELINE_TAIL_MS = 30_000;

/** Largura das alças de aparar nas bordas do clipe, em px. */
export const TRIM_HANDLE_WIDTH = 8;

/** Tipo MIME usado ao arrastar uma mídia do painel para a linha do tempo. */
export const ASSET_DRAG_MIME = 'application/x-capcut-asset';

/** Soma das alturas das trilhas até o índice (exclusivo), incluindo os espaços. */
export function trackTopPx(kinds: TrackKind[], index: number): number {
  let top = 0;
  for (let i = 0; i < index && i < kinds.length; i += 1) {
    const kind = kinds[i];
    if (kind !== undefined) top += TRACK_ROW_HEIGHT[kind] + TRACK_GAP;
  }
  return top;
}

/** Índice da trilha sob a coordenada vertical (relativa ao topo da primeira trilha), ou -1. */
export function trackIndexAtY(kinds: TrackKind[], y: number): number {
  let top = 0;
  for (let i = 0; i < kinds.length; i += 1) {
    const kind = kinds[i];
    if (kind === undefined) continue;
    const bottom = top + TRACK_ROW_HEIGHT[kind];
    if (y >= top && y < bottom + TRACK_GAP) return i;
    top = bottom + TRACK_GAP;
  }
  return -1;
}
