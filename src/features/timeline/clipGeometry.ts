// Geometria pura dos clipes na linha do tempo: posições em px, slots de miniatura, faixa visível e fatia da forma de onda.
import type { Asset, Clip } from '@/types';
import { msToPx, pxToMs } from '@/engine/timeline/snap';

/** Intervalo horizontal visível dentro de um clipe, em px relativos ao início do clipe. */
export interface PxRange {
  /** Início do trecho visível, em px. */
  fromPx: number;
  /** Fim do trecho visível, em px. */
  toPx: number;
}

/** Um slot de miniatura: posição em px dentro do clipe e instante correspondente na mídia, em ms. */
export interface ThumbSlot {
  /** Posição do slot dentro do clipe, em px. */
  leftPx: number;
  /** Instante da mídia original mostrado neste slot, em ms. */
  mediaMs: number;
}

/** Posição horizontal do início do clipe na linha do tempo, em px. */
export function clipLeftPx(clip: Clip, zoom: number): number {
  return msToPx(clip.startMs, zoom);
}

/** Largura do clipe na linha do tempo, em px. */
export function clipWidthPx(clip: Clip, zoom: number): number {
  return msToPx(clip.durationMs, zoom);
}

/** Índice da miniatura do asset que cobre o instante da mídia, limitado ao intervalo válido. */
export function thumbnailIndexForTime(asset: Asset, mediaMs: number): number {
  const count = asset.thumbnails.length;
  const duration = asset.durationMs ?? 0;
  if (count === 0 || duration <= 0 || !Number.isFinite(mediaMs)) return 0;
  const interval = duration / count;
  const index = Math.floor(mediaMs / interval);
  return Math.min(count - 1, Math.max(0, index));
}

/** Slots de miniatura ao longo do clipe, um a cada slotWidthPx; com range, só os que tocam o trecho visível. */
export function visibleThumbSlots(
  clip: Clip,
  zoom: number,
  slotWidthPx: number,
  range?: PxRange,
): ThumbSlot[] {
  const width = clipWidthPx(clip, zoom);
  if (!(slotWidthPx > 0) || !(width > 0)) return [];
  const count = Math.ceil(width / slotWidthPx);
  const fromPx = range ? Math.max(0, range.fromPx) : 0;
  const toPx = range ? Math.min(width, range.toPx) : width;
  const first = Math.max(0, Math.floor(fromPx / slotWidthPx));
  const last = Math.min(count - 1, Math.ceil(toPx / slotWidthPx) - 1);
  const slots: ThumbSlot[] = [];
  for (let index = first; index <= last; index += 1) {
    const leftPx = index * slotWidthPx;
    slots.push({ leftPx, mediaMs: clip.trimInMs + pxToMs(leftPx, zoom) * clip.speed.value });
  }
  return slots;
}

/** Trecho do clipe que cai na área de rolagem visível, em px relativos ao clipe; a largura de visão é a da janela. */
export function visibleClipRange(
  widthPx: number,
  clipLeftPx: number,
  scrollLeftPx: number,
  viewportPx: number,
): PxRange {
  const fromPx = Math.min(widthPx, Math.max(0, scrollLeftPx - clipLeftPx));
  const toPx = Math.min(widthPx, Math.max(0, scrollLeftPx + viewportPx - clipLeftPx));
  return { fromPx, toPx: Math.max(fromPx, toPx) };
}

/** Recorte dos picos da onda que cobre o intervalo da mídia (em ms); picos são distribuídos uniformemente pela duração do asset. */
export function waveformSlice(
  peaks: number[],
  assetDurationMs: number,
  fromMediaMs: number,
  toMediaMs: number,
): number[] {
  const count = peaks.length;
  if (count === 0 || !(assetDurationMs > 0) || !(toMediaMs > fromMediaMs)) return [];
  const from = Math.max(0, fromMediaMs);
  const start = Math.min(count - 1, Math.max(0, Math.floor((from / assetDurationMs) * count)));
  const end = Math.min(count, Math.max(start + 1, Math.ceil((toMediaMs / assetDurationMs) * count)));
  return peaks.slice(start, end);
}
