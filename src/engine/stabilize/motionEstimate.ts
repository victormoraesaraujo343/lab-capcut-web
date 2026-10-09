// Estimativa de deslocamento entre dois quadros em tons de cinza: casamento de blocos global com refino sub-pixel.

/** Converte RGBA (4 bytes por pixel) em luminância, com um valor por pixel (0 a 255). */
export function toGray(rgba: Uint8ClampedArray, w: number, h: number): Float32Array {
  const count = w * h;
  const gray = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const p = i * 4;
    gray[i] = 0.299 * (rgba[p] ?? 0) + 0.587 * (rgba[p + 1] ?? 0) + 0.114 * (rgba[p + 2] ?? 0);
  }
  return gray;
}

/** Ajuste parabólico no mínimo: devolve o deslocamento fracionário (limitado a ±0.5) a partir de três custos vizinhos. */
function parabolicOffset(minus: number, center: number, plus: number): number {
  const denom = minus - 2 * center + plus;
  if (denom <= 0) return 0;
  const offset = (0.5 * (minus - plus)) / denom;
  return Math.min(0.5, Math.max(-0.5, offset));
}

/**
 * Deslocamento da cena de prev para curr, em px, com refino sub-pixel.
 * Se a cena andou +d, curr(x + d) = prev(x). Compara a região central (sem a margem de maxShift) para cada deslocamento inteiro.
 */
export function estimateShift(
  prev: Float32Array,
  curr: Float32Array,
  w: number,
  h: number,
  maxShift = 12,
): { dx: number; dy: number } {
  const margin = Math.max(0, Math.floor(maxShift));
  const x0 = margin;
  const x1 = w - margin;
  const y0 = margin;
  const y1 = h - margin;
  if (x1 - x0 < 4 || y1 - y0 < 4 || prev.length < w * h || curr.length < w * h) {
    return { dx: 0, dy: 0 };
  }
  const span = 2 * margin + 1;
  const costs = new Float64Array(span * span);
  let bestCost = Number.POSITIVE_INFINITY;
  let bestDx = 0;
  let bestDy = 0;
  for (let dy = -margin; dy <= margin; dy++) {
    for (let dx = -margin; dx <= margin; dx++) {
      let sum = 0;
      for (let y = y0; y < y1; y++) {
        const rowPrev = y * w;
        const rowCurr = (y + dy) * w + dx;
        for (let x = x0; x < x1; x++) {
          sum += Math.abs((prev[rowPrev + x] ?? 0) - (curr[rowCurr + x] ?? 0));
        }
      }
      costs[(dy + margin) * span + (dx + margin)] = sum;
      if (sum < bestCost) {
        bestCost = sum;
        bestDx = dx;
        bestDy = dy;
      }
    }
  }
  const costAt = (dx: number, dy: number): number => costs[(dy + margin) * span + (dx + margin)] ?? 0;
  const subX =
    bestDx > -margin && bestDx < margin
      ? parabolicOffset(costAt(bestDx - 1, bestDy), bestCost, costAt(bestDx + 1, bestDy))
      : 0;
  const subY =
    bestDy > -margin && bestDy < margin
      ? parabolicOffset(costAt(bestDx, bestDy - 1), bestCost, costAt(bestDx, bestDy + 1))
      : 0;
  return { dx: bestDx + subX, dy: bestDy + subY };
}
