// Arrasto de clipes (fantasma, ímã e troca de trilha) e soltura de mídia do painel numa trilha.
import { useEffect, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { Clip, Track } from '@/types';
import { IMAGE_DEFAULT_DURATION_MS } from '@/engine/timeline/constants';
import { ASSET_DRAG_MIME, trackIndexAtY } from './layout';
import { collectSnapPoints, pxToMs, snapRange, snapThresholdMs } from '@/engine/timeline/snap';
import { expandWithGroups } from '@/engine/timeline/selectionOps';
import { trackKindForAsset } from '@/engine/timeline/clipFactory';
import { addAssetToTimeline, moveSelected } from '@/stores/timelineCommands';
import { useProjectStore } from '@/stores/projectStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useTimelineStore } from '@/stores/timelineStore';
import { beginWindowDrag, DRAG_START_PX, getDraggedAsset, setMoveState, setSnapLineMs, type MoveState } from './dragState';

/** Opções do arrasto de um clipe. */
export interface ClipDragOptions {
  /** Clipe onde o arrasto começa. */
  clip: Clip;
  /** Índice da trilha do clipe. */
  trackIndex: number;
  /** Zoom em pixels por segundo. */
  zoom: number;
}

/** Ids do clipe pego e dos que irão junto (seleção com grupos); o pego sempre entra. */
function movingIdsFor(clipId: string): string[] {
  const selected = useTimelineStore.getState().selectedClipIds;
  const tracks = useProjectStore.getState().project?.tracks ?? [];
  const ids = selected.includes(clipId) ? expandWithGroups(tracks, selected) : [clipId];
  return ids.includes(clipId) ? ids : [...ids, clipId];
}

/** Índice de trilha de destino pela posição vertical do ponteiro, ou o deslocamento 0 se não for válido. */
function trackDeltaAt(clientY: number, container: HTMLElement | null, tracks: Track[], sourceIndex: number): number {
  if (container === null) return 0;
  const top = container.getBoundingClientRect().top;
  const index = trackIndexAtY(
    tracks.map((track) => track.kind),
    clientY - top,
  );
  const dest = tracks[index];
  const source = tracks[sourceIndex];
  if (index < 0 || dest === undefined || source === undefined) return 0;
  if (dest.locked || dest.kind !== source.kind) return 0;
  return index - sourceIndex;
}

/** Arrasto de um clipe: só grava ao soltar; Esc cancela. Devolve o handler de pointerdown e limpa o estado ao desmontar. */
export function useClipDrag({ clip, trackIndex, zoom }: ClipDragOptions) {
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      if (stopRef.current !== null) {
        stopRef.current();
        stopRef.current = null;
        setMoveState(null);
        setSnapLineMs(null);
      }
    },
    [],
  );

  /** Inicia a escuta do arrasto no pointerdown; onClickOnly roda se o ponteiro soltar sem arrastar. */
  function onPointerDown(event: ReactPointerEvent<HTMLElement>, onClickOnly: () => void): void {
    if (event.button !== 0) return;
    stopRef.current?.();
    const startX = event.clientX;
    const startY = event.clientY;
    const container = event.currentTarget.closest<HTMLElement>('[data-timeline-tracks]');
    let started = false;
    let moving: string[] = [];
    let finalDelta = 0;
    let finalTrack = 0;

    const reset = (): void => {
      stopRef.current = null;
      setMoveState(null);
      setSnapLineMs(null);
    };

    stopRef.current = beginWindowDrag({
      onMove: (move) => {
        if (!started) {
          if (Math.hypot(move.clientX - startX, move.clientY - startY) <= DRAG_START_PX) return;
          started = true;
          moving = movingIdsFor(clip.id);
        }
        const project = useProjectStore.getState().project;
        if (project === null) return;
        const { tracks, markers } = project;
        const { snapEnabled } = useTimelineStore.getState();
        const rawStart = Math.max(0, clip.startMs + pxToMs(move.clientX - startX, zoom));
        let startMs = rawStart;
        let snappedTo: number | null = null;
        if (snapEnabled) {
          const points = collectSnapPoints(tracks, moving, usePlaybackStore.getState().currentTimeMs, markers);
          const snapped = snapRange(rawStart, clip.durationMs, points, snapThresholdMs(zoom));
          startMs = Math.max(0, snapped.startMs);
          snappedTo = snapped.snappedTo;
        }
        setSnapLineMs(snappedTo);
        const deltaMs = startMs - clip.startMs;
        const trackDelta = trackDeltaAt(move.clientY, container, tracks, trackIndex);
        finalDelta = deltaMs;
        finalTrack = trackDelta;
        const state: MoveState = {
          clip,
          sourceTrackIndex: trackIndex,
          movingIds: moving,
          deltaMs,
          trackDelta,
        };
        setMoveState(state);
      },
      onEnd: (up) => {
        reset();
        if (started) {
          moveSelected(finalDelta, finalTrack, up.altKey ? 'insert' : 'overwrite');
        } else {
          onClickOnly();
        }
      },
      onCancel: reset,
    });
  }

  return { onPointerDown };
}

