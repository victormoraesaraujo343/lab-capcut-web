// Faixa de uma trilha: clipes posicionados por tempo, fantasmas de arrasto, linha de encaixe, soltura de mídia e de transição no corte.
import { useEffect, useMemo, useState, type CSSProperties, type DragEvent as ReactDragEvent } from 'react';
import { useTimelineStore } from '@/stores/timelineStore';
import { setTransition } from '@/stores/transitionCommands';
import { msToPx, pxToMs } from '@/engine/timeline/snap';
import { adjacentClipAfter, transitionSpan, type TransitionSpan } from '@/engine/render/transitionWindow';
import { TRANSITION_DRAG_MIME, endTransitionDrag, readTransitionDrop } from '@/features/library/transitionDrag';
import { carriesSticker, dropSticker, readStickerDrop } from '@/features/library/stickerDrag';
import { clipEndMs, type Clip, type Track } from '@/types';
import { t } from '@/i18n/pt-BR';
import { TRACK_ROW_HEIGHT } from './layout';
import { clipWidthPx } from './clipGeometry';
import { ClipView } from './ClipView';
import { TransitionMarker } from './TransitionMarker';
import { useAssetDrop } from './useClipDrag';
import { useMoveState, useSnapLineMs } from './dragState';
import styles from './TrackRow.module.css';

/** Passo de quantização da janela visível, em px; a janela só muda ao cruzar um passo, o que poupa renderizações na rolagem. */
const WINDOW_STEP_PX = 240;

/** Distância máxima, em px, entre o ponteiro e um corte para o corte ser destacado na soltura. */
const CUT_SNAP_PX = 24;

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

/** Corte entre dois clipes encostados: clipe que sai, instante do corte e janela da transição (ou null sem transição). */
interface Cut {
  /** Clipe que sai (guarda a transição de saída). */
  clip: Clip;
  /** Instante do corte, em ms da timeline. */
  cutMs: number;
  /** Janela da transição no corte, ou null se o clipe não tem transição. */
  span: TransitionSpan | null;
}

/** Propriedades de uma faixa de trilha. */
export interface TrackRowProps {
  /** Trilha exibida. */
  track: Track;
  /** Índice da trilha na lista. */
  trackIndex: number;
  /** Zoom em pixels por segundo. */
  zoom: number;
}

/** Cortes da trilha: cada clipe que tem um clipe encostado depois dele. */
function cutsOf(track: Track): Cut[] {
  const cuts: Cut[] = [];
  for (const clip of track.clips) {
    const incoming = adjacentClipAfter(track, clip);
    if (incoming === null) continue;
    const span = clip.transitionOut === undefined ? null : transitionSpan(clip, incoming, clip.transitionOut);
    cuts.push({ clip, cutMs: clipEndMs(clip), span });
  }
  return cuts;
}

/** Corte mais próximo da posição em px (relativa à faixa), se estiver a até CUT_SNAP_PX; senão null. */
function nearestCut(cuts: Cut[], px: number, zoom: number): Cut | null {
  let best: Cut | null = null;
  let bestDistance = Infinity;
  for (const cut of cuts) {
    const distance = Math.abs(msToPx(cut.cutMs, zoom) - px);
    if (distance <= CUT_SNAP_PX && distance < bestDistance) {
      best = cut;
      bestDistance = distance;
    }
  }
  return best;
}

/** Diz se o arrasto é de transição (pelo MIME, que dá para ler no dragover). */
function carriesTransition(event: { dataTransfer: DataTransfer | null }): boolean {
  return event.dataTransfer !== null && Array.from(event.dataTransfer.types).includes(TRANSITION_DRAG_MIME);
}

/** Liga enquanto uma transição é arrastada da biblioteca, em qualquer ponto da janela; desliga ao fim do arrasto. */
function useTransitionDragActive(): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const onStart = (event: globalThis.DragEvent): void => {
      if (carriesTransition(event)) setActive(true);
    };
    const onEnd = (): void => setActive(false);
    window.addEventListener('dragstart', onStart);
    window.addEventListener('dragend', onEnd);
    window.addEventListener('drop', onEnd);
    return () => {
      window.removeEventListener('dragstart', onStart);
      window.removeEventListener('dragend', onEnd);
      window.removeEventListener('drop', onEnd);
    };
  }, []);
  return active;
}

