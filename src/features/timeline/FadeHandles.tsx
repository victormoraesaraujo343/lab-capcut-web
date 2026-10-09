// Alças de fade no topo do clipe: a da esquerda é o fade de entrada, a da direita o de saída; arrastar na horizontal muda o fade.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { t } from '@/i18n/pt-BR';
import type { Clip } from '@/types';
import { clampFadeMs, setFade, type FadeEdge } from '@/stores/audioCommands';
import { msToPx, pxToMs } from '@/engine/timeline/snap';
import { beginWindowDrag } from './dragState';
import styles from './FadeHandles.module.css';

/** Propriedades de FadeHandles. */
export interface FadeHandlesProps {
  /** Clipe com som cujos fades são editados. */
  clip: Clip;
  /** Zoom em pixels por segundo. */
  zoom: number;
}

/** Formata milissegundos como segundos no padrão brasileiro, com a unidade da i18n. */
function formatSeconds(ms: number): string {
  const seconds = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(ms / 1000);
  return `${seconds} ${t.audioTools.secondsUnit}`;
}

/** Duas alças de fade sobre o clipe, com a área do fade sombreada; o gesto não chega ao clipe. */
export function FadeHandles({ clip, zoom }: FadeHandlesProps) {
  const [dragging, setDragging] = useState<{ edge: FadeEdge; ms: number } | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      stopRef.current?.();
      stopRef.current = null;
    },
    [],
  );

  const widthPx = msToPx(clip.durationMs, zoom);
  const fadeInMs = dragging?.edge === 'in' ? dragging.ms : clip.audio.fadeInMs;
  const fadeOutMs = dragging?.edge === 'out' ? dragging.ms : clip.audio.fadeOutMs;
  const inPx = msToPx(fadeInMs, zoom);
  const outPx = msToPx(fadeOutMs, zoom);

  /** Começa o arraste de uma alça: cada movimento grava o fade, e o histórico agrupa o arraste inteiro. */
  function beginDrag(edge: FadeEdge, event: ReactPointerEvent<HTMLDivElement>): void {
    event.stopPropagation();
    if (event.button !== 0) return;
    stopRef.current?.();
    const startX = event.clientX;
    const originMs = edge === 'in' ? clip.audio.fadeInMs : clip.audio.fadeOutMs;
    let lastMs = originMs;

    const finish = (): void => {
      stopRef.current = null;
      setDragging(null);
    };

    setDragging({ edge, ms: originMs });
    stopRef.current = beginWindowDrag({
      onMove: (move) => {
        const deltaMs = pxToMs(move.clientX - startX, zoom);
        const rawMs = edge === 'in' ? originMs + deltaMs : originMs - deltaMs;
        setFade(clip.id, edge, rawMs);
        lastMs = clampFadeMs(clip, edge, rawMs);
        setDragging({ edge, ms: lastMs });
      },
      onEnd: finish,
      onCancel: () => {
        if (lastMs !== originMs) setFade(clip.id, edge, originMs);
        finish();
      },
    });
  }

  const outLeftPx = widthPx - outPx;
  const tip = (edge: FadeEdge, ms: number): string =>
    `${edge === 'in' ? t.audioTools.fadeIn : t.audioTools.fadeOut}: ${formatSeconds(ms)}`;

  return (
    <>
      <div className={styles.rampIn} style={{ width: inPx }} aria-hidden="true" />
      <div className={styles.rampOut} style={{ width: outPx }} aria-hidden="true" />
      <div
        role="slider"
        aria-label={t.audioTools.fadeIn}
        aria-valuenow={Math.round(fadeInMs)}
        aria-valuemin={0}
        data-active={dragging?.edge === 'in' ? 'true' : undefined}
        className={styles.handle}
        style={{ left: inPx }}
        onPointerDown={(event) => beginDrag('in', event)}
      >
        <span className={styles.tip}>{tip('in', fadeInMs)}</span>
      </div>
      <div
        role="slider"
        aria-label={t.audioTools.fadeOut}
        aria-valuenow={Math.round(fadeOutMs)}
        aria-valuemin={0}
        data-active={dragging?.edge === 'out' ? 'true' : undefined}
        className={styles.handle}
        style={{ left: outLeftPx }}
        onPointerDown={(event) => beginDrag('out', event)}
      >
        <span className={styles.tip}>{tip('out', fadeOutMs)}</span>
      </div>
    </>
  );
}
