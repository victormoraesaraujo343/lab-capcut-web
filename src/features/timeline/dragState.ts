// Estado compartilhado do arrasto na linha do tempo: mídia vinda do painel, fantasma e linha de encaixe, e sessão de ponteiro.
import { useSyncExternalStore } from 'react';
import type { AssetKind, Clip } from '@/types';

/** Mídia arrastada do painel para a linha do tempo. */
export interface DraggedAsset {
  /** Id do asset. */
  id: string;
  /** Duração que o clipe terá na timeline, em ms. */
  durationMs: number;
  /** Tipo de mídia. */
  kind: AssetKind;
}

/** Estado de um arrasto de clipes em andamento. */
export interface MoveState {
  /** Clipe que o ponteiro pegou. */
  clip: Clip;
  /** Índice da trilha de origem do clipe pego. */
  sourceTrackIndex: number;
  /** Ids de todos os clipes que se movem (com seleção e grupos). */
  movingIds: string[];
  /** Deslocamento no tempo aplicado, em ms. */
  deltaMs: number;
  /** Deslocamento de trilhas aplicado. */
  trackDelta: number;
}

/** Distância mínima em px para um arrasto de clipe começar. */
export const DRAG_START_PX = 3;

type Listener = () => void;

let draggedAsset: DraggedAsset | null = null;
let snapLineMs: number | null = null;
let moveState: MoveState | null = null;
const listeners = new Set<Listener>();

/** Avisa todos os ouvintes de que o estado de arrasto mudou. */
function emit(): void {
  for (const listener of listeners) listener();
}

/** Guarda a mídia que está sendo arrastada do painel (dataTransfer não é legível no dragover). */
export function setDraggedAsset(asset: DraggedAsset | null): void {
  draggedAsset = asset;
}

/** Mídia arrastada do painel agora, ou null. */
export function getDraggedAsset(): DraggedAsset | null {
  return draggedAsset;
}

/** Registra um ouvinte de mudanças do estado de arrasto; devolve a função que o remove. */
export function subscribeDrag(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Publica o instante do ponto de encaixe ativo, ou null para esconder a linha. */
export function setSnapLineMs(ms: number | null): void {
  if (snapLineMs === ms) return;
  snapLineMs = ms;
  emit();
}

/** Publica o estado do arrasto de clipes, ou null quando não há arrasto. */
export function setMoveState(state: MoveState | null): void {
  if (moveState === state) return;
  moveState = state;
  emit();
}

/** Hook com o instante da linha de encaixe ativa, em ms, ou null. */
export function useSnapLineMs(): number | null {
  return useSyncExternalStore(subscribeDrag, () => snapLineMs);
}

/** Hook com o estado do arrasto de clipes em andamento, ou null. */
export function useMoveState(): MoveState | null {
  return useSyncExternalStore(subscribeDrag, () => moveState);
}

/** Handlers de uma sessão de arrasto pela janela. */
export interface WindowDragHandlers {
  /** Chamado a cada movimento do ponteiro. */
  onMove: (event: PointerEvent) => void;
  /** Chamado quando o ponteiro é solto. */
  onEnd: (event: PointerEvent) => void;
  /** Chamado quando o arrasto é cancelado (Esc ou pointercancel). */
  onCancel: () => void;
}

/** Escuta o ponteiro na janela até soltar; Esc cancela. Devolve a função que encerra a escuta sem chamar handlers. */
export function beginWindowDrag(handlers: WindowDragHandlers): () => void {
  const stop = (): void => {
    window.removeEventListener('pointermove', handleMove);
    window.removeEventListener('pointerup', handleUp);
    window.removeEventListener('pointercancel', handleCancel);
    window.removeEventListener('keydown', handleKey);
  };
  const handleMove = (event: PointerEvent): void => handlers.onMove(event);
  const handleUp = (event: PointerEvent): void => {
    stop();
    handlers.onEnd(event);
  };
  const handleCancel = (): void => {
    stop();
    handlers.onCancel();
  };
  const handleKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') handleCancel();
  };
  window.addEventListener('pointermove', handleMove);
  window.addEventListener('pointerup', handleUp);
  window.addEventListener('pointercancel', handleCancel);
  window.addEventListener('keydown', handleKey);
  return stop;
}
