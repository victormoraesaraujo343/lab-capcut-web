// Faixa de uma trilha: clipes posicionados por tempo, fantasma de arrasto com dica de Alt, linha de encaixe e soltura de mídia do painel.
import type { CSSProperties } from 'react';
import { useTimelineStore } from '@/stores/timelineStore';
import { msToPx, pxToMs } from '@/engine/timeline/snap';
import type { Track } from '@/types';
import { t } from '@/i18n/pt-BR';
import { TRACK_ROW_HEIGHT } from './layout';
import { clipWidthPx } from './clipGeometry';
import { ClipView } from './ClipView';
import { useAssetDrop } from './useClipDrag';
import { useMoveState, useSnapLineMs } from './dragState';
import styles from './TrackRow.module.css';

/** Passo de quantização da janela visível, em px; a janela só muda ao cruzar um passo, o que poupa renderizações na rolagem. */
const WINDOW_STEP_PX = 240;

/** Estilo da dica de Alt dentro dos fantasmas: uma linha, sem quebrar nem cobrir o ponteiro. */
const HINT_STYLE: CSSProperties = {
  display: 'block',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  padding: '2px 6px',
  fontSize: 'var(--font-size-md)',
  color: 'var(--text)',
  pointerEvents: 'none',
};

/** Propriedades de uma faixa de trilha. */
export interface TrackRowProps {
  /** Trilha exibida. */
  track: Track;
  /** Índice da trilha na lista. */
  trackIndex: number;
  /** Zoom em pixels por segundo. */
  zoom: number;
}

/** Faixa de uma trilha, de largura do conteúdo: assina a rolagem uma vez e passa a janela visível aos clipes; trilha travada não aceita soltura. */
export function TrackRow({ track, trackIndex, zoom }: TrackRowProps) {
  const selectedIds = useTimelineStore((s) => s.selectedClipIds);
  const scrollBucket = useTimelineStore((s) => Math.floor(s.scrollLeft / WINDOW_STEP_PX));
  const moveState = useMoveState();
  const snapLineMs = useSnapLineMs();
  const drop = useAssetDrop(track, zoom);

  const height = TRACK_ROW_HEIGHT[track.kind];
  const selected = new Set(selectedIds);
  const moving = moveState ? new Set(moveState.movingIds) : null;
  const ghost =
    moveState !== null && moveState.sourceTrackIndex + moveState.trackDelta === trackIndex
      ? moveState
      : null;

  // Janela com folga de um passo para cada lado: cobre a área visível sempre que a rolagem muda dentro do passo.
  const windowFromPx = Math.max(0, (scrollBucket - 1) * WINDOW_STEP_PX);
  const windowToPx = (scrollBucket + 2) * WINDOW_STEP_PX + window.innerWidth;
  const visibleStartMs = pxToMs(windowFromPx, zoom);
  const visibleEndMs = pxToMs(windowToPx, zoom);

  const rowClass = [styles.row, track.locked && styles.locked].filter(Boolean).join(' ');

  return (
    <div
      className={rowClass}
      style={{ height }}
      data-track-id={track.id}
      data-track-kind={track.kind}
      data-locked={track.locked ? 'true' : undefined}
      onDragOver={drop.onDragOver}
      onDragLeave={drop.onDragLeave}
      onDrop={drop.onDrop}
    >
      {track.clips.map((clip) => (
        <ClipView
          key={clip.id}
          clip={clip}
          track={track}
          trackIndex={trackIndex}
          zoom={zoom}
          selected={selected.has(clip.id)}
          dimmed={moving?.has(clip.id) ?? false}
          visibleStartMs={visibleStartMs}
          visibleEndMs={visibleEndMs}
        />
      ))}
      {ghost ? (
        <div
          className={styles.ghost}
          title={t.timeline.insertHint}
          style={{
            left: msToPx(ghost.clip.startMs + ghost.deltaMs, zoom),
            width: clipWidthPx(ghost.clip, zoom),
          }}
        >
          <span style={HINT_STYLE}>{t.timeline.insertHint}</span>
        </div>
      ) : null}
      {drop.ghost ? (
        <div
          className={styles.dropGhost}
          title={t.timeline.insertHint}
          style={{ left: msToPx(drop.ghost.leftMs, zoom), width: msToPx(drop.ghost.durationMs, zoom) }}
        >
          <span style={HINT_STYLE}>{t.timeline.insertHint}</span>
        </div>
      ) : null}
      {snapLineMs !== null ? <div className={styles.snapLine} style={{ left: msToPx(snapLineMs, zoom) }} /> : null}
    </div>
  );
}
