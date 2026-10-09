// Régua de tempo em canvas: desenha só a janela visível e permite arrastar para fazer scrub do cursor.
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { computeTicks } from '../../engine/timeline/ruler';
import { msToPx, pxToMs } from '../../engine/timeline/snap';
import { t } from '@/i18n/pt-BR';
import { removeMarker } from '@/stores/beatCommands';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useProjectStore } from '@/stores/projectStore';
import { useTimelineStore } from '@/stores/timelineStore';
import { RULER_HEIGHT } from './layout';
import styles from './TimeRuler.module.css';

/** Tamanho do traço maior, em px. */
const MAJOR_TICK_PX = 10;
/** Tamanho do traço menor, em px. */
const MINOR_TICK_PX = 4;
/** Cor dos triângulos dos marcadores de batida. */
const MARKER_COLOR = '#facc15';
/** Largura do triângulo de cada marcador, em px. */
const MARKER_WIDTH_PX = 9;
/** Altura do triângulo de cada marcador, em px. */
const MARKER_HEIGHT_PX = 7;
/** Distância horizontal máxima do clique até o marcador para contar como acerto, em px. */
const MARKER_HIT_PX = 6;
/** Lista vazia estável, para não criar um array novo a cada render. */
const EMPTY_MARKERS: number[] = [];

/** Lê uma variável CSS do elemento, com valor de reserva se vazia. */
function readToken(element: Element, name: string, fallback: string): string {
  const value = getComputedStyle(element).getPropertyValue(name).trim();
  return value === '' ? fallback : value;
}

/** Desenha um triângulo amarelo no topo da régua para cada marcador visível na janela. */
function drawMarkers(ctx: CanvasRenderingContext2D, widthPx: number, markers: number[]): void {
  const { zoom, scrollLeft } = useTimelineStore.getState();
  const half = MARKER_WIDTH_PX / 2;
  ctx.fillStyle = MARKER_COLOR;
  for (const ms of markers) {
    const x = msToPx(ms, zoom) - scrollLeft;
    if (x < -half || x > widthPx + half) continue;
    ctx.beginPath();
    ctx.moveTo(x - half, 0);
    ctx.lineTo(x + half, 0);
    ctx.lineTo(x, MARKER_HEIGHT_PX);
    ctx.closePath();
    ctx.fill();
  }
}

/** Marcador cujo triângulo está sob o ponto dado da régua (coordenadas relativas à régua), ou null. */
function markerAt(localX: number, localY: number): number | null {
  if (localY > MARKER_HEIGHT_PX + 3) return null;
  const { zoom, scrollLeft } = useTimelineStore.getState();
  const markers = useProjectStore.getState().project?.markers ?? EMPTY_MARKERS;
  let best: number | null = null;
  let bestDistance = MARKER_HIT_PX;
  for (const ms of markers) {
    const distance = Math.abs(msToPx(ms, zoom) - scrollLeft - localX);
    if (distance < bestDistance) {
      best = ms;
      bestDistance = distance;
    }
  }
  return best;
}

