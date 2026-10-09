// Caixa de manipulação do clipe selecionado sobre a prévia: mover, redimensionar, girar e escolher camada.
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react';
import { RotateCw } from 'lucide-react';
import { t } from '@/i18n/pt-BR';
import { resolveLayers } from '@/engine/render/composition';
import { applyPreviewOverride, usePreviewOverrideStore } from '@/stores/previewOverrideStore';
import { useProjectStore } from '@/stores/projectStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useTimelineStore } from '@/stores/timelineStore';
import { selectClip, setClipTransform } from '@/stores/timelineCommands';
import type { Layer, Project, Transform } from '@/types';
import {
  centerOfQuad,
  cornerCursor,
  hitTestLayers,
  isClipLocked,
  moveTransform,
  pickSelectedLayer,
  pointInQuad,
  projectQuad,
  rotateAround,
  rotateHandlePos,
  scaleFromCorner,
  scaleQuad,
  screenToProject,
  snapToCenter,
  type Point,
} from './transformGestures';
import { measureLayers } from './measuredLayers';
import { InlineTextEditor } from './InlineTextEditor';
import { useTextEditGesture } from './useTextEditGesture';
import styles from './TransformOverlay.module.css';

/** Tipo de gesto em andamento. */
type GestureMode = 'move' | 'scale' | 'rotate';

/** Gesto ativo: o que é manipulado e o último valor calculado. */
interface Gesture {
  /** Modo do gesto. */
  mode: GestureMode;
  /** Clipe manipulado. */
  clipId: string;
  /** Ponteiro que iniciou o gesto. */
  pointerId: number;
  /** Transformação no início do gesto. */
  start: Transform;
  /** Centro do quadrilátero no início (px do projeto). */
  center: Point;
  /** Ponto onde o gesto começou (px do projeto). */
  startPointer: Point;
  /** Último valor calculado, gravado ao soltar. */
  last: Transform;
}

/** Guias de centro ativas durante o movimento. */
interface Guides {
  /** Guia vertical (centro horizontal) visível. */
  x: boolean;
  /** Guia horizontal (centro vertical) visível. */
  y: boolean;
}

/** Sem guias visíveis. */
const NO_GUIDES: Guides = { x: false, y: false };
/** Distância de encaixe ao centro, em px da tela. */
const SNAP_SCREEN_PX = 6;
/** Tamanho das alças de canto, em px da tela. */
const HANDLE_SIZE = 10;
/** Tamanho da alça de giro, em px da tela. */
const ROTATE_SIZE = 28;
/** Distância da alça de giro acima da borda de cima, em px da tela. */
const ROTATE_OFFSET = 28;
/** Passo do giro com Shift, em graus. */
const ROTATE_SNAP_DEG = 15;
/** Deslocamento de cada tecla de seta, em px do projeto. */
const ARROW_STEPS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** Ponto do ponteiro em px do projeto, relativo à prévia. */
function stagePoint(stage: HTMLDivElement | null, e: { clientX: number; clientY: number }, scale: number): Point {
  const rect = stage?.getBoundingClientRect();
  return screenToProject(e.clientX - (rect?.left ?? 0), e.clientY - (rect?.top ?? 0), scale);
}

/** Transformação nova do gesto para o ponteiro atual, com as guias de centro quando for mover. */
function gestureStep(g: Gesture, p: Point, shift: boolean, thresholdPx: number): { transform: Transform; guides: Guides } {
  if (g.mode === 'scale') {
    return { transform: scaleFromCorner(g.start, g.center, g.startPointer, p, !shift), guides: NO_GUIDES };
  }
  if (g.mode === 'rotate') {
    const snap = shift ? ROTATE_SNAP_DEG : null;
    return { transform: rotateAround(g.start, g.center, g.startPointer, p, snap), guides: NO_GUIDES };
  }
  const moved = moveTransform(g.start, p[0] - g.startPointer[0], p[1] - g.startPointer[1]);
  const snapped = snapToCenter(moved, thresholdPx);
  return { transform: snapped.transform, guides: { x: snapped.snappedX, y: snapped.snappedY } };
}

