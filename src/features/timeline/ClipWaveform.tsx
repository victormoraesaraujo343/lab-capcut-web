// Forma de onda de um clipe de áudio (ou faixa fina sobre vídeo), desenhada em canvas só para o trecho visível.
import { useEffect, useRef } from 'react';
import type { Asset, Clip } from '@/types';
import { pxToMs } from '@/engine/timeline/snap';
import { waveformSlice, type PxRange } from './clipGeometry';
import styles from './ClipView.module.css';

/** Largura de cada barra da onda, em px. */
const BAR_STEP = 3;
/** Largura desenhada de cada barra, em px. */
const BAR_WIDTH = 2;
/** Cor de reserva da onda, usada se a variável --on-clip não existir. */
const FALLBACK_COLOR = '#0a0a0a';
/** Lista vazia estável, para não redesenhar a cada render quando não há picos. */
const NO_PEAKS: number[] = [];

/** Propriedades da forma de onda. */
export interface ClipWaveformProps {
  /** Clipe desenhado. */
  clip: Clip;
  /** Asset de origem com os picos. */
  asset: Asset;
  /** Zoom em pixels por segundo. */
  zoom: number;
  /** Trecho visível do clipe, em px relativos ao clipe. */
  range: PxRange;
  /** Altura da onda, em px. */
  heightPx: number;
}

/** Canvas com barras espelhadas da onda; não desenha se o contexto 2D não existir. */
export function ClipWaveform({ clip, asset, zoom, range, heightPx }: ClipWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const peaks = asset.waveform ?? NO_PEAKS;
  const assetDurationMs = asset.durationMs ?? 0;
  const speed = clip.speed.value;
  const trimInMs = clip.trimInMs;
  const widthPx = Math.max(1, Math.round(range.toPx - range.fromPx));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(widthPx * dpr);
    canvas.height = Math.round(heightPx * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, widthPx, heightPx);

    const fromMs = trimInMs + pxToMs(range.fromPx, zoom) * speed;
    const toMs = trimInMs + pxToMs(range.toPx, zoom) * speed;
    const slice = waveformSlice(peaks, assetDurationMs, fromMs, toMs);
    if (slice.length === 0) return;

    const color = getComputedStyle(canvas).getPropertyValue('--on-clip').trim() || FALLBACK_COLOR;
    const bars = Math.max(1, Math.floor(widthPx / BAR_STEP));
    const mid = heightPx / 2;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.55;
    for (let index = 0; index < bars; index += 1) {
      const start = Math.floor((index * slice.length) / bars);
      const end = Math.max(start + 1, Math.floor(((index + 1) * slice.length) / bars));
      let peak = 0;
      for (let k = start; k < end && k < slice.length; k += 1) {
        peak = Math.max(peak, slice[k] ?? 0);
      }
      const barHeight = Math.max(1, Math.min(1, peak) * mid);
      ctx.fillRect(index * BAR_STEP, mid - barHeight, BAR_WIDTH, barHeight * 2);
    }
  }, [peaks, assetDurationMs, trimInMs, speed, zoom, range.fromPx, range.toPx, widthPx, heightPx]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.wave}
      style={{ left: range.fromPx, width: widthPx, height: heightPx }}
      aria-hidden="true"
    />
  );
}
