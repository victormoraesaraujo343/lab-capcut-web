// Codificador WAV próprio (RIFF/PCM 16 bits little-endian, intercalado). Código puro, sem DOM.
import type { MixedAudio } from '../../types/export';

const HEADER_BYTES = 44;
const BITS_PER_SAMPLE = 16;

/** Converte uma amostra float em PCM de 16 bits: clamp em [-1, 1] e arredondamento. */
function toInt16(x: number): number {
  if (Number.isNaN(x)) return 0;
  const clamped = x < -1 ? -1 : x > 1 ? 1 : x;
  const scaled = Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff);
  return scaled < -32768 ? -32768 : scaled > 32767 ? 32767 : scaled;
}

/** Escreve uma string ASCII de 4 caracteres (ids de bloco RIFF) na posição dada. */
function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

/** Codifica o áudio mixado (um Float32Array por canal) num arquivo WAV PCM 16 bits e devolve os bytes. */
export function encodeWav(audio: MixedAudio): ArrayBuffer {
  const channels = audio.channels;
  if (channels.length < 1) {
    throw new Error('encodeWav: áudio sem canais');
  }
  const frames = channels.reduce((min, ch) => Math.min(min, ch.length), Number.POSITIVE_INFINITY);
  const sampleRate = Math.round(audio.sampleRate);
  const channelCount = channels.length;
  const bytesPerSample = BITS_PER_SAMPLE / 8;
  const blockAlign = channelCount * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataBytes = frames * blockAlign;

  const buffer = new ArrayBuffer(HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = HEADER_BYTES;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channelCount; c++) {
      const samples = channels[c];
      view.setInt16(offset, toInt16(samples ? (samples[i] ?? 0) : 0), true);
      offset += bytesPerSample;
    }
  }
  return buffer;
}
