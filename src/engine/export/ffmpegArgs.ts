// Argumentos puros do ffmpeg.wasm: montagem do vídeo (quadros JPEG + WAV) e do MP3 a partir do WAV.
// Sem efeitos colaterais, para ser testado sem carregar o núcleo do ffmpeg.
import type { ResolvedExport } from '../../types/export';

/** Nome do arquivo de áudio WAV no sistema de arquivos virtual. */
export const AUDIO_INPUT = 'audio.wav';

/** Padrão dos quadros JPEG no sistema de arquivos virtual (começa em 0). */
export const FRAME_PATTERN = 'frame%06d.jpg';

/** Nome de saída do vídeo com a extensão do formato. */
export function videoOutputName(format: ResolvedExport['format']): string {
  if (format !== 'mp4' && format !== 'webm') {
    throw new Error(`ffmpeg-unsupported-format:${format}`);
  }
  return `out.${format}`;
}

/** Argumentos do ffmpeg para montar o vídeo a partir dos quadros (e do WAV, se houver). */
export function videoArgs(config: ResolvedExport, hasAudio: boolean): string[] {
  const output = videoOutputName(config.format);
  const args: string[] = ['-framerate', String(config.fps), '-start_number', '0', '-i', FRAME_PATTERN];
  if (hasAudio) {
    args.push('-i', AUDIO_INPUT);
  }

  if (config.format === 'mp4') {
    args.push(
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-pix_fmt', 'yuv420p',
      '-b:v', String(config.videoBitrate),
      '-movflags', '+faststart',
    );
    if (hasAudio) args.push('-c:a', 'aac', '-b:a', '192k');
  } else {
    args.push(
      '-c:v', 'libvpx-vp9',
      '-b:v', String(config.videoBitrate),
      '-deadline', 'realtime',
      '-cpu-used', '8',
    );
    if (hasAudio) args.push('-c:a', 'libopus');
  }

  if (hasAudio) args.push('-shortest');
  args.push(output);
  return args;
}

/** Argumentos do ffmpeg para converter o WAV em MP3 com a taxa em kbps. */
export function mp3Args(kbps: number): string[] {
  if (!Number.isInteger(kbps) || kbps <= 0) {
    throw new Error('ffmpeg-invalid-mp3-bitrate');
  }
  return ['-i', AUDIO_INPUT, '-c:a', 'libmp3lame', '-b:a', `${kbps}k`, 'out.mp3'];
}

/** Argumentos do ffmpeg para juntar o WAV em AAC ao MP4 só de vídeo, copiando o vídeo sem recodificar. */
export function aacMuxArgs(kbps: number): string[] {
  if (!Number.isInteger(kbps) || kbps <= 0) {
    throw new Error('ffmpeg-invalid-aac-bitrate');
  }
  return [
    '-i', 'video.mp4',
    '-i', AUDIO_INPUT,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', `${kbps}k`,
    '-shortest',
    '-movflags', '+faststart',
    'out.mp4',
  ];
}
