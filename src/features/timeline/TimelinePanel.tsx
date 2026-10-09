// Painel da linha do tempo: barra, cabeçalhos das trilhas, régua, faixas, cursor, zoom, rolagem e soltura de mídia.
import { useEffect, useLayoutEffect, useRef, useState, type DragEvent } from 'react';
import { PanelShell } from '../layout/PanelShell';
import { t } from '@/i18n/pt-BR';
import { addAssetToNewTrack, usePlaybackStore, useProjectStore, useTimelineStore } from '@/stores';
import { pxToMs } from '../../engine/timeline/snap';
import type { Track } from '@/types';
import { ASSET_DRAG_MIME, RULER_HEIGHT, TRACK_GAP, TRACK_HEADER_WIDTH, trackIndexAtY } from './layout';
import { Playhead } from './Playhead';
import { TimeRuler } from './TimeRuler';
import { TrackHeader } from './TrackHeader';
import { TrackRow } from './TrackRow';
import { TimelineToolbar } from './TimelineToolbar';
import { useMarqueeSelection } from './useMarqueeSelection';
import { useTimelineShortcuts } from './useTimelineShortcuts';
import { contentWidthPx, wheelZoomFactor, zoomAroundPoint } from './zoomMath';
import styles from './TimelinePanel.module.css';

/** Lista vazia estável, para não criar um array novo a cada render. */
const EMPTY_TRACKS: Track[] = [];

/** Clique em área vazia: limpa a seleção e leva o cursor ao instante clicado. */
function tapEmptyArea(ms: number): void {
  useTimelineStore.getState().clearSelection();
  usePlaybackStore.getState().seek(ms);
}

/** Instante (ms) sob o ponteiro se a soltura for de mídia abaixo da última trilha; senão null. */
function assetDropMs(event: DragEvent<HTMLDivElement>, container: HTMLDivElement | null): number | null {
  if (container === null || !Array.from(event.dataTransfer.types).includes(ASSET_DRAG_MIME)) return null;
  const rect = container.getBoundingClientRect();
  const y = event.clientY - rect.top;
  const kinds = (useProjectStore.getState().project?.tracks ?? EMPTY_TRACKS).map((track) => track.kind);
  if (y < 0 || trackIndexAtY(kinds, y) !== -1) return null;
  const { zoom } = useTimelineStore.getState();
  return Math.max(0, pxToMs(event.clientX - rect.left, zoom));
}

/** Painel da linha do tempo com cabeçalhos, régua, faixas e cursor de reprodução. */
export function TimelinePanel() {
  useTimelineShortcuts();
  const hasProject = useProjectStore((state) => state.project !== null);
  const tracks = useProjectStore((state) => state.project?.tracks ?? EMPTY_TRACKS);
  const durationMs = useProjectStore((state) => state.project?.durationMs ?? 0);
  const zoom = useTimelineStore((state) => state.zoom);
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const headersRef = useRef<HTMLDivElement>(null);
  const tracksRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const pendingScrollRef = useRef<number | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const marquee = useMarqueeSelection({ containerRef: tracksRef, overlayRef: marqueeRef, onTap: tapEmptyArea });
  const contentWidth = contentWidthPx(durationMs, zoom, viewportWidth);
  const hasClips = tracks.some((track) => track.clips.length > 0);

  // Mede a área visível da rolagem.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return undefined;
    setViewportWidth(viewport.clientWidth);
    useTimelineStore.getState().setScrollLeft(viewport.scrollLeft);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => setViewportWidth(viewport.clientWidth));
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  // Roda com Ctrl/Meta dá zoom ancorado no ponteiro; com Shift rola na horizontal.
  useEffect(() => {
    const root = rootRef.current;
    const viewport = viewportRef.current;
    if (root === null || viewport === null) return undefined;
    const onWheel = (event: WheelEvent): void => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const timeline = useTimelineStore.getState();
        const oldZoom = timeline.zoom;
        timeline.zoomBy(wheelZoomFactor(event.deltaY));
        const newZoom = useTimelineStore.getState().zoom;
        if (newZoom === oldZoom) return;
        const pointerX = event.clientX - viewport.getBoundingClientRect().left;
        pendingScrollRef.current = zoomAroundPoint(oldZoom, newZoom, viewport.scrollLeft, pointerX);
      } else if (event.shiftKey) {
        event.preventDefault();
        viewport.scrollLeft += event.deltaX + event.deltaY;
      }
    };
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  }, []);

  // Aplica a rolagem calculada para manter o ponto do zoom no lugar, depois da nova largura.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const pending = pendingScrollRef.current;
    if (viewport === null || pending === null) return;
    pendingScrollRef.current = null;
    viewport.scrollLeft = pending;
    useTimelineStore.getState().setScrollLeft(viewport.scrollLeft);
  }, [zoom, contentWidth]);

  /** Sincroniza a rolagem vertical dos cabeçalhos e a horizontal da timeline com o store. */
  const handleScroll = (): void => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    if (headersRef.current !== null) headersRef.current.scrollTop = viewport.scrollTop;
    useTimelineStore.getState().setScrollLeft(viewport.scrollLeft);
  };

  /** Aceita a mídia arrastada só abaixo da última trilha. */
  const handleDragOver = (event: DragEvent<HTMLDivElement>): void => {
    if (assetDropMs(event, tracksRef.current) === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  /** Cria uma trilha nova com a mídia solta abaixo da última trilha, na posição do ponteiro. */
  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    const ms = assetDropMs(event, tracksRef.current);
    if (ms === null) return;
    event.preventDefault();
    const assetId = event.dataTransfer.getData(ASSET_DRAG_MIME);
    if (assetId === '') return;
    addAssetToNewTrack(assetId, ms);
  };

  return (
    <PanelShell title={t.panels.timeline}>
      <div ref={rootRef} className={styles.root}>
        <TimelineToolbar />
        <div className={styles.area}>
          <div className={styles.topRow}>
            <div className={styles.corner} style={{ width: TRACK_HEADER_WIDTH, height: RULER_HEIGHT }} />
            <TimeRuler />
          </div>
          <div className={styles.lower}>
            <div ref={headersRef} className={styles.headers} style={{ width: TRACK_HEADER_WIDTH }}>
              <div className={styles.headersInner} style={{ gap: TRACK_GAP }}>
                {tracks.map((track) => (
                  <TrackHeader key={track.id} track={track} />
                ))}
              </div>
            </div>
            <div ref={viewportRef} className={styles.viewport} onScroll={handleScroll}>
              <div className={styles.content} style={{ width: contentWidth }}>
                <div
                  ref={tracksRef}
                  data-timeline-tracks=""
                  className={styles.tracks}
                  style={{ gap: TRACK_GAP }}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onPointerDown={marquee.onPointerDown}
                  onPointerMove={marquee.onPointerMove}
                  onPointerUp={marquee.onPointerUp}
                  onPointerCancel={marquee.onPointerCancel}
                >
                  {tracks.map((track, index) => (
                    <TrackRow key={track.id} track={track} trackIndex={index} zoom={zoom} />
                  ))}
                  <div ref={marqueeRef} className={styles.marquee} />
                </div>
              </div>
            </div>
            {!hasProject || !hasClips ? <p className={styles.empty}>{t.timeline.empty}</p> : null}
          </div>
          <Playhead viewportRef={viewportRef} />
        </div>
      </div>
    </PanelShell>
  );
}
