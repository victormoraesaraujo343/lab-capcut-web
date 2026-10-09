import { describe, expect, it } from 'vitest';
import { aacMuxArgs, mp3Args, videoArgs } from '../src/engine/export/ffmpegArgs';
import type { ResolvedExport } from '../src/types/export';

/** Configuração de exemplo para os testes de argumentos. */
function config(overrides: Partial<ResolvedExport> = {}): ResolvedExport {
  return {
    format: 'mp4',
    width: 1280,
    height: 720,
    fps: 30,
    videoBitrate: 8_000_000,
    audioBitrate: 192_000,
    videoCodec: 'avc1.640028',
    audioCodec: 'mp4a.40.2',
    keyFrameInterval: 60,
    startMs: 0,
    endMs: 5000,
    fileName: 'reserva.mp4',
    mimeType: 'video/mp4',
    ...overrides,
  };
}

/** Valor que segue uma opção nos argumentos. */
function valueAfter(args: string[], option: string): string | undefined {
  const index = args.indexOf(option);
  return index === -1 ? undefined : args[index + 1];
}

describe('videoArgs', () => {
  it('lê os quadros JPEG como sequência com a taxa de quadros e início em 0', () => {
    const args = videoArgs(config(), false);
    expect(valueAfter(args, '-framerate')).toBe('30');
    expect(valueAfter(args, '-start_number')).toBe('0');
    expect(valueAfter(args, '-i')).toBe('frame%06d.jpg');
  });

  it('monta MP4 com H.264, yuv420p, faststart e a taxa de bits', () => {
    const args = videoArgs(config(), false);
    expect(valueAfter(args, '-c:v')).toBe('libx264');
    expect(valueAfter(args, '-preset')).toBe('veryfast');
    expect(valueAfter(args, '-pix_fmt')).toBe('yuv420p');
    expect(valueAfter(args, '-b:v')).toBe('8000000');
    expect(args).toContain('+faststart');
    expect(args[args.length - 1]).toBe('out.mp4');
  });

  it('adiciona AAC 192k e entrada de áudio quando há áudio', () => {
    const args = videoArgs(config(), true);
    expect(valueAfter(args, '-i')).toBe('frame%06d.jpg');
    expect(args).toContain('audio.wav');
    expect(valueAfter(args, '-c:a')).toBe('aac');
    expect(valueAfter(args, '-b:a')).toBe('192k');
    expect(args).toContain('-shortest');
  });

  it('não cria trilha de áudio quando não há áudio', () => {
    const args = videoArgs(config(), false);
    expect(args).not.toContain('audio.wav');
    expect(args).not.toContain('-c:a');
  });

  it('monta WebM com VP9 em modo realtime e Opus', () => {
    const args = videoArgs(config({ format: 'webm', fileName: 'reserva.webm', mimeType: 'video/webm' }), true);
    expect(valueAfter(args, '-c:v')).toBe('libvpx-vp9');
    expect(valueAfter(args, '-b:v')).toBe('8000000');
    expect(valueAfter(args, '-deadline')).toBe('realtime');
    expect(valueAfter(args, '-cpu-used')).toBe('8');
    expect(valueAfter(args, '-c:a')).toBe('libopus');
    expect(args).not.toContain('libx264');
    expect(args[args.length - 1]).toBe('out.webm');
  });

  it('recusa formatos que não são vídeo do ffmpeg', () => {
    expect(() => videoArgs(config({ format: 'gif' }), false)).toThrow('ffmpeg-unsupported-format:gif');
    expect(() => videoArgs(config({ format: 'wav' }), true)).toThrow('ffmpeg-unsupported-format:wav');
  });
});

describe('mp3Args', () => {
  it('converte audio.wav em MP3 com a taxa pedida', () => {
    expect(mp3Args(192)).toEqual(['-i', 'audio.wav', '-c:a', 'libmp3lame', '-b:a', '192k', 'out.mp3']);
  });

  it('recusa taxas que não são inteiros positivos', () => {
    expect(() => mp3Args(0)).toThrow('ffmpeg-invalid-mp3-bitrate');
    expect(() => mp3Args(-128)).toThrow('ffmpeg-invalid-mp3-bitrate');
    expect(() => mp3Args(128.5)).toThrow('ffmpeg-invalid-mp3-bitrate');
  });
});

describe('aacMuxArgs', () => {
  it('junta o vídeo copiado com o áudio WAV recodificado em AAC', () => {
    expect(aacMuxArgs(192)).toEqual([
      '-i', 'video.mp4',
      '-i', 'audio.wav',
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      '-movflags', '+faststart',
      'out.mp4',
    ]);
  });

  it('nunca recodifica o vídeo', () => {
    const args = aacMuxArgs(128);
    expect(valueAfter(args, '-c:v')).toBe('copy');
    expect(args).not.toContain('libx264');
  });

  it('usa a taxa pedida no áudio', () => {
    expect(valueAfter(aacMuxArgs(256), '-b:a')).toBe('256k');
  });

  it('recusa taxas que não são inteiros positivos', () => {
    expect(() => aacMuxArgs(0)).toThrow('ffmpeg-invalid-aac-bitrate');
    expect(() => aacMuxArgs(-192)).toThrow('ffmpeg-invalid-aac-bitrate');
    expect(() => aacMuxArgs(192.5)).toThrow('ffmpeg-invalid-aac-bitrate');
  });
});
