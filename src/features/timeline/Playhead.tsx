// Cursor de reprodução: linha vertical sobre a régua e as faixas; a cabeça arrasta o cursor e a área acompanha a reprodução.
import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { msToPx, pxToMs } from '../../engine/timeline/snap';
import { t } from '@/i18n/pt-BR';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useTimelineStore } from '@/stores/timelineStore';
import { TRACK_HEADER_WIDTH } from './layout';
import styles from './Playhead.module.css';

/** Props do cursor: a área rolável, usada para acompanhar a reprodução. */
export interface PlayheadProps {
  /** Área rolável das faixas, onde a rolagem automática é aplicada. */
  viewportRef: RefObject<HTMLDivElement>;
}

/** Cursor de reprodução com a cabeça arrastável e rolagem por páginas durante a reprodução. */
export function Playhead({ viewportRef }: PlayheadProps) {
  const currentTimeMs = usePlaybackStore((state) => state.currentTimeMs);
  const isPlaying = usePlaybackStore((state) => state.isPlaying);
  const zoom = useTimelineStore((state) => state.zoom);
  const scrollLeft = useTimelineStore((state) => state.scrollLeft);
  const overlayRef = useRef<HTMLDivElement>(null);
  const x = msToPx(currentTimeMs, zoom) - scrollLeft;

  // Durante a reprodução, pagina a área quando o cursor sai da parte visível.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!isPlaying || viewport === null) return;
    const { zoom: currentZoom, scrollLeft: currentScroll } = useTimelineStore.getState();
    const cursorX = msToPx(currentTimeMs, currentZoom);
    if (cursorX >= currentScroll && cursorX <= currentScroll + viewport.clientWidth) return;
    viewport.scrollLeft = Math.max(0, cursorX);
    useTimelineStore.getState().setScrollLeft(viewport.scrollLeft);
  }, [currentTimeMs, isPlaying, viewportRef]);

  /** Captura a cabeça e leva o cursor ao ponto do ponteiro. */
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    seekAt(event.clientX);
  };

  /** Acompanha o ponteiro enquanto a cabeça está capturada. */
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    seekAt(event.clientX);
  };

  /** Solta a captura da cabeça. */
  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  /** Converte a coordenada da tela em instante, usando a área do cursor como referência. */
  const seekAt = (clientX: number): void => {
    const overlay = overlayRef.current;
    if (overlay === null) return;
    const rect = overlay.getBoundingClientRect();
    const { zoom: currentZoom, scrollLeft: currentScroll } = useTimelineStore.getState();
    usePlaybackStore.getState().seek(pxToMs(clientX - rect.left + currentScroll, currentZoom));
  };

  return (
    <div ref={overlayRef} className={styles.overlay} style={{ left: TRACK_HEADER_WIDTH }}>
      <div className={styles.marker} style={{ transform: `translateX(${x}px)` }}>
        <div
          className={styles.head}
          role="slider"
          aria-label={t.timeline.playhead}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        <div className={styles.line} />
      </div>
    </div>
  );
}
