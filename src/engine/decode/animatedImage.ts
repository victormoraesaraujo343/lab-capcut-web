// Imagens animadas (GIF, WebP, APNG): quadros decodificados com ImageDecoder do WebCodecs. Sem DOM: roda na thread principal e no worker.

/** Quadros de uma imagem animada, com a duração de cada um e do ciclo completo. */
export interface AnimatedImage {
  /** Bitmaps dos quadros, na ordem da animação. */
  frames: ImageBitmap[];
  /** Duração de cada quadro em ms (mínimo 20 ms). */
  durationsMs: number[];
  /** Duração de um ciclo completo em ms (soma das durações). */
  totalMs: number;
}

/** Duração de um ciclo da animação, sem os bitmaps (usado na importação). */
export interface AnimationTiming {
  /** Duração de cada quadro em ms. */
  durationsMs: number[];
  /** Duração de um ciclo completo em ms. */
  totalMs: number;
}

/** Acima desse número de quadros, a animação é reduzida para caber na memória. */
const MAX_FRAMES = 300;
/** Estimativa de memória (bytes, RGBA) acima da qual a animação é reduzida. */
const MAX_ESTIMATED_BYTES = 200 * 1024 * 1024;
/** Lado maior, em px, dos quadros quando a animação é reduzida. */
const MAX_SIDE_PX = 1024;
/** Duração mínima de um quadro, em ms (quadros mais rápidos que isso viram este valor). */
const MIN_FRAME_MS = 20;
/** Duração usada quando o quadro não informa a própria duração, em ms. */
const DEFAULT_FRAME_MS = 100;

/** MIMEs que podem ser animados; PNG só conta quando for APNG (o decodificador informa). */
const ANIMATABLE_MIMES: ReadonlySet<string> = new Set(['image/gif', 'image/webp', 'image/apng', 'image/png']);

/** MIME pela extensão do arquivo, para quando o navegador não informa o tipo. */
const MIME_BY_EXTENSION: ReadonlyMap<string, string> = new Map([
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.apng', 'image/apng'],
  ['.png', 'image/png'],
]);

/** Remove parâmetros e espaços do MIME e o converte para minúsculas. */
function normalizeMime(mime: string): string {
  return (mime.split(';')[0] ?? '').trim().toLowerCase();
}

/** Diz qual MIME usar para checar animação, ou null se o arquivo não é GIF/WebP/APNG/PNG. */
export function animatedMimeOf(mimeType: string, path: string): string | null {
  const mime = normalizeMime(mimeType);
  if (ANIMATABLE_MIMES.has(mime)) return mime;
  const dot = path.lastIndexOf('.');
  if (dot < 0) return null;
  return MIME_BY_EXTENSION.get(path.slice(dot).toLowerCase()) ?? null;
}

/** Diz se o navegador (ou worker) consegue decodificar este MIME com ImageDecoder. */
export async function canDecodeAnimated(mimeType: string): Promise<boolean> {
  if (typeof ImageDecoder === 'undefined') return false;
  try {
    return await ImageDecoder.isTypeSupported(mimeType);
  } catch {
    return false;
  }
}

/** Escolhe o tamanho reduzido dos quadros quando a animação é grande demais; null = manter o tamanho original. */
function chooseReduction(frameCount: number, width: number, height: number): { width: number; height: number } | null {
  const estimatedBytes = frameCount * width * height * 4;
  if (frameCount <= MAX_FRAMES && estimatedBytes <= MAX_ESTIMATED_BYTES) return null;
  const longest = Math.max(width, height);
  if (longest <= MAX_SIDE_PX) return null;
  const scale = MAX_SIDE_PX / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Converte a duração do quadro (µs) em ms, com mínimo de 20 ms. */
function frameDurationMs(durationUs: number | null): number {
  if (durationUs === null || !Number.isFinite(durationUs)) return DEFAULT_FRAME_MS;
  return Math.max(MIN_FRAME_MS, durationUs / 1000);
}

/** Lê a animação; com keepFrames false só mede as durações e não cria bitmaps. */
async function readAnimation(data: Blob, mimeType: string, keepFrames: boolean): Promise<AnimatedImage | null> {
  if (!(await canDecodeAnimated(mimeType))) return null;
  const frames: ImageBitmap[] = [];
  let decoder: ImageDecoder | null = null;
  try {
    decoder = new ImageDecoder({ data: await data.arrayBuffer(), type: mimeType });
    await decoder.tracks.ready;
    const track = decoder.tracks.selectedTrack;
    if (!track || !track.animated || track.frameCount <= 1) return null;
    const frameCount = track.frameCount;
    const durationsMs: number[] = [];
    let reduceTo: { width: number; height: number } | null = null;
    for (let index = 0; index < frameCount; index += 1) {
      const { image } = await decoder.decode({ frameIndex: index });
      try {
        if (index === 0) reduceTo = chooseReduction(frameCount, image.displayWidth, image.displayHeight);
        durationsMs.push(frameDurationMs(image.duration));
        if (keepFrames) {
          const bitmap =
            reduceTo === null
              ? await createImageBitmap(image)
              : await createImageBitmap(image, { resizeWidth: reduceTo.width, resizeHeight: reduceTo.height, resizeQuality: 'high' });
          frames.push(bitmap);
        }
      } finally {
        image.close();
      }
    }
    const totalMs = durationsMs.reduce((sum, ms) => sum + ms, 0);
    return { frames, durationsMs, totalMs };
  } catch {
    // Arquivo corrompido ou formato sem suporte real: quem chamou cai no caminho de imagem parada.
    closeAnimatedImage({ frames, durationsMs: [], totalMs: 0 });
    return null;
  } finally {
    decoder?.close();
  }
}

/** Decodifica todos os quadros de um GIF/WebP/APNG animado; null se não for animado ou sem suporte. */
export async function decodeAnimatedImage(data: Blob, mimeType: string): Promise<AnimatedImage | null> {
  return readAnimation(data, mimeType, true);
}

/** Mede a duração de cada quadro e do ciclo sem manter os bitmaps; null se não for animado ou sem suporte. */
export async function probeAnimation(data: Blob, mimeType: string): Promise<AnimationTiming | null> {
  return readAnimation(data, mimeType, false);
}

/** Índice do quadro visível no instante dado; com loop, o tempo dá a volta pelo total do ciclo. */
export function frameIndexAt(durationsMs: number[], timeMs: number, loop = true): number {
  const count = durationsMs.length;
  const total = durationsMs.reduce((sum, ms) => sum + ms, 0);
  if (count === 0 || total <= 0) return 0;
  let time = Number.isFinite(timeMs) ? timeMs : 0;
  if (loop) {
    time = ((time % total) + total) % total;
  } else if (time >= total) {
    return count - 1;
  } else if (time < 0) {
    return 0;
  }
  let elapsed = 0;
  for (let index = 0; index < count; index += 1) {
    elapsed += durationsMs[index] ?? 0;
    if (time < elapsed) return index;
  }
  return count - 1;
}

/** Quadro da animação visível no instante de mídia, ou null se não há quadros. */
export function animationFrameAt(animation: AnimatedImage, timeMs: number): ImageBitmap | null {
  return animation.frames[frameIndexAt(animation.durationsMs, timeMs)] ?? null;
}

/** Fecha todos os quadros de uma animação; aceita null para facilitar encadeamento com promises. */
export function closeAnimatedImage(animation: AnimatedImage | null): void {
  if (animation === null) return;
  for (const frame of animation.frames) {
    frame.close();
  }
}
