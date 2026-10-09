// Controle de keyframe de um campo: losango para criar ou remover no cursor, e setas para ir ao keyframe anterior ou próximo.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { t } from '@/i18n/pt-BR';
import styles from './KeyframeToggle.module.css';

/** Propriedades de KeyframeToggle. */
export interface KeyframeToggleProps {
  /** Há keyframe exatamente no cursor (losango cheio). */
  active: boolean;
  /** A propriedade tem keyframes no clipe; mostra as setas de navegação. */
  animated: boolean;
  /** Cria ou remove o keyframe no cursor. */
  onToggle: () => void;
  /** Leva ao keyframe anterior. */
  onPrev: () => void;
  /** Leva ao próximo keyframe. */
  onNext: () => void;
}

/** Losango de keyframe com setas opcionais: vazio sem keyframe no cursor, cheio quando há um ali. */
export function KeyframeToggle({ active, animated, onToggle, onPrev, onNext }: KeyframeToggleProps) {
  return (
    <span className={styles.group}>
      {animated && (
        <button
          type="button"
          className={styles.nav}
          aria-label={t.keyframes.prev}
          title={t.keyframes.prev}
          onClick={onPrev}
        >
          <ChevronLeft size={12} aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        className={`${styles.diamond} ${active ? styles.on : ''}`}
        aria-label={active ? t.keyframes.remove : t.keyframes.add}
        aria-pressed={active}
        title={active ? t.keyframes.remove : t.keyframes.add}
        onClick={onToggle}
      >
        <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
          <path d="M5 0.5 L9.5 5 L5 9.5 L0.5 5 Z" fill={active ? 'currentColor' : 'none'} stroke="currentColor" />
        </svg>
      </button>
      {animated && (
        <button
          type="button"
          className={styles.nav}
          aria-label={t.keyframes.next}
          title={t.keyframes.next}
          onClick={onNext}
        >
          <ChevronRight size={12} aria-hidden="true" />
        </button>
      )}
    </span>
  );
}
