// Exportação só de áudio em MP3: WAV do áudio mixado convertido pelo ffmpeg.wasm.
import type { FFmpeg } from '@ffmpeg/ffmpeg';
import type { MixedAudio } from '../../types/export';
import { encodeWav } from './wavEncoder';
import { AUDIO_INPUT, mp3Args } from './ffmpegArgs';
import { abortError, loadFfmpeg, readOutput, removeFiles, terminateFfmpeg, throwIfAborted } from './ffmpegLoader';

/** Nome do MP3 de saída no sistema de arquivos virtual. */
const MP3_OUTPUT = 'out.mp3';

/** Converte o áudio mixado em MP3; onProgress recebe a fração 0..1; cancelar encerra o ffmpeg e lança AbortError. */
export async function exportMp3(
  audio: MixedAudio,
  kbps: number,
  onProgress: (progress: number) => void,
  signal: AbortSignal,
): Promise<ArrayBuffer> {
  throwIfAborted(signal);
  const ffmpeg = await loadFfmpeg();
  const onAbort = (): void => {
    terminateFfmpeg();
  };
  const onFfmpegProgress = (event: { progress: number }): void => {
    if (!Number.isFinite(event.progress)) return;
    onProgress(Math.min(1, Math.max(0, event.progress)));
  };

  signal.addEventListener('abort', onAbort, { once: true });
  ffmpeg.on('progress', onFfmpegProgress);
  try {
    await ffmpeg.writeFile(AUDIO_INPUT, new Uint8Array(encodeWav(audio)));
    throwIfAborted(signal);
    const code = await ffmpeg.exec(mp3Args(kbps), -1, { signal });
    throwIfAborted(signal);
    if (code !== 0) throw new Error(`ffmpeg-exec-failed:${code}`);
    return await readOutput(ffmpeg, MP3_OUTPUT);
  } catch (error: unknown) {
    if (signal.aborted) throw abortError();
    throw error;
  } finally {
    signal.removeEventListener('abort', onAbort);
    ffmpeg.off('progress', onFfmpegProgress);
    if (!signal.aborted) await cleanup(ffmpeg);
  }
}

/** Apaga os arquivos temporários do sistema virtual. */
async function cleanup(ffmpeg: FFmpeg): Promise<void> {
  await removeFiles(ffmpeg, [AUDIO_INPUT, MP3_OUTPUT]);
}