/** Caixa de manipulação do clipe selecionado; ocupa todo o wrapper da prévia (que tem o tamanho exibido do canvas). */
export function TransformOverlay(): ReactElement {
  const project = useProjectStore((s) => s.project);
  const selectedIds = useTimelineStore((s) => s.selectedClipIds);
  const currentTimeMs = usePlaybackStore((s) => s.currentTimeMs);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const overrideClipId = usePreviewOverrideStore((s) => s.clipId);
  const overrideTransform = usePreviewOverrideStore((s) => s.transform);
  const setOverride = usePreviewOverrideStore((s) => s.setOverride);
  const clearOverride = usePreviewOverrideStore((s) => s.clearOverride);
  const stageRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const [stageWidth, setStageWidth] = useState(0);
  const [guides, setGuides] = useState<Guides>(NO_GUIDES);

  // Escala de exibição: largura mostrada da prévia dividida pela largura do projeto.
  const scale = project !== null && project.width > 0 ? stageWidth / project.width : 0;

  // Camadas do instante já com o ajuste provisório do arrasto e com o tamanho do texto medido, para a caixa e o hit-test.
  const layers = useMemo(
    () =>
      project === null
        ? []
        : measureLayers(
            resolveLayers(applyPreviewOverride(project, overrideClipId, overrideTransform), currentTimeMs),
          ),
    [project, overrideClipId, overrideTransform, currentTimeMs],
  );
  const { editingClipId, closeEditor, onDoubleClick } = useTextEditGesture({
    project,
    layers,
    scale,
    isPlaying,
    stageRef,
    pointOf: stagePoint,
  });
  const layer = pickSelectedLayer(layers, selectedIds);
  const quadProject = project !== null && layer !== undefined ? projectQuad(layer, project) : null;
  const locked = project !== null && layer !== undefined && isClipLocked(project, layer.clipId);
  const screen = quadProject !== null && scale > 0 ? scaleQuad(quadProject, scale) : null;
  const editing = editingClipId !== null;
  const showHandles = screen !== null && !locked && !isPlaying && !editing;

  // Acompanha a largura exibida do próprio elemento.
  useEffect(() => {
    const el = stageRef.current;
    if (el === null || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => setStageWidth(el.clientWidth));
    observer.observe(el);
    setStageWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  /** Dá foco à prévia para receber as teclas de seta e Esc. */
  const focusStage = (): void => {
    stageRef.current?.focus({ preventScroll: true });
  };

  /** Começa um gesto de mover, redimensionar ou girar sobre a camada. */
  const beginGesture = (mode: GestureMode, target: Layer, pointer: Point, pointerId: number, proj: Project): void => {
    focusStage();
    const q = projectQuad(target, proj);
    gestureRef.current = {
      mode,
      clipId: target.clipId,
      pointerId,
      start: target.transform,
      center: q === null ? pointer : centerOfQuad(q),
      startPointer: pointer,
      last: target.transform,
    };
    stageRef.current?.setPointerCapture(pointerId);
  };

  /** Encerra o gesto: grava um passo no histórico se confirmado; em todo caso limpa o ajuste provisório. */
  const endGesture = (commit: boolean): void => {
    const g = gestureRef.current;
    if (g === null) return;
    gestureRef.current = null;
    const stage = stageRef.current;
    if (stage?.hasPointerCapture(g.pointerId)) stage.releasePointerCapture(g.pointerId);
    setGuides(NO_GUIDES);
    if (commit) setClipTransform(g.clipId, g.last, 'transform');
    clearOverride();
  };

  /** Clique na prévia: arrasta a caixa selecionada, ou seleciona a camada clicada e a arrasta no mesmo gesto. */
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0 || project === null || scale <= 0 || isPlaying) return;
    const p = stagePoint(stageRef.current, e, scale);
    focusStage();
    if (layer !== undefined && quadProject !== null && !locked && pointInQuad(quadProject, p)) {
      beginGesture('move', layer, p, e.pointerId, project);
      return;
    }
    const hitId = hitTestLayers(layers, project.width, project.height, p);
    if (hitId === null) return;
    selectClip(hitId, false);
    const hit = layers.find((l) => l.clipId === hitId);
    if (hit !== undefined && !isClipLocked(project, hitId)) beginGesture('move', hit, p, e.pointerId, project);
  };

  /** Movimento durante um gesto: calcula a nova transformação e a mostra como ajuste provisório. */
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const g = gestureRef.current;
    if (g === null || project === null || scale <= 0) return;
    const p = stagePoint(stageRef.current, e, scale);
    const step = gestureStep(g, p, e.shiftKey, SNAP_SCREEN_PX / scale);
    g.last = step.transform;
    setOverride(g.clipId, step.transform);
    setGuides((prev) => (prev.x === step.guides.x && prev.y === step.guides.y ? prev : step.guides));
  };

  /** Início de um gesto numa alça de canto (redimensionar) ou de giro. */
  const startHandle = (e: ReactPointerEvent<HTMLDivElement>, mode: GestureMode): void => {
    e.stopPropagation();
    if (e.button !== 0 || project === null || layer === undefined || scale <= 0 || locked || isPlaying) return;
    beginGesture(mode, layer, stagePoint(stageRef.current, e, scale), e.pointerId, project);
  };

  /** Teclas quando a prévia tem foco: Esc cancela o gesto; setas movem 1 px (10 px com Shift) e gravam. */
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      if (gestureRef.current === null) return;
      e.preventDefault();
      endGesture(false);
      return;
    }
    const step = ARROW_STEPS[e.key];
    if (step === undefined || layer === undefined || locked || isPlaying) return;
    e.preventDefault();
    e.stopPropagation();
    const amount = e.shiftKey ? 10 : 1;
    setClipTransform(layer.clipId, moveTransform(layer.transform, step[0] * amount, step[1] * amount));
  };

  const corners: Point[] = screen ?? [];
  const rotatePos = screen === null ? null : rotateHandlePos(screen, ROTATE_OFFSET);
  const topMid: Point | null = screen === null ? null : [(screen[0][0] + screen[1][0]) / 2, (screen[0][1] + screen[1][1]) / 2];

  return (
    <>
    <div
      ref={stageRef}
      className={styles.overlay}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => endGesture(true)}
      onPointerCancel={() => endGesture(false)}
      onKeyDown={onKeyDown}
      onDoubleClick={onDoubleClick}
    >
      {guides.x && <div className={styles.guideVertical} />}
      {guides.y && <div className={styles.guideHorizontal} />}
      {screen !== null && !editing && (
        <svg className={styles.svg} aria-hidden="true">
          <polygon
            className={locked ? styles.outlineLocked : styles.outline}
            points={screen.map(([x, y]) => `${x},${y}`).join(' ')}
          />
          {showHandles && topMid !== null && rotatePos !== null && (
            <line className={styles.connector} x1={topMid[0]} y1={topMid[1]} x2={rotatePos[0]} y2={rotatePos[1]} />
          )}
        </svg>
      )}
      {showHandles &&
        layer !== undefined &&
        corners.map((p, i) => (
          <div
            key={`corner-${i}`}
            role="button"
            aria-label={t.preview.resize}
            className={styles.handle}
            style={{
              left: p[0] - HANDLE_SIZE / 2,
              top: p[1] - HANDLE_SIZE / 2,
              cursor: cornerCursor(i, layer.transform.rotation),
            }}
            onPointerDown={(e) => startHandle(e, 'scale')}
          />
        ))}
      {showHandles && rotatePos !== null && (
        <div
          role="button"
          aria-label={t.preview.rotate}
          className={styles.rotate}
          style={{ left: rotatePos[0] - ROTATE_SIZE / 2, top: rotatePos[1] - ROTATE_SIZE / 2 }}
          onPointerDown={(e) => startHandle(e, 'rotate')}
        >
          <RotateCw size={14} aria-hidden="true" />
        </div>
      )}
    </div>
    {editingClipId !== null && <InlineTextEditor clipId={editingClipId} onClose={closeEditor} />}
    </>
  );
}
