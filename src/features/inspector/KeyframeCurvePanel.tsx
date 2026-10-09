// Painel de curva: gráfico do valor ao longo do clipe com os keyframes, e seletor de easing do keyframe no cursor.
import { ease, evaluateKeyframes, hasKeyframeAt } from '@/engine/render/keyframes';
import { findClip } from '@/engine/timeline/clipOps';
import { t } from '@/i18n/pt-BR';
import { setKeyframeEasing } from '@/stores/keyframeCommands';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useProjectStore } from '@/stores/projectStore';
import type { Easing } from '@/types';
import styles from './KeyframeCurvePanel.module.css';

/** Curvas oferecidas, na ordem do seletor. */
const EASINGS: readonly Easing[] = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'hold'];
/** Largura e altura do gráfico no sistema de coordenadas do SVG. */
const PLOT = { width: 200, height: 64, pad: 4 };
/** Quantidade de amostras da curva desenhada. */
const SAMPLES = 48;
/** Largura e altura da miniatura de cada easing. */
const THUMB = { width: 24, height: 14 };
/** Quantidade de amostras de cada miniatura. */
const THUMB_SAMPLES = 12;

/** Propriedades de KeyframeCurvePanel. */
export interface KeyframeCurvePanelProps {
  /** Clipe dono dos keyframes. */
  clipId: string;
  /** Chave da propriedade no mapa de keyframes (ex.: 'x', 'scaleX'). */
  property: string;
  /** Rótulo exibido acima do gráfico. */
  label: string;
}

/** Painel de curva de uma propriedade com keyframes; sem keyframes, não aparece. */
export function KeyframeCurvePanel({ clipId, property, label }: KeyframeCurvePanelProps) {
  const clip = useProjectStore((s) => findClip(s.project?.tracks ?? [], clipId)?.clip ?? null);
  const cursorMs = usePlaybackStore((s) => s.currentTimeMs);
  const list = clip?.keyframes[property] ?? [];
  if (clip === null || list.length === 0) return null;

  const here = cursorMs - clip.startMs;
  const atCursor = list.find((k) => hasKeyframeAt([k], here));
  const values = list.map((k) => k.value);
  const low = Math.min(...values);
  const span = Math.max(...values) - low || 1;
  const duration = Math.max(1, clip.durationMs);
  const toX = (ms: number): number => (Math.min(duration, Math.max(0, ms)) / duration) * PLOT.width;
  const toY = (value: number): number =>
    PLOT.pad + (1 - (value - low) / span) * (PLOT.height - 2 * PLOT.pad);

  const curve = Array.from({ length: SAMPLES + 1 }, (_, i) => {
    const ms = (i / SAMPLES) * duration;
    return `${toX(ms).toFixed(2)},${toY(evaluateKeyframes(list, ms, list[0]?.value ?? 0)).toFixed(2)}`;
  }).join(' L');

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.name}>{label}</span>
        <span className={styles.caption}>{t.keyframes.valueOverTime}</span>
      </div>
      <svg
        className={styles.plot}
        viewBox={`0 0 ${PLOT.width} ${PLOT.height}`}
        role="img"
        aria-label={`${label}: ${t.keyframes.valueOverTime}`}
      >
        <path className={styles.curve} d={`M ${curve}`} />
        <line className={styles.cursor} x1={toX(here)} x2={toX(here)} y1={0} y2={PLOT.height} />
        {list.map((k) => (
          <circle
            key={k.timeMs}
            className={hasKeyframeAt([k], here) ? styles.pointOn : styles.point}
            cx={toX(k.timeMs)}
            cy={toY(k.value)}
            r={3}
          />
        ))}
      </svg>
      <span className={styles.caption}>{t.keyframes.curve}</span>
      <div className={styles.easings} role="group" aria-label={t.keyframes.curve}>
        {EASINGS.map((easing) => {
          const selected = atCursor?.easing === easing;
          return (
            <button
              key={easing}
              type="button"
              className={selected ? styles.easingOn : styles.easing}
              aria-label={t.keyframes.easing[easing]}
              aria-pressed={selected}
              title={t.keyframes.easing[easing]}
              disabled={atCursor === undefined}
              onClick={() => setKeyframeEasing(clipId, property, here, easing)}
            >
              <svg viewBox={`0 0 ${THUMB.width} ${THUMB.height}`} width={THUMB.width} height={THUMB.height} aria-hidden="true">
                <path d={thumbPath(easing)} />
              </svg>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Caminho SVG da miniatura de uma curva de easing, com o mesmo formato que a interpolação usa. */
function thumbPath(easing: Easing): string {
  const points = Array.from({ length: THUMB_SAMPLES + 1 }, (_, i) => {
    const progress = i / THUMB_SAMPLES;
    const x = progress * THUMB.width;
    const y = 1 + (THUMB.height - 2) * (1 - ease(easing, progress));
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return `M ${points.join(' L')}`;
}
