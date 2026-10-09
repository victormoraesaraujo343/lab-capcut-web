// Retângulo de um clipe na trilha: cor por tipo, rótulo, miniaturas ou onda, seleção, arrasto, aparo e lâmina.
import { memo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Speech, TriangleAlert, Type } from 'lucide-react';
import { t } from '@/i18n/pt-BR';
import type { Clip, Track, TrackKind } from '@/types';
import { MIN_CLIP_MS } from '@/engine/timeline/constants';
import { msToPx, pxToMs, snapThresholdMs, snapValue } from '@/engine/timeline/snap';
import { clipHasOwnSound } from '@/stores/audioCommands';
import { selectClip, splitClipAtTime } from '@/stores/timelineCommands';
import { useProjectStore } from '@/stores/projectStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useTimelineStore } from '@/stores/timelineStore';
import { TRACK_ROW_HEIGHT, TRIM_HANDLE_WIDTH } from './layout';
import { clipLeftPx, clipWidthPx, visibleClipRange } from './clipGeometry';
import { ClipKeyframes } from './ClipKeyframes';
import { ClipThumbnails } from './ClipThumbnails';
import { ClipWaveform } from './ClipWaveform';
import { FadeHandles } from './FadeHandles';
import { useClipDrag } from './useClipDrag';
import { useClipTrim } from './useClipTrim';
import styles from './ClipView.module.css';

/** Altura da faixa de onda sobre clipes de vídeo, em px. */
const WAVE_STRIP_PX = 12;
/** Diferença entre a altura da linha e a do clipe (2px em cima e embaixo), em px. */
const CLIP_INSET_PX = 4;

/** Classe de cor do clipe, por tipo de trilha. */
const KIND_CLASS: Record<TrackKind, string | undefined> = {
  video: styles.kindVideo,
  audio: styles.kindAudio,
  text: styles.kindText,
  sticker: styles.kindSticker,
  effect: styles.kindEffect,
};

/** Rótulo de um clipe de texto: a primeira linha do conteúdo, com reticências se houver mais linhas. */
function textLabel(content: string): string {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const first = lines[0];
  if (first === undefined) return t.timeline.clip;
  return lines.length > 1 ? `${first}…` : first;
}

/** Rótulo de um clipe de fala: início do texto, ou o nome genérico se o texto estiver vazio. */
function speechLabel(text: string): string {
  const first = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line !== '');
  return first ?? t.tts.clipLabel;
}

/** Propriedades de um clipe na trilha. */
export interface ClipViewProps {
  /** Clipe exibido. */
  clip: Clip;
  /** Trilha à qual o clipe pertence. */
  track: Track;
  /** Índice da trilha na lista. */
  trackIndex: number;
  /** Zoom em pixels por segundo. */
  zoom: number;
  /** Clipe selecionado. */
  selected: boolean;
  /** Clipe esmaecido porque está sendo movido. */
  dimmed: boolean;
  /** Início da janela visível da trilha (com folga), em ms da timeline. */
  visibleStartMs: number;
  /** Fim da janela visível da trilha (com folga), em ms da timeline. */
  visibleEndMs: number;
}

