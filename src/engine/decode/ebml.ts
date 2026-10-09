// Leitura de EBML (base do WebM/Matroska): VINTs de ID e de tamanho, cabeçalhos e valores primitivos.

/** Cabeçalho de um elemento EBML: ID com marcadores, tamanho sem marcador (-1 = desconhecido) e bytes do cabeçalho. */
export interface ElementHeader {
  /** ID do elemento, com os bits de marcação preservados (ex.: 0x1A45DFA3). */
  id: number;
  /** Tamanho dos dados em bytes; -1 quando o tamanho é desconhecido (todos os bits 1). */
  size: number;
  /** Quantos bytes ocupam o ID e o tamanho juntos. */
  headerSize: number;
}

/** Valor de um VINT já sem o marcador de tamanho, com quantos bytes ele ocupou. */
export interface VintValue {
  /** Valor sem marcador; -1 quando todos os bits de valor são 1 (desconhecido). */
  value: number;
  /** Número de bytes do VINT (1 a 8). */
  length: number;
}

const MAX_ID_BYTES = 4;
const MAX_VINT_BYTES = 8;

/** Calcula o tamanho em bytes de um VINT a partir do primeiro byte, pelo marcador de zeros à esquerda. */
export function vintLength(first: number): number {
  for (let length = 1; length <= MAX_VINT_BYTES; length++) {
    if (first & (0x80 >> (length - 1))) {
      return length;
    }
  }
  throw new Error('VINT EBML inválido');
}

/** Lê um ID EBML (mantém os bits de marcação); devolve o ID e quantos bytes ocupou. */
export function readElementId(view: DataView, offset: number): { id: number; length: number } {
  const length = vintLength(readByte(view, offset));
  if (length > MAX_ID_BYTES) {
    throw new Error('ID EBML com mais de 4 bytes');
  }
  let id = 0;
  for (let index = 0; index < length; index++) {
    id = id * 256 + readByte(view, offset + index);
  }
  return { id, length };
}

/** Lê um VINT de tamanho ou de número de trilha, removendo o marcador; todos os bits 1 viram -1. */
export function readVint(view: DataView, offset: number): VintValue {
  const length = vintLength(readByte(view, offset));
  const marker = 0x80 >> (length - 1);
  let value = readByte(view, offset) & (marker - 1);
  let allOnes = value === marker - 1;
  for (let index = 1; index < length; index++) {
    const byte = readByte(view, offset + index);
    value = value * 256 + byte;
    allOnes = allOnes && byte === 0xff;
  }
  return { value: allOnes ? -1 : value, length };
}

/** Lê o cabeçalho completo de um elemento (ID + tamanho) a partir de uma posição. */
export function readElementHeader(view: DataView, offset: number): ElementHeader {
  const id = readElementId(view, offset);
  const size = readVint(view, offset + id.length);
  return { id: id.id, size: size.value, headerSize: id.length + size.length };
}

/** Lê um inteiro sem sinal big-endian de 0 a 8 bytes, como number. */
export function readUint(view: DataView, offset: number, size: number): number {
  if (size > MAX_VINT_BYTES) {
    throw new Error('Inteiro EBML com mais de 8 bytes');
  }
  let value = 0;
  for (let index = 0; index < size; index++) {
    value = value * 256 + readByte(view, offset + index);
  }
  return value;
}

/** Lê um ponto flutuante big-endian de 4 ou 8 bytes (0 bytes vale 0). */
export function readFloat(view: DataView, offset: number, size: number): number {
  if (size === 0) {
    return 0;
  }
  if (size === 4) {
    return bounded(view, offset, 4, () => view.getFloat32(offset, false));
  }
  if (size === 8) {
    return bounded(view, offset, 8, () => view.getFloat64(offset, false));
  }
  throw new Error('Float EBML deve ter 4 ou 8 bytes');
}

/** Lê uma string de `size` bytes em UTF-8, descartando os zeros finais de preenchimento. */
export function readString(view: DataView, offset: number, size: number): string {
  const bytes = bounded(view, offset, size, () => new Uint8Array(view.buffer, view.byteOffset + offset, size));
  return new TextDecoder('utf-8').decode(bytes).replace(/\0+$/, '');
}

/** Copia `size` bytes a partir de uma posição (os dados binários de CodecPrivate, por exemplo). */
export function readBytes(view: DataView, offset: number, size: number): Uint8Array {
  return bounded(view, offset, size, () => new Uint8Array(view.buffer.slice(view.byteOffset + offset, view.byteOffset + offset + size)));
}

/** Lê um byte, falhando de forma clara se o cabeçalho estiver truncado. */
function readByte(view: DataView, offset: number): number {
  return bounded(view, offset, 1, () => view.getUint8(offset));
}

/** Executa a leitura somente se os bytes pedidos existem na visão; senão lança erro de dados truncados. */
function bounded<T>(view: DataView, offset: number, size: number, read: () => T): T {
  if (offset < 0 || offset + size > view.byteLength) {
    throw new Error('Dados EBML truncados');
  }
  return read();
}
