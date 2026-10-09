// Losangos dos keyframes no rodapé do clipe: clique leva o cursor ao instante, arrastar move os keyframes daquele instante.
import { useState, type PointerEvent } from 'react';
import { moveKeyframeCmd } from '@/stores/keyframeCommands';
import { usePlaybackStore } from '@/stores/playbackStore';
import { msToPx, pxToMs } from '@/engine/timeline/snap';
import { clamp } from '@/utils/clamp';
import type { Clip } from '@/types';
import styles from './ClipKeyframes.module.css';

/** Tolerância, em ms, para tratar dois keyframes como o mesmo instante. */
const SAME_INSTANT_MS = 1;
/** Deslocamento mínimo, em px, para o gesto virar arraste em vez de clique. */
const DRAG_THRESHOLD_PX = 3;

/** Instantes locais do clipe (ms) com keyframe em alguma propriedade, em ordem e sem repetição. */
function keyframeInstants(clip: Clip): number[] {
  const times = Object.values(clip.keyframes)
    .flatMap((list) => list.map((k) => k.timeMs))
    .sort((a, b) => a - b);
  const unique: number[] = [];
  for (const time of times) {
    const last = unique[unique.length - 1];
    if (last === undefined || time - last > SAME_INSTANT_MS) unique.push(time);
  }
  return unique;
}

/** Gesto em curso sobre um losango: instante de origem e deslocamento horizontal do ponteiro. */
interface DragState {
  /** Instante local de origem, em ms. */
  fromMs: number;
  /** Posição X inicial do ponteiro, em px. */
  startX: number;
  /** Deslocamento atual do ponteiro, em px. */
  dx: number;
}

/** Propriedades de ClipKeyframes. */
export interface ClipKeyframesProps {
  /** Clipe cujos keyframes aparecem no rodapé. */
  clip: Clip;
  /** Zoom em pixels por segundo. */
  zoom: number;
  /** Trilha travada: mostra os losangos, mas não aceita arraste. */
  locked: boolean;
}

/** Faixa de losangos de keyframe sobre o clipe; um losango por instante com keyframe em qualquer propriedade. */
export function ClipKeyframes({ clip, zoom, locked }: ClipKeyframesProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const instants = keyframeInstants(clip);
  if (instants.length === 0) return null;

  /** Início do gesto: captura o ponteiro e guarda a origem, sem deixar o clique chegar ao clipe. */
  const handleDown = (event: PointerEvent<HTMLSpanElement>, fromMs: number): void => {
    event.stopPropagation();
    if (event.button !== 0 || locked) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ fromMs, startX: event.clientX, dx: 0 });
  };

  /** Acompanha o ponteiro enquanto arrasta. */
  const handleMove = (event: PointerEvent<HTMLSpanElement>): void => {
    if (drag === null) return;
    setDrag({ ...drag, dx: event.clientX - drag.startX });
  };

  /** Ao soltar: sem deslocamento vira seek; com deslocamento move os keyframes daquele instante. */
  const handleUp = (event: PointerEvent<HTMLSpanElement>): void => {
    if (drag === null) return;
    const dx = event.clientX - drag.startX;
    setDrag(null);
    if (Math.abs(dx) < DRAG_THRESHOLD_PX) {
      usePlaybackStore.getState().seek(clip.startMs + drag.fromMs);
      return;
    }
    const toMs = clamp(drag.fromMs + pxToMs(dx, zoom), 0, clip.durationMs);
    if (Math.abs(toMs - drag.fromMs) <= SAME_INSTANT_MS) return;
    for (const [property, list] of Object.entries(clip.keyframes)) {
      for (const kf of list) {
        if (Math.abs(kf.timeMs - drag.fromMs) <= SAME_INSTANT_MS) {
          moveKeyframeCmd(clip.id, property, kf.timeMs, toMs);
        }
      }
    }
  };

  return (
    <div className={styles.track}>
      {instants.map((ms) => {
        const current = drag !== null && drag.fromMs === ms ? drag : null;
        const moving = current !== null;
        const shiftedMs = current !== null ? clamp(ms + pxToMs(current.dx, zoom), 0, clip.durationMs) : ms;
        return (
          <span
            key={ms}
            aria-hidden="true"
            className={`${styles.diamond} ${moving ? styles.moving : ''} ${locked ? styles.readOnly : ''}`}
            style={{ left: msToPx(shiftedMs, zoom) }}
            onPointerDown={(event) => handleDown(event, ms)}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerCancel={() => setDrag(null)}
          />
        );
      })}
    </div>
  );
}
