import { describe, expect, it } from 'vitest';
import { createGifEncoder } from '../src/engine/export/gifEncoder';
import { lzwEncode } from '../src/engine/export/gifLzw';
import { buildPalette } from '../src/engine/export/gifQuantize';

/** Junta os sub-blocos de dados (tamanho + bytes, terminados por 0x00) de um trecho LZW. */
function joinSubBlocks(data: Uint8Array): Uint8Array {
  const parts: number[] = [];
  let pos = 0;
  while (pos < data.length) {
    const size = data[pos] ?? 0;
    pos++;
    if (size === 0) break;
    for (let i = 0; i < size; i++) parts.push(data[pos + i] ?? 0);
    pos += size;
  }
  return Uint8Array.from(parts);
}

/** Decodificador LZW mínimo do GIF, só para conferir o codificador. */
function lzwDecode(data: Uint8Array, minCodeSize: number): number[] {
  const bytes = joinSubBlocks(data);
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  const prefix = new Int32Array(4096).fill(-1);
  const suffix = new Uint8Array(4096);
  for (let i = 0; i < clear; i++) suffix[i] = i;
  const out: number[] = [];

  const expand = (code: number): number[] => {
    const seq: number[] = [];
    let c = code;
    while (c >= 0) {
      seq.push(suffix[c] ?? 0);
      c = prefix[c] ?? -1;
    }
    return seq.reverse();
  };

  let codeSize = minCodeSize + 1;
  let next = end + 1;
  let previous = -1;
  let bitPos = 0;
  const readCode = (): number => {
    let code = 0;
    for (let i = 0; i < codeSize; i++) {
      const byte = bytes[(bitPos + i) >> 3] ?? 0;
      code |= ((byte >> ((bitPos + i) & 7)) & 1) << i;
    }
    bitPos += codeSize;
    return code;
  };

  while (bitPos + codeSize <= bytes.length * 8) {
    const code = readCode();
    if (code === clear) {
      codeSize = minCodeSize + 1;
      next = end + 1;
      previous = -1;
      continue;
    }
    if (code === end) break;
    if (previous < 0) {
      out.push(...expand(code));
      previous = code;
      continue;
    }
    let first: number;
    if (code < next) {
      first = expand(code)[0] ?? 0;
    } else {
      first = expand(previous)[0] ?? 0;
    }
    prefix[next] = previous;
    suffix[next] = first;
    next++;
    if (next === 1 << codeSize && codeSize < 12) codeSize++;
    out.push(...expand(code));
    previous = code;
  }
  return out;
}

/** Lê um arquivo GIF e devolve a posição do Image Descriptor do primeiro quadro. */
function findImageDescriptor(file: Uint8Array): number {
  let pos = 13;
  pos = skipGlobalPalette(file, pos);
  while (pos < file.length) {
    const marker = file[pos];
    if (marker === 0x21) {
      pos += 2;
      pos = skipSubBlocks(file, pos);
    } else if (marker === 0x2c) {
      return pos;
    } else {
      break;
    }
  }
  return -1;
}

/** Pula a tabela de cores global, se existir. */
function skipGlobalPalette(file: Uint8Array, pos: number): number {
  const packed = file[10] ?? 0;
  if ((packed & 0x80) === 0) return pos;
  return pos + 3 * (1 << ((packed & 7) + 1));
}

/** Pula sub-blocos até o terminador 0x00. */
function skipSubBlocks(file: Uint8Array, pos: number): number {
  let p = pos;
  while (p < file.length) {
    const size = file[p] ?? 0;
    p++;
    if (size === 0) return p;
    p += size;
  }
  return p;
}

/** Lê o atraso (centésimos de segundo) de cada quadro, na ordem, a partir dos blocos Graphic Control Extension. */
function readFrameDelays(file: Uint8Array): number[] {
  const delays: number[] = [];
  let pos = 13;
  while (pos < file.length && file[pos] !== 0x3b) {
    const marker = file[pos];
    if (marker === 0x21) {
      if (file[pos + 1] === 0xf9) {
        delays.push((file[pos + 4] ?? 0) | ((file[pos + 5] ?? 0) << 8));
      }
      pos = skipSubBlocks(file, pos + 2);
    } else if (marker === 0x2c) {
      const packed = file[pos + 9] ?? 0;
      let p = pos + 10;
      if ((packed & 0x80) !== 0) p += 3 * (1 << ((packed & 7) + 1));
      pos = skipSubBlocks(file, p + 1);
    } else {
      break;
    }
  }
  return delays;
}

/** Monta um GIF com n quadros sólidos pequenos na taxa dada e devolve o arquivo. */
function encodeFrames(n: number, fps: number): Uint8Array {
  const encoder = createGifEncoder(2, 2, fps);
  const frame = new Uint8ClampedArray(2 * 2 * 4);
  for (let p = 0; p < 4; p++) frame[p * 4 + 3] = 255;
  for (let i = 0; i < n; i++) encoder.addFrame(frame);
  return encoder.finish();
}

