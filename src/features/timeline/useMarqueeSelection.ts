// Seleção por área: arrastar em área vazia desenha um retângulo e seleciona os clipes que ele toca; sem arrastar, é um clique.
import { useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { msToPx, pxToMs } from '../../engine/timeline/snap';
import { useProjectStore } from '@/stores/projectStore';
import { useTimelineStore } from '@/stores/timelineStore';
import { TRACK_ROW_HEIGHT, trackTopPx } from './layout';

/** Distância mínima, em px, para o gesto virar arrasto e não clique. */
const DRAG_THRESHOLD_PX = 4;

/** Opções do hook: contêiner das faixas, caixa do retângulo e ação do clique sem arrasto. */
export interface MarqueeOptions {
  /** Elemento que contém as faixas; as coordenadas são relativas a ele. */
  containerRef: RefObject<HTMLDivElement>;
  /** Caixa do retângulo, controlada diretamente pelo DOM (sem re-render a cada movimento). */
  overlayRef: RefObject<HTMLDivElement>;
  /** Chamada no clique sem arrasto, com o instante (ms) onde o clique foi dado. */
  onTap: (ms: number) => void;
}

/** Gesto em andamento: ponto inicial, modo aditivo e se já virou arrasto. */
interface Gesture {
  pointerId: number;
  startX: number;
  startY: number;
  additive: boolean;
  active: boolean;
}

/** Handlers de ponteiro a ligar no elemento das faixas. */
export interface MarqueeHandlers {
  /** Inicia o gesto em área vazia (ignora cliques em clipes). */
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  /** Atualiza o retângulo durante o arrasto. */
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  /** Finaliza o gesto: seleciona por área ou trata como clique. */
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  /** Cancela o gesto sem selecionar nada, quando o navegador interrompe o ponteiro. */
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

/** Retângulo em coordenadas do contêiner, com cantos normalizados. */
interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Desenha o retângulo na caixa do DOM, ou a esconde quando o gesto ainda não é arrasto. */
function paintOverlay(overlay: HTMLDivElement | null, box: Box | null): void {
  if (overlay === null) return;
  if (box === null) {
    overlay.style.display = 'none';
    return;
  }
  overlay.style.display = 'block';
  overlay.style.left = `${box.left}px`;
  overlay.style.top = `${box.top}px`;
  overlay.style.width = `${box.right - box.left}px`;
  overlay.style.height = `${box.bottom - box.top}px`;
}

/** Ids dos clipes cujo retângulo (tempo x trilha) toca a caixa dada. */
function clipsInBox(box: Box): string[] {
  const { zoom } = useTimelineStore.getState();
  const tracks = useProjectStore.getState().project?.tracks ?? [];
  const kinds = tracks.map((track) => track.kind);
  const ids: string[] = [];
  tracks.forEach((track, index) => {
    const kind = kinds[index];
    if (kind === undefined) return;
    const top = trackTopPx(kinds, index);
    const bottom = top + TRACK_ROW_HEIGHT[kind];
    if (!(top < box.bottom && bottom > box.top)) return;
    for (const clip of track.clips) {
      const left = msToPx(clip.startMs, zoom);
      const right = msToPx(clip.startMs + clip.durationMs, zoom);
      if (left < box.right && right > box.left) ids.push(clip.id);
    }
  });
  return ids;
}

/** Hook de seleção por área sobre as faixas; devolve os handlers de ponteiro para o contêiner. */
export function useMarqueeSelection({ containerRef, overlayRef, onTap }: MarqueeOptions): MarqueeHandlers {
  const gesture = useRef<Gesture | null>(null);

  /** Retângulo atual entre o início do gesto e o ponteiro, em coordenadas do contêiner. */
  const boxFor = (event: ReactPointerEvent<HTMLDivElement>, active: Gesture): Box | null => {
    const container = containerRef.current;
    if (container === null) return null;
    const rect = container.getBoundingClientRect();
    const x1 = active.startX - rect.left;
    const y1 = active.startY - rect.top;
    const x2 = event.clientX - rect.left;
    const y2 = event.clientY - rect.top;
    return {
      left: Math.min(x1, x2),
      top: Math.min(y1, y2),
      right: Math.max(x1, x2),
      bottom: Math.max(y1, y2),
    };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest('[data-clip-id]') !== null) return;
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      additive: event.ctrlKey || event.metaKey,
      active: false,
    };
    containerRef.current?.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const current = gesture.current;
    if (current === null || current.pointerId !== event.pointerId) return;
    if (!current.active) {
      const distance = Math.hypot(event.clientX - current.startX, event.clientY - current.startY);
      if (distance < DRAG_THRESHOLD_PX) return;
      current.active = true;
    }
    paintOverlay(overlayRef.current, boxFor(event, current));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const current = gesture.current;
    if (current === null || current.pointerId !== event.pointerId) return;
    gesture.current = null;
    const container = containerRef.current;
    if (container?.hasPointerCapture(event.pointerId)) container.releasePointerCapture(event.pointerId);
    if (!current.active) {
      const rect = container?.getBoundingClientRect();
      const x = rect ? current.startX - rect.left : 0;
      paintOverlay(overlayRef.current, null);
      onTap(pxToMs(x, useTimelineStore.getState().zoom));
      return;
    }
    const box = boxFor(event, current);
    paintOverlay(overlayRef.current, null);
    if (box === null) return;
    const hits = clipsInBox(box);
    const store = useTimelineStore.getState();
    store.selectClips(current.additive ? [...new Set([...store.selectedClipIds, ...hits])] : hits);
  };

  const onPointerCancel = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (gesture.current?.pointerId !== event.pointerId) return;
    gesture.current = null;
    paintOverlay(overlayRef.current, null);
  };

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