/** Faixa de uma trilha, de largura do conteúdo: assina a rolagem uma vez e passa a janela visível aos clipes; trilha travada não aceita soltura. */
export function TrackRow({ track, trackIndex, zoom }: TrackRowProps) {
  const selectedIds = useTimelineStore((s) => s.selectedClipIds);
  const scrollBucket = useTimelineStore((s) => Math.floor(s.scrollLeft / WINDOW_STEP_PX));
  const moveState = useMoveState();
  const snapLineMs = useSnapLineMs();
  const drop = useAssetDrop(track, zoom);
  const transitionDragging = useTransitionDragActive();
  const [hoverClipId, setHoverClipId] = useState<string | null>(null);
  const cuts = useMemo(() => cutsOf(track), [track]);
  const acceptsTransitions = track.kind === 'video' && !track.locked;

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
  const showTargets = transitionDragging && acceptsTransitions;

  /** Posição do ponteiro em px, relativa ao início da faixa. */
  function pointerPx(event: ReactDragEvent<HTMLDivElement>): number {
    return event.clientX - event.currentTarget.getBoundingClientRect().left;
  }

  /** Arrasto de transição destaca o corte sob o ponteiro; o resto segue para a soltura de mídia. */
  function handleDragOver(event: ReactDragEvent<HTMLDivElement>): void {
    if (carriesSticker(event.dataTransfer)) {
      if (!track.locked) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }
      return;
    }
    if (!carriesTransition(event)) {
      drop.onDragOver(event);
      return;
    }
    if (!acceptsTransitions) {
      setHoverClipId(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setHoverClipId(nearestCut(cuts, pointerPx(event), zoom)?.clip.id ?? null);
  }

  /** Sai do destaque quando o ponteiro deixa a faixa. */
  function handleDragLeave(event: ReactDragEvent<HTMLDivElement>): void {
    drop.onDragLeave(event);
    setHoverClipId(null);
  }

  /** Põe a transição no corte mais próximo ao soltar; sem corte perto, ou em trilha que não aceita, não faz nada. */
  function handleDrop(event: ReactDragEvent<HTMLDivElement>): void {
    const stickerId = readStickerDrop(event.dataTransfer);
    if (stickerId !== null) {
      if (track.locked) return;
      event.preventDefault();
      const preferred = track.kind === 'sticker' ? track.id : undefined;
      dropSticker(stickerId, Math.max(0, Math.round(pxToMs(pointerPx(event), zoom))), preferred);
      return;
    }
    const type = readTransitionDrop(event.dataTransfer);
    if (type === null) {
      drop.onDrop(event);
      return;
    }
    event.preventDefault();
    setHoverClipId(null);
    endTransitionDrag();
    if (!acceptsTransitions) return;
    const cut = nearestCut(cuts, pointerPx(event), zoom);
    if (cut !== null) setTransition(cut.clip.id, type);
  }

  return (
    <div
      className={rowClass}
      style={{ height }}
      data-track-id={track.id}
      data-track-kind={track.kind}
      data-locked={track.locked ? 'true' : undefined}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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
      {cuts.map((cut) => {
        const cutPx = msToPx(cut.cutMs, zoom);
        if (cut.clip.transitionOut !== undefined) {
          if (cut.span === null) return null;
          return (
            <TransitionMarker
              key={`set-${cut.clip.id}`}
              clipId={cut.clip.id}
              variant="set"
              centerPx={cutPx}
              widthPx={msToPx(cut.span.durationMs, zoom)}
              transitionType={cut.clip.transitionOut.type}
              selected={selected.has(cut.clip.id)}
            />
          );
        }
        if (!showTargets) return null;
        return (
          <TransitionMarker
            key={`target-${cut.clip.id}`}
            clipId={cut.clip.id}
            variant={cut.clip.id === hoverClipId ? 'hover' : 'target'}
            centerPx={cutPx}
            widthPx={0}
            selected={false}
          />
        );
      })}
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
