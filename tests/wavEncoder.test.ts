import { describe, expect, it } from 'vitest';
import { encodeWav } from '../src/engine/export/wavEncoder';

/** Lê uma string ASCII de 4 caracteres num deslocamento. */
function readTag(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

describe('encodeWav', () => {
  it('gera cabeçalho RIFF/WAVE de 44 bytes com tamanho correto', () => {
    const left = new Float32Array([0, 0.5, -0.5, 1]);
    const buffer = encodeWav({ sampleRate: 48000, channels: [left] });
    const view = new DataView(buffer);

    expect(buffer.byteLength).toBe(44 + 4 * 2);
    expect(readTag(view, 0)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(36 + 8);
    expect(readTag(view, 8)).toBe('WAVE');
    expect(readTag(view, 12)).toBe('fmt ');
    expect(view.getUint32(16, true)).toBe(16);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint32(28, true)).toBe(48000 * 2);
    expect(view.getUint16(32, true)).toBe(2);
    expect(view.getUint16(34, true)).toBe(16);
    expect(readTag(view, 36)).toBe('data');
    expect(view.getUint32(40, true)).toBe(8);
  });

  it('converte -1, 0 e 1 em PCM 16 bits corretamente', () => {
    const buffer = encodeWav({ sampleRate: 8000, channels: [new Float32Array([-1, 0, 1])] });
    const view = new DataView(buffer);

    expect(view.getInt16(44, true)).toBe(-32768);
    expect(view.getInt16(46, true)).toBe(0);
    expect(view.getInt16(48, true)).toBe(32767);
  });

  it('faz clamp de valores fora de [-1, 1]', () => {
    const buffer = encodeWav({ sampleRate: 8000, channels: [new Float32Array([-3, 3])] });
    const view = new DataView(buffer);

    expect(view.getInt16(44, true)).toBe(-32768);
    expect(view.getInt16(46, true)).toBe(32767);
  });

  it('intercala canais em estéreo', () => {
    const left = new Float32Array([1, 0, -1]);
    const right = new Float32Array([0, 1, -1]);
    const buffer = encodeWav({ sampleRate: 44100, channels: [left, right] });
    const view = new DataView(buffer);

    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint16(32, true)).toBe(4);
    expect(buffer.byteLength).toBe(44 + 3 * 4);
    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(0);
    expect(view.getInt16(48, true)).toBe(0);
    expect(view.getInt16(50, true)).toBe(32767);
    expect(view.getInt16(52, true)).toBe(-32768);
    expect(view.getInt16(54, true)).toBe(-32768);
  });
});