/** Desenha a régua visível no canvas dado, com os marcadores; sem contexto 2D (ex.: jsdom), não faz nada. */
function drawRuler(canvas: HTMLCanvasElement, widthPx: number, markers: number[]): void {
  const ctx = canvas.getContext('2d');
  if (ctx === null) return;
  const { zoom, scrollLeft } = useTimelineStore.getState();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(widthPx * dpr));
  canvas.height = Math.max(1, Math.round(RULER_HEIGHT * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const panelColor = readToken(canvas, '--bg-panel', '#18181c');
  const borderColor = readToken(canvas, '--border', '#2a2a31');
  const mutedColor = readToken(canvas, '--text-muted', '#a8a8b3');
  const faintColor = readToken(canvas, '--text-faint', '#9a9aa5');
  const font = readToken(canvas, '--font-ui', 'sans-serif');

  ctx.fillStyle = panelColor;
  ctx.fillRect(0, 0, widthPx, RULER_HEIGHT);
  ctx.fillStyle = borderColor;
  ctx.fillRect(0, RULER_HEIGHT - 1, widthPx, 1);

  const startMs = pxToMs(scrollLeft, zoom);
  const endMs = pxToMs(scrollLeft + widthPx, zoom);
  const ticks = computeTicks(startMs, endMs, zoom);
  ctx.font = `10px ${font}`;
  ctx.textBaseline = 'top';
  for (const tick of ticks) {
    const x = Math.round(msToPx(tick.ms, zoom) - scrollLeft) + 0.5;
    const length = tick.major ? MAJOR_TICK_PX : MINOR_TICK_PX;
    ctx.fillStyle = tick.major ? mutedColor : faintColor;
    ctx.fillRect(x, RULER_HEIGHT - 1 - length, 1, length);
    if (tick.major && tick.label !== null) {
      ctx.fillText(tick.label, x + 4, 4);
    }
  }
  drawMarkers(ctx, widthPx, markers);
}

/** Posiciona o cursor de reprodução a partir de uma coordenada de tela sobre a régua. */
function seekFromClientX(element: HTMLElement, clientX: number): void {
  const rect = element.getBoundingClientRect();
  const { zoom, scrollLeft } = useTimelineStore.getState();
  usePlaybackStore.getState().seek(pxToMs(clientX - rect.left + scrollLeft, zoom));
}

/** Régua de tempo: canvas com traços e rótulos da janela visível; arrastar faz scrub. */
export function TimeRuler() {
  const zoom = useTimelineStore((state) => state.zoom);
  const scrollLeft = useTimelineStore((state) => state.scrollLeft);
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [widthPx, setWidthPx] = useState(0);
  const [themeVersion, setThemeVersion] = useState(0);
  const markers = useProjectStore((state) => state.project?.markers ?? EMPTY_MARKERS);

  // Mede a largura disponível da régua.
  useEffect(() => {
    const root = rootRef.current;
    if (root === null || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => setWidthPx(root.clientWidth));
    observer.observe(root);
    setWidthPx(root.clientWidth);
    return () => observer.disconnect();
  }, []);

  // Redesenha quando o tema muda, pois as cores vêm das variáveis CSS.
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeVersion((version) => version + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  // Redesenha a janela visível em mudança de zoom, rolagem, tamanho, tema ou marcadores.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || widthPx <= 0) return;
    drawRuler(canvas, widthPx, markers);
  }, [zoom, scrollLeft, widthPx, themeVersion, markers]);

  /** Clique no triângulo de um marcador leva o cursor a ele; clique-direito ou Alt+clique remove o marcador. Fora dos triângulos, faz scrub. */
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const root = rootRef.current;
    if (root === null) return;
    const rect = root.getBoundingClientRect();
    const hit = markerAt(event.clientX - rect.left, event.clientY - rect.top);
    if (hit !== null) {
      event.preventDefault();
      if (event.button === 2 || event.altKey) {
        removeMarker(hit);
      } else if (event.button === 0) {
        usePlaybackStore.getState().seek(hit);
      }
      return;
    }
    if (event.button !== 0) return;
    root.setPointerCapture(event.pointerId);
    seekFromClientX(root, event.clientX);
  };

  /** Impede o menu de contexto sobre um marcador, pois o clique-direito o remove. */
  const handleContextMenu = (event: ReactMouseEvent<HTMLDivElement>): void => {
    const root = rootRef.current;
    if (root === null) return;
    const rect = root.getBoundingClientRect();
    if (markerAt(event.clientX - rect.left, event.clientY - rect.top) !== null) event.preventDefault();
  };

  /** Durante o scrub, acompanha o ponteiro. */
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (rootRef.current === null || !rootRef.current.hasPointerCapture(event.pointerId)) return;
    seekFromClientX(rootRef.current, event.clientX);
  };

  /** Encerra o scrub. */
  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (rootRef.current?.hasPointerCapture(event.pointerId)) {
      rootRef.current.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      ref={rootRef}
      className={styles.ruler}
      style={{ height: RULER_HEIGHT }}
      role="slider"
      aria-label={t.timeline.ruler}
      aria-valuemin={0}
      onPointerDown={handlePointerDown}
      onContextMenu={handleContextMenu}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
    </div>
  );
}
