// Compressão LZW do GIF para os índices de cor de um quadro. Código puro, sem DOM.

const MAX_CODES = 4096;
const MAX_CODE_BITS = 12;

/** Compacta índices de cor com LZW do GIF; devolve só os sub-blocos de dados (terminados por 0x00), sem o byte de tamanho mínimo. */
export function lzwEncode(indices: Uint8Array, minCodeSize: number): Uint8Array {
  if (!Number.isInteger(minCodeSize) || minCodeSize < 2 || minCodeSize > 8) {
    throw new Error('lzwEncode: minCodeSize deve estar entre 2 e 8');
  }
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  const packed: number[] = [];
  const dict = new Map<number, number>();
  let acc = 0;
  let accBits = 0;
  let codeSize = minCodeSize + 1;
  let nextCode = endCode + 1;

  const emit = (code: number): void => {
    acc |= code << accBits;
    accBits += codeSize;
    while (accBits >= 8) {
      packed.push(acc & 0xff);
      acc >>>= 8;
      accBits -= 8;
    }
    if (codeSize < MAX_CODE_BITS && nextCode >= 1 << codeSize) {
      codeSize++;
    }
  };

  const reset = (): void => {
    dict.clear();
    nextCode = endCode + 1;
    codeSize = minCodeSize + 1;
  };

  emit(clearCode);
  if (indices.length > 0) {
    let prefix = indices[0] ?? 0;
    for (let i = 1; i < indices.length; i++) {
      const suffix = indices[i] ?? 0;
      const key = prefix * 256 + suffix;
      const found = dict.get(key);
      if (found !== undefined) {
        prefix = found;
        continue;
      }
      emit(prefix);
      if (nextCode < MAX_CODES) {
        dict.set(key, nextCode);
        nextCode++;
      } else {
        emit(clearCode);
        reset();
      }
      prefix = suffix;
    }
    emit(prefix);
  }
  emit(endCode);
  if (accBits > 0) {
    packed.push(acc & 0xff);
  }

  const blockCount = Math.ceil(packed.length / 255);
  const out = new Uint8Array(packed.length + blockCount + 1);
  let o = 0;
  for (let start = 0; start < packed.length; start += 255) {
    const len = Math.min(255, packed.length - start);
    out[o++] = len;
    for (let j = 0; j < len; j++) {
      out[o++] = packed[start + j] ?? 0;
    }
  }
  out[o] = 0;
  return out;
}
