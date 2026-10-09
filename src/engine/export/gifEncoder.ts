// Codificador GIF89a animado próprio: paleta local por quadro, LZW, loop infinito. Código puro, sem DOM.
import { buildPalette, mapToPalette } from './gifQuantize';
import { lzwEncode } from './gifLzw';

const PALETTE_SIZE = 256;
const MIN_CODE_SIZE = 8;
const MAX_DIMENSION = 65535;

/** Acrescenta um valor de 16 bits little-endian à lista de bytes. */
function pushUint16(out: number[], value: number): void {
  out.push(value & 0xff, (value >> 8) & 0xff);
}

/** Acrescenta uma sequência de bytes à lista. */
function pushAscii(out: number[], text: string): void {
  for (let i = 0; i < text.length; i++) out.push(text.charCodeAt(i));
}

/** Cria um codificador GIF que recebe quadros RGBA e devolve o arquivo animado com finish(). */
export function createGifEncoder(
  width: number,
  height: number,
  fps: number,
): { addFrame(rgba: Uint8ClampedArray): void; finish(): Uint8Array } {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('createGifEncoder: largura e altura devem ser inteiros positivos');
  }
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new Error('createGifEncoder: dimensão acima do limite do GIF');
  }
  if (!(fps > 0)) {
    throw new Error('createGifEncoder: fps deve ser positivo');
  }
  const chunks: Uint8Array[] = [];
  let finished = false;
  /** Quadros já aceitos e total de centésimos já emitido, para o atraso não acumular erro. */
  let framesAdded = 0;
  let emittedCs = 0;

  const header: number[] = [];
  pushAscii(header, 'GIF89a');
  pushUint16(header, width);
  pushUint16(header, height);
  header.push(0x70, 0x00, 0x00);
  header.push(0x21, 0xff, 0x0b);
  pushAscii(header, 'NETSCAPE2.0');
  header.push(0x03, 0x01, 0x00, 0x00, 0x00);
  chunks.push(Uint8Array.from(header));

  /** Gera o bloco de um quadro: Graphic Control Extension, Image Descriptor, paleta local e dados LZW. */
  const encodeFrame = (rgba: Uint8ClampedArray, delayCs: number): Uint8Array => {
    if (rgba.length !== width * height * 4) {
      throw new Error('addFrame: tamanho do quadro não corresponde a largura x altura');
    }
    const palette = buildPalette(rgba, PALETTE_SIZE);
    const indices = mapToPalette(rgba, palette, width, height, true);
    const padded = new Uint8Array(PALETTE_SIZE * 3);
    padded.set(palette.subarray(0, Math.min(palette.length, padded.length)));
    const lzw = lzwEncode(indices, MIN_CODE_SIZE);

    const out: number[] = [0x21, 0xf9, 0x04, 0x04];
    pushUint16(out, delayCs);
    out.push(0x00, 0x00);
    out.push(0x2c);
    pushUint16(out, 0);
    pushUint16(out, 0);
    pushUint16(out, width);
    pushUint16(out, height);
    out.push(0x80 | 0x07);
    const head = Uint8Array.from(out);
    const body = new Uint8Array(head.length + padded.length + 1 + lzw.length);
    body.set(head, 0);
    body.set(padded, head.length);
    body[head.length + padded.length] = MIN_CODE_SIZE;
    body.set(lzw, head.length + padded.length + 1);
    return body;
  };

  return {
    addFrame(rgba: Uint8ClampedArray): void {
      if (finished) throw new Error('addFrame: codificador já finalizado');
      // Alvo acumulado ideal (N * 100 / fps) arredondado; o atraso do quadro é a diferença para o já emitido.
      const targetCs = Math.round(((framesAdded + 1) * 100) / fps);
      const delayCs = Math.max(1, targetCs - emittedCs);
      chunks.push(encodeFrame(rgba, delayCs));
      framesAdded++;
      emittedCs += delayCs;
    },
    finish(): Uint8Array {
      if (finished) throw new Error('finish: codificador já finalizado');
      finished = true;
      chunks.push(Uint8Array.of(0x3b));
      const total = chunks.reduce((sum, c) => sum + c.length, 0);
      const file = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        file.set(chunk, offset);
        offset += chunk.length;
      }
      return file;
    },
  };
}
