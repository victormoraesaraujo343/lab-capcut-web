// Marcador de transição no corte entre dois clipes: bloco com a janela da transição, alvo pontilhado para soltar e × para remover.
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeftRight, X } from 'lucide-react';
import { t } from '@/i18n/pt-BR';
import { removeTransition } from '@/stores/transitionCommands';
import { selectClip } from '@/stores/timelineCommands';
import styles from './TransitionMarker.module.css';

/** Largura do alvo pontilhado de soltura no corte, em px. */
const TARGET_WIDTH_PX = 12;

/** Modo do marcador: transição já posta no corte, alvo de soltura, ou alvo destacado sob o ponteiro. */
export type TransitionMarkerVariant = 'set' | 'target' | 'hover';

/** Propriedades de um marcador de transição no corte. */
export interface TransitionMarkerProps {
  /** Clipe que sai no corte (guarda a transição de saída). */
  clipId: string;
  /** Posição do corte, em px relativos à faixa. */
  centerPx: number;
  /** Largura da janela da transição, em px (só usada no modo 'set'). */
  widthPx: number;
  /** Modo do marcador. */
  variant: TransitionMarkerVariant;
  /** Tipo da transição posta (só no modo 'set'). */
  transitionType?: string;
  /** Clipe que sai está selecionado. */
  selected: boolean;
}

/** Nome exibido de um tipo de transição, ou o próprio tipo se não houver nome traduzido. */
function nameOf(type: string): string {
  const names: Record<string, string | undefined> = t.transitions.names;
  return names[type] ?? type;
}

/** Marcador no corte: no modo 'set' mostra o bloco da transição (clique seleciona o clipe que sai; × remove); nos outros modos é só o alvo de soltura. */
export function TransitionMarker({
  clipId,
  centerPx,
  widthPx,
  variant,
  transitionType = '',
  selected,
}: TransitionMarkerProps) {
  if (variant !== 'set') {
    const targetClass = variant === 'hover' ? `${styles.target} ${styles.targetHover}` : styles.target;
    return (
      <div
        className={targetClass}
        style={{ left: centerPx - TARGET_WIDTH_PX / 2, width: TARGET_WIDTH_PX }}
        aria-hidden="true"
      />
    );
  }

  const label = nameOf(transitionType);
  const className = selected ? `${styles.set} ${styles.selected}` : styles.set;

  /** Impede que o toque no bloco comece um arrasto ou seleção de área na faixa. */
  function stopPointer(event: ReactPointerEvent<HTMLElement>): void {
    event.stopPropagation();
  }

  return (
    <div
      className={className}
      style={{ left: centerPx - widthPx / 2, width: widthPx }}
      title={label}
      aria-label={label}
      data-transition-clip={clipId}
      onPointerDown={stopPointer}
      onClick={() => selectClip(clipId, false)}
    >
      <ArrowLeftRight size={12} strokeWidth={1.75} aria-hidden="true" />
      <button
        type="button"
        className={styles.remove}
        aria-label={t.transitions.remove}
        title={t.transitions.remove}
        onPointerDown={stopPointer}
        onClick={(event) => {
          event.stopPropagation();
          removeTransition(clipId);
        }}
      >
        <X size={10} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}
