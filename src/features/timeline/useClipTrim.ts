// Aparo pelas bordas do clipe: arrasto da alça com ímã, prévia ao vivo pelas mesmas regras do soltar e um único ajuste ao soltar.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Clip } from '@/types';
import { findClip, trimClipEnd, trimClipStart } from '@/engine/timeline/clipOps';
import { collectSnapPoints, pxToMs, snapThresholdMs, snapValue } from '@/engine/timeline/snap';
import { trimClip } from '@/stores/timelineCommands';
import { useProjectStore } from '@/stores/projectStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useTimelineStore } from '@/stores/timelineStore';
import { beginWindowDrag, setSnapLineMs } from './dragState';

/** Borda do clipe que está sendo aparada. */
export type TrimEdge = 'start' | 'end';

/** Prévia do clipe durante o aparo, em ms na timeline. */
export interface TrimPreview {
  /** Início previsto, em ms. */
  startMs: number;
  /** Fim previsto, em ms. */
  endMs: number;
}

/** Aparo de um clipe pelas alças: devolve a prévia atual e o handler de pointerdown de cada alça. */
export function useClipTrim(clip: Clip, zoom: number) {
  const [preview, setPreview] = useState<TrimPreview | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      if (stopRef.current !== null) {
        stopRef.current();
        stopRef.current = null;
        setSnapLineMs(null);
      }
    },
    [],
  );

  /** Começa o aparo da borda dada; só ao soltar a edição é gravada, com o mesmo resultado da prévia. */
  function beginTrim(edge: TrimEdge, event: ReactPointerEvent<HTMLElement>): void {
    event.stopPropagation();
    if (event.button !== 0) return;
    stopRef.current?.();
    const startX = event.clientX;
    const clipEnd = clip.startMs + clip.durationMs;
    const originMs = edge === 'start' ? clip.startMs : clipEnd;
    let committedMs = originMs;

    const reset = (): void => {
      stopRef.current = null;
      setPreview(null);
      setSnapLineMs(null);
    };

    stopRef.current = beginWindowDrag({
      onMove: (move) => {
        const project = useProjectStore.getState().project;
        if (project === null) return;
        const rawMs = originMs + pxToMs(move.clientX - startX, zoom);
        let valueMs = rawMs;
        let snappedTo: number | null = null;
        if (useTimelineStore.getState().snapEnabled) {
          const points = collectSnapPoints(
            project.tracks,
            [clip.id],
            usePlaybackStore.getState().currentTimeMs,
            project.markers,
          );
          const snapped = snapValue(rawMs, points, snapThresholdMs(zoom));
          valueMs = snapped.value;
          snappedTo = snapped.snappedTo;
        }
        setSnapLineMs(snappedTo);

        // A prévia usa as funções puras do soltar, então o clipe não muda de tamanho ao soltar.
        const durationMs = project.assets.find((a) => a.id === clip.assetId)?.durationMs;
        const trimmed =
          edge === 'start'
            ? trimClipStart(project.tracks, clip.id, valueMs, durationMs)
            : trimClipEnd(project.tracks, clip.id, valueMs, durationMs);
        const current = findClip(trimmed, clip.id)?.clip;
        if (current === undefined) return;
        const currentEnd = current.startMs + current.durationMs;
        committedMs = edge === 'start' ? current.startMs : currentEnd;
        setPreview({ startMs: current.startMs, endMs: currentEnd });
      },
      onEnd: () => {
        reset();
        if (committedMs !== originMs) trimClip(clip.id, edge, committedMs);
      },
      onCancel: reset,
    });
  }

  return {
    preview,
    onStartHandleDown: (event: ReactPointerEvent<HTMLElement>) => beginTrim('start', event),
    onEndHandleDown: (event: ReactPointerEvent<HTMLElement>) => beginTrim('end', event),
  };
}
