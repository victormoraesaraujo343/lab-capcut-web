import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import styles from './ResizeHandle.module.css';

export interface ResizeHandleProps {
  /** 'vertical' = linha vertical entre colunas (arrasta em X); 'horizontal' = entre linhas (arrasta em Y). */
  orientation: 'vertical' | 'horizontal';
  /** Recebe o deslocamento em pixels desde o último aviso. Positivo = para a direita/baixo. */
  onResize: (deltaPx: number) => void;
  /** Nome acessível do separador. */
  label: string;
}

const STEP_PX = 10;
const STEP_PX_LARGE = 50;

/** Separador arrastável entre painéis, com suporte a teclado. */
export function ResizeHandle({ orientation, onResize, label }: ResizeHandleProps) {
  const isVertical = orientation === 'vertical';
  const lastPosRef = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    lastPosRef.current = isVertical ? e.clientX : e.clientY;
    setDragging(true);
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (lastPosRef.current === null) return;
    const pos = isVertical ? e.clientX : e.clientY;
    const delta = pos - lastPosRef.current;
    if (delta === 0) return;
    lastPosRef.current = pos;
    onResize(delta);
  }

  function endDrag(e: PointerEvent<HTMLDivElement>) {
    if (lastPosRef.current === null) return;
    lastPosRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDragging(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? STEP_PX_LARGE : STEP_PX;
    const backKey = isVertical ? 'ArrowLeft' : 'ArrowUp';
    const forwardKey = isVertical ? 'ArrowRight' : 'ArrowDown';
    if (e.key === backKey) {
      e.preventDefault();
      onResize(-step);
    } else if (e.key === forwardKey) {
      e.preventDefault();
      onResize(step);
    }
  }

  const className = [
    styles.handle,
    isVertical ? styles.vertical : styles.horizontal,
    dragging ? styles.active : '',
  ].join(' ');

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      tabIndex={0}
      className={className}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onKeyDown={handleKeyDown}
    />
  );
}
