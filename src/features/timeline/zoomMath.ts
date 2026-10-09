// Contas puras de zoom e rolagem da linha do tempo: largura do conteúdo, zoom ancorado e fator da roda.
import { msToPx, pxToMs } from '../../engine/timeline/snap';
import { TIMELINE_TAIL_MS } from './layout';

/** Largura do conteúdo da linha do tempo em px: duração mais a folga final, nunca menor que a área visível. */
export function contentWidthPx(durationMs: number, zoom: number, viewportPx: number): number {
  return Math.max(viewportPx, msToPx(durationMs + TIMELINE_TAIL_MS, zoom));
}

/** Novo scrollLeft que mantém o instante sob o ponteiro no mesmo lugar ao trocar o zoom. */
export function zoomAroundPoint(
  oldZoom: number,
  newZoom: number,
  scrollLeft: number,
  pointerX: number,
): number {
  const timeMs = pxToMs(scrollLeft + pointerX, oldZoom);
  return Math.max(0, msToPx(timeMs, newZoom) - pointerX);
}

/** Fator multiplicativo do zoom para um deslocamento da roda: para cima aproxima, para baixo afasta. */
export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-deltaY * 0.002);
}
