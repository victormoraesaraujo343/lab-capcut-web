// Quantização de cor para GIF: paleta por median cut e mapeamento com dither Floyd–Steinberg leve. Código puro, sem DOM.

const SAMPLE_LIMIT = 20000;
const DITHER_STRENGTH = 0.5;
const CACHE_SIZE = 32768;
const CHANNEL_SHIFTS = [16, 8, 0] as const;

interface Box {
  lo: number;
  hi: number;
}

/** Maior amplitude de canal (com o deslocamento de bits correspondente) dentro de um intervalo de cores empacotadas. */
function widestChannel(colors: Uint32Array, lo: number, hi: number): { shift: number; range: number } {
  let best = { shift: 16, range: 0 };
  for (const shift of CHANNEL_SHIFTS) {
    let min = 255;
    let max = 0;
    for (let i = lo; i < hi; i++) {
      const v = ((colors[i] ?? 0) >> shift) & 255;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (max - min > best.range) best = { shift, range: max - min };
  }
  return best;
}

/** Cor média de um intervalo de cores empacotadas, em RGB. */
function averageColor(colors: Uint32Array, lo: number, hi: number): [number, number, number] {
  let sr = 0;
  let sg = 0;
  let sb = 0;
  for (let i = lo; i < hi; i++) {
    const c = colors[i] ?? 0;
    sr += (c >> 16) & 255;
    sg += (c >> 8) & 255;
    sb += c & 255;
  }
  const count = hi - lo;
  return [Math.round(sr / count), Math.round(sg / count), Math.round(sb / count)];
}

/** Monta uma paleta RGB (3 bytes por cor, até maxColors) por median cut sobre uma amostra do quadro. */
export function buildPalette(rgba: Uint8ClampedArray, maxColors = 256): Uint8Array {
  const limit = Math.min(256, Math.max(1, Math.floor(maxColors)));
  const pixelCount = Math.floor(rgba.length / 4);
  if (pixelCount === 0) return new Uint8Array(0);

  const step = Math.max(1, Math.floor(pixelCount / SAMPLE_LIMIT));
  const colors = new Uint32Array(Math.ceil(pixelCount / step));
  let n = 0;
  for (let p = 0; p < pixelCount; p += step) {
    const o = p * 4;
    colors[n++] = ((rgba[o] ?? 0) << 16) | ((rgba[o + 1] ?? 0) << 8) | (rgba[o + 2] ?? 0);
  }
  const view = colors.subarray(0, n);

  const boxes: Box[] = [{ lo: 0, hi: n }];
  while (boxes.length < limit) {
    let bestIndex = -1;
    let bestScore = 0;
    let bestShift = 16;
    for (let b = 0; b < boxes.length; b++) {
      const box = boxes[b];
      if (!box || box.hi - box.lo < 2) continue;
      const { shift, range } = widestChannel(view, box.lo, box.hi);
      const score = range * (box.hi - box.lo);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = b;
        bestShift = shift;
      }
    }
    if (bestIndex < 0) break;
    const box = boxes[bestIndex];
    if (!box) break;
    view.subarray(box.lo, box.hi).sort((a, b) => ((a >> bestShift) & 255) - ((b >> bestShift) & 255));
    const mid = box.lo + ((box.hi - box.lo) >> 1);
    boxes.splice(bestIndex, 1, { lo: box.lo, hi: mid }, { lo: mid, hi: box.hi });
  }

  const palette = new Uint8Array(boxes.length * 3);
  boxes.forEach((box, i) => {
    const [r, g, b] = averageColor(view, box.lo, box.hi);
    palette[i * 3] = r;
    palette[i * 3 + 1] = g;
    palette[i * 3 + 2] = b;
  });
  return palette;
}

/** Índice da cor da paleta mais próxima (distância quadrática em RGB). */
function nearestIndex(palette: Uint8Array, count: number, r: number, g: number, b: number): number {
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < count; i++) {
    const dr = (palette[i * 3] ?? 0) - r;
    const dg = (palette[i * 3 + 1] ?? 0) - g;
    const db = (palette[i * 3 + 2] ?? 0) - b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/** Converte um quadro RGBA em índices da paleta; com dither aplica Floyd–Steinberg leve. Ignora o alfa. */
export function mapToPalette(
  rgba: Uint8ClampedArray,
  palette: Uint8Array,
  width: number,
  height: number,
  dither: boolean,
): Uint8Array {
  const count = width * height;
  if (rgba.length < count * 4) {
    throw new Error('mapToPalette: quadro menor que width x height');
  }
  const out = new Uint8Array(count);
  const colorCount = Math.floor(palette.length / 3);
  if (colorCount === 0) return out;

  const cache = new Int16Array(CACHE_SIZE).fill(-1);
  const lookup = (r: number, g: number, b: number): number => {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const hit = cache[key] ?? -1;
    if (hit >= 0) return hit;
    const idx = nearestIndex(palette, colorCount, r, g, b);
    cache[key] = idx;
    return idx;
  };

  if (!dither) {
    for (let p = 0; p < count; p++) {
      const o = p * 4;
      out[p] = lookup(rgba[o] ?? 0, rgba[o + 1] ?? 0, rgba[o + 2] ?? 0);
    }
    return out;
  }

  const work = new Float32Array(count * 3);
  for (let p = 0; p < count; p++) {
    work[p * 3] = rgba[p * 4] ?? 0;
    work[p * 3 + 1] = rgba[p * 4 + 1] ?? 0;
    work[p * 3 + 2] = rgba[p * 4 + 2] ?? 0;
  }
  const clampByte = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
  const spread = (x: number, y: number, weight: number, er: number, eg: number, eb: number): void => {
    if (x < 0 || x >= width || y >= height) return;
    const w = (y * width + x) * 3;
    work[w] = (work[w] ?? 0) + er * weight;
    work[w + 1] = (work[w + 1] ?? 0) + eg * weight;
    work[w + 2] = (work[w + 2] ?? 0) + eb * weight;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const w = p * 3;
      const r = work[w] ?? 0;
      const g = work[w + 1] ?? 0;
      const b = work[w + 2] ?? 0;
      const idx = lookup(clampByte(r), clampByte(g), clampByte(b));
      out[p] = idx;
      const er = (r - (palette[idx * 3] ?? 0)) * DITHER_STRENGTH;
      const eg = (g - (palette[idx * 3 + 1] ?? 0)) * DITHER_STRENGTH;
      const eb = (b - (palette[idx * 3 + 2] ?? 0)) * DITHER_STRENGTH;
      spread(x + 1, y, 7 / 16, er, eg, eb);
      spread(x - 1, y + 1, 3 / 16, er, eg, eb);
      spread(x, y + 1, 5 / 16, er, eg, eb);
      spread(x + 1, y + 1, 1 / 16, er, eg, eb);
    }
  }
  return out;
}
