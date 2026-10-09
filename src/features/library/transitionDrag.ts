// Arrasto de transições: guarda o tipo arrastado (variável de módulo + MIME) para a linha do tempo soltar no corte.
// Durante o dragover só dá para ler getDraggedTransitionType(); o dataTransfer só é lido no drop, com readTransitionDrop.

import { TRANSITION_TYPES } from '@/engine/render/transitions';

/** Tipo MIME gravado no dataTransfer ao arrastar uma transição. */
export const TRANSITION_DRAG_MIME = 'application/x-capcut-transition';

/** Tipo da transição sendo arrastada agora, ou null quando não há arrasto de transição. */
let draggedType: string | null = null;

/** Começa o arrasto de uma transição: guarda o tipo e grava o MIME no dataTransfer. */
export function beginTransitionDrag(event: DragEvent, type: string): void {
  draggedType = type;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(TRANSITION_DRAG_MIME, type);
  }
}

/** Encerra o arrasto de transição; chamar ao soltar ou cancelar. */
export function endTransitionDrag(): void {
  draggedType = null;
}

/** Tipo da transição arrastada agora, ou null se nenhuma transição está sendo arrastada. */
export function getDraggedTransitionType(): string | null {
  return draggedType;
}

/** Tipo de transição trazido por um drop, lido do dataTransfer; null se não for uma transição conhecida. */
export function readTransitionDrop(dataTransfer: DataTransfer | null): string | null {
  if (dataTransfer === null || !dataTransfer.types.includes(TRANSITION_DRAG_MIME)) return null;
  const type = dataTransfer.getData(TRANSITION_DRAG_MIME);
  return TRANSITION_TYPES.includes(type) ? type : null;
}
