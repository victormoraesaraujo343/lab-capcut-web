import { describe, expect, it } from 'vitest';
import { readElementHeader, readElementId, readFloat, readString, readUint, readVint } from '../src/engine/decode/ebml';

/** Monta uma visão sobre bytes escritos à mão. */
function view(bytes: number[]): DataView {
  return new DataView(Uint8Array.from(bytes).buffer);
}

describe('readVint', () => {
  it('lê VINTs de 1 a 4 bytes e remove o marcador', () => {
    expect(readVint(view([0x81]), 0)).toEqual({ value: 1, length: 1 });
    expect(readVint(view([0x40, 0x02]), 0)).toEqual({ value: 2, length: 2 });
    expect(readVint(view([0x20, 0x12, 0x34]), 0)).toEqual({ value: 0x1234, length: 3 });
    expect(readVint(view([0x10, 0x00, 0x00, 0x05]), 0)).toEqual({ value: 5, length: 4 });
  });

  it('devolve -1 para tamanho desconhecido (todos os bits de valor em 1)', () => {
    expect(readVint(view([0xff]), 0)).toEqual({ value: -1, length: 1 });
    expect(readVint(view([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]), 0)).toEqual({ value: -1, length: 8 });
  });

  it('rejeita byte zero, que não começa VINT', () => {
    expect(() => readVint(view([0x00, 0x00]), 0)).toThrow();
  });
});

describe('readElementId', () => {
  it('mantém os bits de marcação do ID', () => {
    expect(readElementId(view([0x1a, 0x45, 0xdf, 0xa3]), 0)).toEqual({ id: 0x1a45dfa3, length: 4 });
    expect(readElementId(view([0xa3]), 0)).toEqual({ id: 0xa3, length: 1 });
  });
});

describe('readElementHeader', () => {
  it('lê ID e tamanho de um elemento com deslocamento', () => {
    const bytes = [0x00, 0xa3, 0x84, 0x00, 0x00, 0x00, 0x05];
    expect(readElementHeader(view(bytes), 1)).toEqual({ id: 0xa3, size: 4, headerSize: 2 });
  });

  it('informa tamanho -1 para elemento de tamanho desconhecido', () => {
    expect(readElementHeader(view([0x1f, 0x43, 0xb6, 0x75, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]), 0)).toEqual({
      id: 0x1f43b675,
      size: -1,
      headerSize: 12,
    });
  });
});

describe('readUint', () => {
  it('lê inteiros big-endian de 0 a 8 bytes', () => {
    expect(readUint(view([]), 0, 0)).toBe(0);
    expect(readUint(view([0x01, 0x00]), 0, 2)).toBe(256);
    expect(readUint(view([0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00]), 0, 8)).toBe(65536);
  });

  it('falha com dados truncados', () => {
    expect(() => readUint(view([0x01]), 0, 2)).toThrow();
  });
});

describe('readFloat', () => {
  it('lê float de 4 e de 8 bytes', () => {
    expect(readFloat(view([0x3f, 0xc0, 0x00, 0x00]), 0, 4)).toBe(1.5);
    expect(readFloat(view([0x40, 0x8f, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00]), 0, 8)).toBe(1000);
  });

  it('rejeita tamanhos que não são float', () => {
    expect(() => readFloat(view([0, 0, 0]), 0, 3)).toThrow();
  });
});

describe('readString', () => {
  it('lê texto e descarta os zeros finais', () => {
    const bytes = [0x56, 0x5f, 0x56, 0x50, 0x39, 0x00];
    expect(readString(view(bytes), 0, bytes.length)).toBe('V_VP9');
  });
});
