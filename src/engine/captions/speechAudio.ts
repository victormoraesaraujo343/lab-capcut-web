// Prepara o áudio do projeto para o Whisper: mixagem em 16 kHz e downmix para mono.
import type { Project } from '../../types/project';
import { mixProjectAudio } from '../audio/offlineMix';

/** Taxa de amostragem exigida pelo Whisper, em Hz. */
export const SPEECH_SAMPLE_RATE = 16000;

/** Faz a média dos canais e devolve um único canal mono; comprimento = menor canal. */
export function downmixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) {
    return new Float32Array(0);
  }
  const length = Math.min(...channels.map((channel) => channel.length));
  const mono = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const channel of channels) {
      sum += channel[i] ?? 0;
    }
    mono[i] = sum / channels.length;
  }
  return mono;
}

/** Mixa o áudio do intervalo em 16 kHz mono; null se o intervalo não tiver som. */
export async function prepareSpeechAudio(
  project: Project,
  range: { startMs: number; endMs: number },
  signal?: AbortSignal,
): Promise<Float32Array | null> {
  const mixed = await mixProjectAudio(project, range.startMs, range.endMs, {
    sampleRate: SPEECH_SAMPLE_RATE,
    signal,
  });
  if (mixed === null) {
    return null;
  }
  return downmixToMono(mixed.channels);
}