/** Largura e posição de um encaixe de soltura, em ms. */
export interface AssetDropGhost {
  /** Início do fantasma na linha do tempo, em ms. */
  leftMs: number;
  /** Duração do fantasma, em ms. */
  durationMs: number;
}

/** Instante de início de uma soltura, com ímã, e publica a linha de encaixe. */
function dropStartMs(event: DragEvent<HTMLElement>, durationMs: number, zoom: number): number {
  const left = event.currentTarget.getBoundingClientRect().left;
  const rawMs = Math.max(0, pxToMs(event.clientX - left, zoom));
  const project = useProjectStore.getState().project;
  if (project === null || !useTimelineStore.getState().snapEnabled) {
    setSnapLineMs(null);
    return rawMs;
  }
  const points = collectSnapPoints(project.tracks, [], usePlaybackStore.getState().currentTimeMs, project.markers);
  const snapped = snapRange(rawMs, durationMs, points, snapThresholdMs(zoom));
  setSnapLineMs(snapped.snappedTo);
  return Math.max(0, snapped.startMs);
}

/** Duração que um asset solto terá na timeline, em ms. */
function draggedDurationMs(): number {
  return getDraggedAsset()?.durationMs ?? IMAGE_DEFAULT_DURATION_MS;
}

/** Soltura de mídia do painel numa trilha: mostra o fantasma com ímã e adiciona o clipe ao soltar. Trilha travada não aceita. */
export function useAssetDrop(track: Track, zoom: number) {
  const [ghost, setGhost] = useState<AssetDropGhost | null>(null);

  /** Indica se a trilha aceita o que está sendo arrastado. */
  function accepts(event: DragEvent<HTMLElement>): boolean {
    if (track.locked || !Array.from(event.dataTransfer.types).includes(ASSET_DRAG_MIME)) return false;
    const dragged = getDraggedAsset();
    return dragged === null || trackKindForAsset(dragged.kind) === track.kind;
  }

  /** Limpa o fantasma e a linha de encaixe. */
  function clearDrop(): void {
    setGhost(null);
    setSnapLineMs(null);
  }

  /** Aceita a soltura e mostra o fantasma. */
  function onDragOver(event: DragEvent<HTMLElement>): void {
    if (!accepts(event)) {
      clearDrop();
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    const durationMs = draggedDurationMs();
    setGhost({ leftMs: dropStartMs(event, durationMs, zoom), durationMs });
  }

  /** Sai do fantasma quando o ponteiro deixa a trilha de fato. */
  function onDragLeave(event: DragEvent<HTMLElement>): void {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    clearDrop();
  }

  /** Adiciona o asset na trilha no instante do fantasma; Alt insere empurrando. */
  function onDrop(event: DragEvent<HTMLElement>): void {
    const accepted = accepts(event);
    const assetId = event.dataTransfer.getData(ASSET_DRAG_MIME);
    if (!accepted || assetId === '') {
      clearDrop();
      return;
    }
    event.preventDefault();
    const startMs = dropStartMs(event, draggedDurationMs(), zoom);
    clearDrop();
    addAssetToTimeline(assetId, track.id, startMs, event.altKey ? 'insert' : 'overwrite');
  }

  return { ghost, onDragOver, onDragLeave, onDrop };
}
