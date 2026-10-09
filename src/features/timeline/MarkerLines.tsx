// Linhas amarelas finas nas posições dos marcadores da linha do tempo, só para os que estão na área visível.
import { useEffect, useRef, useState } from 'react';
import { msToPx } from '@/engine/timeline/snap';
import { useProjectStore } from '@/stores/projectStore';
import { useTimelineStore } from '@/stores/timelineStore';
import styles from './MarkerLines.module.css';

/** Lista vazia estável, para não criar um array novo a cada render. */
const EMPTY_MARKERS: number[] = [];
/** Folga além das bordas visíveis, em px, para a linha não sumir na beirada. */
const OVERSCAN_PX = 16;

/** Camada de linhas dos marcadores, posicionada dentro do conteúdo rolável da timeline. */
export function MarkerLines() {
  const markers = useProjectStore((state) => state.project?.markers ?? EMPTY_MARKERS);
  const zoom = useTimelineStore((state) => state.zoom);
  const scrollLeft = useTimelineStore((state) => state.scrollLeft);
  const rootRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);

  // Mede a largura visível: a camada fica em conteúdo > viewport de rolagem.
  useEffect(() => {
    const scroller = rootRef.current?.parentElement?.parentElement;
    if (scroller === null || scroller === undefined || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => setViewportWidth(scroller.clientWidth));
    observer.observe(scroller);
    setViewportWidth(scroller.clientWidth);
    return () => observer.disconnect();
  }, []);

  const fromPx = scrollLeft - OVERSCAN_PX;
  const toPx = scrollLeft + viewportWidth + OVERSCAN_PX;
  const visible = markers
    .map((ms) => ({ ms, left: msToPx(ms, zoom) }))
    .filter(({ left }) => left >= fromPx && left <= toPx);

  return (
    <div ref={rootRef} className={styles.layer} aria-hidden="true">
      {visible.map(({ ms, left }) => (
        <div key={ms} className={styles.line} style={{ left }} />
      ))}
    </div>
  );
}