/** Clipe posicionado em absoluto por tempo; trilha travada mostra listras e não responde a ponteiro. */
export const ClipView = memo(function ClipView({
  clip,
  track,
  trackIndex,
  zoom,
  selected,
  dimmed,
  visibleStartMs,
  visibleEndMs,
}: ClipViewProps) {
  const asset = useProjectStore((s) => s.project?.assets.find((a) => a.id === clip.assetId));
  const tool = useTimelineStore((s) => s.tool);
  const locked = track.locked;
  const blade = tool === 'blade' && !locked;
  const drag = useClipDrag({ clip, trackIndex, zoom });
  const trim = useClipTrim(clip, zoom);
  const [bladeX, setBladeX] = useState<number | null>(null);

  const shown: Clip = trim.preview
    ? { ...clip, startMs: trim.preview.startMs, durationMs: trim.preview.endMs - trim.preview.startMs }
    : clip;
  const left = clipLeftPx(shown, zoom);
  const width = clipWidthPx(shown, zoom);
  const visibleFromPx = msToPx(visibleStartMs, zoom);
  const range = visibleClipRange(width, left, visibleFromPx, msToPx(visibleEndMs, zoom) - visibleFromPx);

  const rowHeight = TRACK_ROW_HEIGHT[track.kind];
  const innerHeight = Math.max(1, rowHeight - CLIP_INSET_PX);
  const hasWave = asset !== undefined && (asset.waveform?.length ?? 0) > 0;
  const showThumbs = track.kind === 'video' && asset !== undefined && asset.thumbnails.length > 0;
  const showWave = hasWave && (track.kind === 'audio' || track.kind === 'video');
  const waveHeight = track.kind === 'audio' ? innerHeight : WAVE_STRIP_PX;
  const thumbHeight = showWave && track.kind === 'video' ? innerHeight - WAVE_STRIP_PX : innerHeight;

  const speedValue = clip.speed.mode === 'constant' ? clip.speed.value : 1;
  const showSpeed = speedValue !== 1;
  // Fala sintética não tem fade: a alça some nesses clipes.
  const showFades = !locked && !blade && clip.tts === undefined && clipHasOwnSound(clip, track, asset);
  const speedLabel = `${t.timeline.speedBadge} ${Number(speedValue.toFixed(2))}x`;

  /** Instante, em ms da timeline, sob o ponteiro na lâmina; ímã só no cursor de reprodução. */
  function bladeMsAt(clientX: number, clipLeft: number): number {
    const ms = clip.startMs + pxToMs(clientX - clipLeft, zoom);
    if (!useTimelineStore.getState().snapEnabled) return ms;
    return snapValue(ms, [usePlaybackStore.getState().currentTimeMs], snapThresholdMs(zoom)).value;
  }

  /** Seleciona, arrasta ou corta conforme a ferramenta; o clique não se propaga para o painel. */
  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (locked) return;
    event.stopPropagation();
    if (event.button !== 0) return;
    if (tool === 'blade') {
      const ms = bladeMsAt(event.clientX, event.currentTarget.getBoundingClientRect().left);
      if (ms > clip.startMs + MIN_CLIP_MS && ms < clip.startMs + clip.durationMs - MIN_CLIP_MS) {
        splitClipAtTime(clip.id, ms);
      }
      return;
    }
    const additive = event.ctrlKey || event.metaKey || event.shiftKey;
    if (additive && selected) {
      // Modificador sobre clipe já selecionado: tira-o da seleção, sem arrastar.
      useTimelineStore.getState().toggleClipSelection(clip.id);
      return;
    }
    if (!selected || additive) selectClip(clip.id, additive);
    drag.onPointerDown(event, () => {
      if (!additive && selected) selectClip(clip.id, false);
    });
  }

  /** Mostra a linha da lâmina acompanhando o ponteiro. */
  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!blade) return;
    const ms = bladeMsAt(event.clientX, event.currentTarget.getBoundingClientRect().left);
    setBladeX(msToPx(ms - clip.startMs, zoom));
  }

  const isText = clip.text !== undefined;
  const speech = clip.tts;
  const label = clip.text
    ? textLabel(clip.text.content)
    : speech
      ? speechLabel(speech.text)
      : (asset?.name ?? t.timeline.clip);

  const classes = [
    styles.clip,
    isText ? styles.kindText : KIND_CLASS[track.kind],
    selected && styles.selected,
    dimmed && styles.dimmed,
    track.hidden && styles.hiddenTrack,
    locked && styles.locked,
    blade && styles.blade,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      style={{ left, width }}
      data-clip-id={clip.id}
      data-track-kind={track.kind}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setBladeX(null)}
    >
      {showThumbs && asset ? (
        <ClipThumbnails clip={shown} asset={asset} zoom={zoom} heightPx={thumbHeight} range={range} />
      ) : null}
      {showWave && asset ? (
        <div className={styles.waveBox} style={{ height: waveHeight }}>
          <ClipWaveform clip={shown} asset={asset} zoom={zoom} range={range} heightPx={waveHeight} />
        </div>
      ) : null}
      <span className={styles.label}>
        {isText ? <Type className={styles.icon} size={11} aria-hidden="true" /> : null}
        {speech ? <Speech className={styles.icon} size={11} aria-hidden="true" /> : null}
        <span className={styles.labelText}>
          {label}
          {showSpeed ? ` · ${speedLabel}` : null}
        </span>
        {speech ? (
          <span className={styles.icon} role="img" aria-label={t.tts.exportNotice} title={t.tts.exportNotice}>
            <TriangleAlert size={11} aria-hidden="true" />
          </span>
        ) : null}
      </span>
      {!locked && !blade ? (
        <>
          <div
            className={styles.handleStart}
            style={{ width: TRIM_HANDLE_WIDTH }}
            onPointerDown={trim.onStartHandleDown}
          />
          <div
            className={styles.handleEnd}
            style={{ width: TRIM_HANDLE_WIDTH }}
            onPointerDown={trim.onEndHandleDown}
          />
        </>
      ) : null}
      {showFades ? <FadeHandles clip={shown} zoom={zoom} /> : null}
      <ClipKeyframes clip={shown} zoom={zoom} locked={locked} />
      {blade && bladeX !== null ? <div className={styles.bladeLine} style={{ left: bladeX }} /> : null}
    </div>
  );
});
