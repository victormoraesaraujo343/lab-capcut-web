// Funções puras da máscara: taxa e tamanho dos quadros processados, instantes a segmentar e conversão para RGBA.

/** Lado maior da máscara, em pixels: o modelo trabalha em resolução reduzida. */
export const MATTE_MAX_SIDE = 512;
/** Taxa máxima de quadros segmentados por segundo (o modelo é caro). */
export const MATTE_MAX_FPS = 15;
/** Taxa assumida quando o asset não informa a sua. */
export const DEFAULT_MATTE_SOURCE_FPS = 30;

/** Taxa efetiva da máscara: a do asset limitada ao máximo; taxa ausente ou inválida usa o padrão. */
export function effectiveMatteFps(fps: number | undefined, maxFps: number = MATTE_MAX_FPS): number {
  const source = fps !== undefined && Number.isFinite(fps) && fps > 0 ? fps : DEFAULT_MATTE_SOURCE_FPS;
  return Math.min(source, maxFps);
}

/** Instantes de mídia (ms) a segmentar no intervalo [startMs, endMs), espaçados pela taxa efetiva da máscara. */
export function framesPlan(
  startMs: number,
  endMs: number,
  fps: number | undefined,
  maxFps: number = MATTE_MAX_FPS,
): number[] {
  if (!(endMs > startMs)) return [];
  const rate = effectiveMatteFps(fps, maxFps);
  const count = Math.ceil(((endMs - startMs) * rate) / 1000);
  const plan: number[] = [];
  for (let index = 0; index < count; index++) {
    plan.push(startMs + Math.round((index * 1000) / rate));
  }
  return plan;
}

/** Timestamp do quadro de máscara de índice dado, em microssegundos, para a taxa dada. */
export function matteFrameTimeUs(index: number, rate: number): number {
  return Math.round((index * 1_000_000) / rate);
}

/** Tamanho da máscara: o lado maior vira no máximo maxSide, mantendo a proporção, com lados pares e de pelo menos 2 px. */
export function matteSize(
  width: number,
  height: number,
  maxSide: number = MATTE_MAX_SIDE,
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) throw new RangeError('invalid-size');
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: evenAtLeastTwo(width * scale), height: evenAtLeastTwo(height * scale) };
}

/** Arredonda para o par mais próximo, com mínimo 2. */
function evenAtLeastTwo(value: number): number {
  return Math.max(2, 2 * Math.round(value / 2));
}

/** Converte a máscara (0..255 em Uint8Array ou 0..1 em Float32Array) em RGBA cinza com alfa opaco. */
export function maskToRgba(
  mask: Uint8Array | Float32Array,
  width: number,
  height: number,
): Uint8ClampedArray<ArrayBuffer> {
  const pixels = width * height;
  if (mask.length !== pixels) throw new RangeError('mask-size');
  const rgba = new Uint8ClampedArray(pixels * 4);
  const scale = mask instanceof Float32Array ? 255 : 1;
  for (let index = 0; index < pixels; index++) {
    const value = (mask[index] ?? 0) * scale;
    const offset = index * 4;
    rgba[offset] = value;
    rgba[offset + 1] = value;
    rgba[offset + 2] = value;
    rgba[offset + 3] = 255;
  }
  return rgba;
}
