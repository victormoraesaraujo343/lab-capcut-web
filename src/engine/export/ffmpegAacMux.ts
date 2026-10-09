// Junta áudio AAC a um MP4 só de vídeo com ffmpeg.wasm, copiando o vídeo sem recodificar.
import type { FFmpeg } from '@ffmpeg/ffmpeg';
import type { MixedAudio } from '../../types/export';
import { encodeWav } from './wavEncoder';
import { AUDIO_INPUT, aacMuxArgs } from './ffmpegArgs';
import { abortError, loadFfmpeg, readOutput, removeFiles, terminateFfmpeg, throwIfAborted } from './ffmpegLoader';

/** Nome do MP4 só de vídeo de entrada no sistema de arquivos virtual. */
const VIDEO_INPUT = 'video.mp4';
/** Nome do MP4 final (vídeo copiado + AAC) no sistema de arquivos virtual. */
const MP4_OUTPUT = 'out.mp4';

/** Une o MP4 só de vídeo ao áudio mixado em AAC; onProgress recebe a fração 0..1; cancelar encerra o ffmpeg e lança AbortError. */
export async function muxAacWithFfmpeg(
  videoMp4: ArrayBuffer,
  audio: MixedAudio,
  kbps: number,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  if (signal) throwIfAborted(signal);
  const args = aacMuxArgs(kbps);
  const ffmpeg = await loadFfmpeg();
  const onAbort = (): void => {
    terminateFfmpeg();
  };
  const onFfmpegProgress = (event: { progress: number }): void => {
    if (!Number.isFinite(event.progress)) return;
    onProgress(Math.min(1, Math.max(0, event.progress)));
  };

  signal?.addEventListener('abort', onAbort, { once: true });
  ffmpeg.on('progress', onFfmpegProgress);
  try {
    await ffmpeg.writeFile(VIDEO_INPUT, new Uint8Array(videoMp4));
    await ffmpeg.writeFile(AUDIO_INPUT, new Uint8Array(encodeWav(audio)));
    if (signal) throwIfAborted(signal);
    const code = await ffmpeg.exec(args, -1, signal ? { signal } : undefined);
    if (signal) throwIfAborted(signal);
    if (code !== 0) throw new Error(`ffmpeg-exec-failed:${code}`);
    return await readOutput(ffmpeg, MP4_OUTPUT);
  } catch (error: unknown) {
    if (signal?.aborted) throw abortError();
    throw error;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    ffmpeg.off('progress', onFfmpegProgress);
    await cleanup(ffmpeg);
  }
}

/** Apaga os três arquivos temporários do sistema virtual, sempre. */
async function cleanup(ffmpeg: FFmpeg): Promise<void> {
  await removeFiles(ffmpeg, [VIDEO_INPUT, AUDIO_INPUT, MP4_OUTPUT]);
}