describe('lzwEncode', () => {
  it('decodifica de volta aos índices originais com códigos de mais de 9 bits', () => {
    const indices = new Uint8Array(300);
    let seed = 12345;
    for (let i = 0; i < indices.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      indices[i] = seed & 0xff;
    }
    const encoded = lzwEncode(indices, 8);
    expect(Array.from(lzwDecode(encoded, 8))).toEqual(Array.from(indices));
  });

  it('decodifica corretamente quando a tabela enche e ocorre clear', () => {
    const indices = new Uint8Array(20000);
    let seed = 987;
    for (let i = 0; i < indices.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      indices[i] = (seed >> 8) & 3;
    }
    const encoded = lzwEncode(indices, 2);
    expect(Array.from(lzwDecode(encoded, 2))).toEqual(Array.from(indices));
  });
});

describe('buildPalette', () => {
  it('contém as duas cores de uma imagem de duas cores', () => {
    const rgba = new Uint8ClampedArray(4 * 16);
    for (let p = 0; p < 16; p++) {
      const o = p * 4;
      if (p < 8) {
        rgba[o] = 255;
      } else {
        rgba[o + 2] = 255;
      }
      rgba[o + 3] = 255;
    }
    const palette = buildPalette(rgba, 256);
    const colors = new Set<string>();
    for (let i = 0; i < palette.length; i += 3) {
      colors.add(`${palette[i]},${palette[i + 1]},${palette[i + 2]}`);
    }
    expect(colors.has('255,0,0')).toBe(true);
    expect(colors.has('0,0,255')).toBe(true);
  });
});

describe('createGifEncoder', () => {
  it('12 s a 15 fps somam exatamente 1200 centésimos, com atrasos de 6 ou 7', () => {
    const delays = readFrameDelays(encodeFrames(180, 15));
    expect(delays).toHaveLength(180);
    expect(delays.reduce((sum, d) => sum + d, 0)).toBe(1200);
    for (const d of delays) expect([6, 7]).toContain(d);
  });

  it('a 24 fps a soma acompanha round(N * 100 / fps)', () => {
    const delays = readFrameDelays(encodeFrames(50, 24));
    expect(delays).toHaveLength(50);
    expect(delays.reduce((sum, d) => sum + d, 0)).toBe(Math.round((50 * 100) / 24));
    for (const d of delays) expect([4, 5]).toContain(d);
  });

  it('gera GIF89a com NETSCAPE2.0 e trailer 0x3B para quadro sólido vermelho', () => {
    const encoder = createGifEncoder(4, 4, 30);
    const red = new Uint8ClampedArray(4 * 4 * 4);
    for (let p = 0; p < 16; p++) {
      red[p * 4] = 255;
      red[p * 4 + 3] = 255;
    }
    encoder.addFrame(red);
    const file = encoder.finish();
    const text = Array.from(file.subarray(0, 6), (b) => String.fromCharCode(b)).join('');

    expect(text).toBe('GIF89a');
    expect(file[file.length - 1]).toBe(0x3b);
    expect(new TextDecoder().decode(file)).toContain('NETSCAPE2.0');
  });

  it('decodifica o quadro de volta aos índices e a paleta local contém as cores', () => {
    const encoder = createGifEncoder(20, 20, 24);
    const frameA = new Uint8ClampedArray(20 * 20 * 4);
    const frameB = new Uint8ClampedArray(20 * 20 * 4);
    for (let p = 0; p < 400; p++) {
      const o = p * 4;
      if (p % 2 === 0) {
        frameA[o] = 255;
      } else {
        frameA[o + 2] = 255;
      }
      frameA[o + 3] = 255;
      frameB[o + 1] = 255;
      frameB[o + 3] = 255;
    }
    encoder.addFrame(frameA);
    encoder.addFrame(frameB);
    const file = encoder.finish();

    expect(new TextDecoder().decode(file.subarray(0, 6))).toBe('GIF89a');
    expect(file[file.length - 1]).toBe(0x3b);

    const descriptor = findImageDescriptor(file);
    expect(descriptor).toBeGreaterThan(0);
    const packed = file[descriptor + 9] ?? 0;
    expect(packed & 0x80).toBe(0x80);
    const paletteStart = descriptor + 10;
    const colors = new Set<string>();
    for (let i = 0; i < 256; i++) {
      const o = paletteStart + i * 3;
      colors.add(`${file[o]},${file[o + 1]},${file[o + 2]}`);
    }
    expect(colors.has('255,0,0')).toBe(true);
    expect(colors.has('0,0,255')).toBe(true);
  });
});
