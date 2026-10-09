// Editor de curva de velocidade: gráfico SVG com pontos arrastáveis, duplo clique para adicionar/remover e setas no teclado.
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { t } from '@/i18n/pt-BR';
import { setSpeedCurve } from '@/stores/speedCommands';
import type { SpeedCurvePoint } from '@/types';
import {
  CHART_HEIGHT,
  CHART_MAX_SPEED,
  CHART_MIN_SPEED,
  CHART_PAD,
  CHART_WIDTH,
  insertPoint,
  movePoint,
  nudgeSpeed,
  nudgeT,
  removePoint,
  sortCurve,
  speedToY,
  tToX,
  xToT,
  yToSpeed,
} from './speedCurveMath';
import styles from './SpeedCurveEditor.module.css';

/** Propriedades de SpeedCurveEditor. */
export interface SpeedCurveEditorProps {
  /** Clipe cuja curva de velocidade é editada. */
  clipId: string;
  /** Pontos atuais da curva. */
  curve: SpeedCurvePoint[];
}

/** Arraste em andamento: pontos provisórios, posição do ponto movido e se ele saiu do lugar. */
interface DragState {
  points: SpeedCurvePoint[];
  index: number;
  moved: boolean;
}

/** Passo das setas horizontais (fração do clipe) e com Shift. */
const T_STEP = 0.01;
const T_STEP_FAST = 0.1;

/** Converte a posição do ponteiro em instante e velocidade do gráfico, considerando a escala do SVG na tela. */
function pointerToChart(svg: SVGSVGElement, clientX: number, clientY: number): { t: number; speed: number } {
  const rect = svg.getBoundingClientRect();
  const scaleX = rect.width > 0 ? CHART_WIDTH / rect.width : 1;
  const scaleY = rect.height > 0 ? CHART_HEIGHT / rect.height : 1;
  return {
    t: xToT((clientX - rect.left) * scaleX),
    speed: yToSpeed((clientY - rect.top) * scaleY),
  };
}

/** Gráfico da curva de velocidade: linha, pontos e guia em 1x; altera a curva só ao soltar ou em cada passo do teclado. */
export function SpeedCurveEditor({ clipId, curve }: SpeedCurveEditorProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointRefs = useRef<(SVGCircleElement | null)[]>([]);
  const points = drag?.points ?? sortCurve(curve);

  /** Foca o ponto selecionado depois de uma mudança, para o teclado continuar nele. */
  useEffect(() => {
    if (focusIndex !== null) pointRefs.current[focusIndex]?.focus();
  }, [focusIndex, points.length]);

  /** Grava a curva na store, como um passo de histórico. */
  const commit = (next: SpeedCurvePoint[]): void => {
    setSpeedCurve(clipId, next);
  };

  /** Começa o arraste do ponto e captura o ponteiro para receber os movimentos. */
  const handlePointDown = (index: number) => (event: PointerEvent<SVGCircleElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setFocusIndex(index);
    setDrag({ points, index, moved: false });
  };

  /** Move o ponto arrastado para a posição do ponteiro. */
  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (drag === null || svgRef.current === null) return;
    const target = pointerToChart(svgRef.current, event.clientX, event.clientY);
    const moved = movePoint(drag.points, drag.index, target.t, target.speed);
    setDrag({ points: moved.curve, index: moved.index, moved: true });
    setFocusIndex(moved.index);
  };

  /** Solta o ponto: grava a curva se ela mudou; cancelar o ponteiro descarta o arraste. */
  const finishDrag = (save: boolean) => {
    if (drag !== null && save && drag.moved) commit(drag.points);
    setDrag(null);
  };

  /** Duplo clique no fundo do gráfico adiciona um ponto naquele instante e velocidade. */
  const handleDoubleClickBackground = (event: MouseEvent<SVGSVGElement>) => {
    if (svgRef.current === null) return;
    const target = pointerToChart(svgRef.current, event.clientX, event.clientY);
    const inserted = insertPoint(points, target.t, target.speed);
    commit(inserted.curve);
    setFocusIndex(inserted.index);
  };

  /** Duplo clique num ponto remove o ponto (a curva mantém pelo menos dois). */
  const handleDoubleClickPoint = (index: number) => (event: MouseEvent<SVGCircleElement>) => {
    event.stopPropagation();
    const next = removePoint(points, index);
    if (next.length === points.length) return;
    commit(next);
    setFocusIndex(null);
  };

  /** Setas movem o ponto focado (Shift acelera o passo); Delete ou Backspace remove. */
  const handlePointKeyDown = (index: number) => (event: KeyboardEvent<SVGCircleElement>) => {
    const point = points[index];
    if (point === undefined) return;
    const fast = event.shiftKey;
    const step = fast ? T_STEP_FAST : T_STEP;
    let moved: { t: number; speed: number } | null = null;
    if (event.key === 'ArrowLeft') moved = { t: nudgeT(point.t, -step), speed: point.speed };
    if (event.key === 'ArrowRight') moved = { t: nudgeT(point.t, step), speed: point.speed };
    if (event.key === 'ArrowUp') moved = { t: point.t, speed: nudgeSpeed(point.speed, 1) };
    if (event.key === 'ArrowDown') moved = { t: point.t, speed: nudgeSpeed(point.speed, -1) };
    if (moved !== null) {
      event.preventDefault();
      const next = movePoint(points, index, moved.t, moved.speed);
      commit(next.curve);
      setFocusIndex(next.index);
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      const next = removePoint(points, index);
      if (next.length === points.length) return;
      commit(next);
      setFocusIndex(null);
    }
  };

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${tToX(p.t).toFixed(2)} ${speedToY(p.speed).toFixed(2)}`)
    .join(' ');

  return (
    <div className={styles.wrap}>
      <svg
        ref={svgRef}
        className={styles.svg}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-label={t.speed.curve}
        onPointerMove={handlePointerMove}
        onPointerUp={() => finishDrag(true)}
        onPointerCancel={() => finishDrag(false)}
        onDoubleClick={handleDoubleClickBackground}
      >
        <line className={styles.guide} x1={CHART_PAD} x2={CHART_WIDTH - CHART_PAD} y1={speedToY(1)} y2={speedToY(1)} />
        <text className={styles.axis} x={CHART_PAD} y={speedToY(CHART_MAX_SPEED) - 2}>
          {`${CHART_MAX_SPEED}${t.inspector.unitSpeed}`}
        </text>
        <text className={styles.axis} x={CHART_PAD} y={speedToY(CHART_MIN_SPEED) - 2}>
          {`${CHART_MIN_SPEED}${t.inspector.unitSpeed}`}
        </text>
        <path className={styles.curve} d={linePath} />
        {points.map((p, i) => (
          <circle
            key={i}
            ref={(el) => {
              pointRefs.current[i] = el;
            }}
            className={styles.point}
            cx={tToX(p.t)}
            cy={speedToY(p.speed)}
            r={6}
            tabIndex={0}
            role="slider"
            aria-label={t.inspector.curvePoint}
            aria-valuetext={`${p.speed.toFixed(2)}${t.inspector.unitSpeed}`}
            onPointerDown={handlePointDown(i)}
            onDoubleClick={handleDoubleClickPoint(i)}
            onKeyDown={handlePointKeyDown(i)}
          />
        ))}
      </svg>
      <p className={styles.hint}>{t.speed.curveHint}</p>
    </div>
  );
}
