// Ímã da timeline: pontos de encaixe, conversão px/ms e busca de bordas de clipes.

import type { Track } from "@/types";

/** Resultado de um encaixe: valor final e ponto ao qual encaixou (null se não encaixou). */
export interface SnapResult {
  /** Valor após o encaixe, em ms. */
  value: number;
  /** Ponto de encaixe usado, em ms, ou null. */
  snappedTo: number | null;
}

/** Resultado do encaixe de um intervalo: início final e ponto de encaixe (null se não encaixou). */
export interface SnapRangeResult {
  /** Início final do intervalo, em ms. */
  startMs: number;
  /** Ponto de encaixe usado, em ms, ou null. */
  snappedTo: number | null;
}

/** Reúne os pontos de encaixe (0, playhead, marcadores e bordas de clipes não excluídos), únicos e ordenados. */
export function collectSnapPoints(
  tracks: Track[],
  excludeClipIds: string[],
  playheadMs: number,
  markers: number[],
): number[] {
  const excluded = new Set(excludeClipIds);
  const points = new Set<number>([0, playheadMs, ...markers]);
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (excluded.has(clip.id)) continue;
      points.add(clip.startMs);
      points.add(clip.startMs + clip.durationMs);
    }
  }
  return [...points].sort((a, b) => a - b);
}

/** Encaixa um valor no ponto mais próximo dentro do limiar (em ms); empate fica com o ponto menor. */
export function snapValue(
  valueMs: number,
  points: number[],
  thresholdMs: number,
): SnapResult {
  let best: number | null = null;
  let bestDistance = Infinity;
  for (const point of points) {
    const distance = Math.abs(point - valueMs);
    if (distance <= thresholdMs && distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return best === null
    ? { value: valueMs, snappedTo: null }
    : { value: best, snappedTo: best };
}

/** Encaixa um intervalo testando a borda inicial e a final; vence a mais próxima, e empate favorece a borda final. */
export function snapRange(
  startMs: number,
  durationMs: number,
  points: number[],
  thresholdMs: number,
): SnapRangeResult {
  const endMs = startMs + durationMs;
  const startSnap = snapValue(startMs, points, thresholdMs);
  const endSnap = snapValue(endMs, points, thresholdMs);

  if (startSnap.snappedTo === null && endSnap.snappedTo === null) {
    return { startMs, snappedTo: null };
  }
  if (endSnap.snappedTo !== null && startSnap.snappedTo === null) {
    return {
      startMs: endSnap.snappedTo - durationMs,
      snappedTo: endSnap.snappedTo,
    };
  }
  if (startSnap.snappedTo !== null && endSnap.snappedTo === null) {
    return { startMs: startSnap.snappedTo, snappedTo: startSnap.snappedTo };
  }
  const startSnapped = startSnap.snappedTo ?? startMs;
  const endSnapped = endSnap.snappedTo ?? endMs;
  const startDistance = Math.abs(startSnapped - startMs);
  const endDistance = Math.abs(endSnapped - endMs);
  if (endDistance <= startDistance) {
    return { startMs: endSnapped - durationMs, snappedTo: endSnapped };
  }
  return { startMs: startSnapped, snappedTo: startSnapped };
}

/** Converte pixels em milissegundos para o zoom dado (pixels por segundo); zoom inválido resulta em 0. */
export function pxToMs(px: number, zoomPxPerSec: number): number {
  if (!Number.isFinite(zoomPxPerSec) || zoomPxPerSec <= 0) return 0;
  return (px / zoomPxPerSec) * 1000;
}

/** Converte milissegundos em pixels para o zoom dado (pixels por segundo); zoom inválido resulta em 0. */
export function msToPx(ms: number, zoomPxPerSec: number): number {
  if (!Number.isFinite(zoomPxPerSec) || zoomPxPerSec <= 0) return 0;
  return (ms * zoomPxPerSec) / 1000;
}

/** Limiar de encaixe em ms, equivalente a uma distância fixa em pixels na tela (padrão 8 px). */
export function snapThresholdMs(
  zoomPxPerSec: number,
  thresholdPx: number = 8,
): number {
  return pxToMs(thresholdPx, zoomPxPerSec);
}

/** Encontra a borda de clipe (início ou fim) estritamente antes ou depois de fromMs, ou null se não houver. */
export function findEdge(
  tracks: Track[],
  fromMs: number,
  direction: "prev" | "next",
): number | null {
  let found: number | null = null;
  for (const track of tracks) {
    for (const clip of track.clips) {
      for (const edge of [clip.startMs, clip.startMs + clip.durationMs]) {
        if (direction === "prev") {
          if (edge < fromMs && (found === null || edge > found)) found = edge;
        } else if (edge > fromMs && (found === null || edge < found)) {
          found = edge;
        }
      }
    }
  }
  return found;
}
