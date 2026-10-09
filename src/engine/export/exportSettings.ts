// Configurações de exportação: converte as escolhas da pessoa nos números finais que o codificador usa.
import type {
  BitratePreset,
  ExportSettings,
  ResolutionPreset,
  ResolvedExport,
} from '../../types/export';
import type { Project } from '../../types/project';

/** Duração máxima de um GIF exportado, em ms. */
export const GIF_MAX_MS = 15000;

/** Configuração padrão do diálogo de exportação. */
export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  format: 'mp4',
  resolution: '1080p',
  fps: 30,
  bitrate: 'medium',
  customBitrateMbps: 12,
  fileName: '',
};

/** Tamanho do lado menor do quadro para cada predefinição. */
const SHORT_SIDE: Record<ResolutionPreset, number> = {
  '720p': 720,
  '1080p': 1080,
  '1440p': 1440,
  '4k': 2160,
};

/** Bits por pixel e por quadro para cada predefinição de qualidade. */
const BITS_PER_PIXEL_FRAME: Record<Exclude<BitratePreset, 'custom'>, number> = {
  low: 0.05,
  medium: 0.09,
  high: 0.15,
};

const MIN_BITRATE = 1_000_000;
const MAX_BITRATE = 200_000_000;
const MP4_AUDIO_BITRATE = 192_000;
const WEBM_AUDIO_BITRATE = 160_000;
const MP3_BITRATE = 192_000;
/** 48 kHz, 2 canais, 16 bits: 1 536 000 bits/s. */
const WAV_BITRATE = 1_536_000;
const WAV_BYTES_PER_SECOND = 48000 * 2 * 2;
const GIF_MAX_WIDTH = 480;
const GIF_MAX_FPS = 15;
const GIF_BYTES_PER_PIXEL_FRAME = 0.15;
const KEYFRAME_SECONDS = 2;
const INVALID_FILE_CHARS = /[\\/:*?"<>|]/g;

/** Níveis H.264 (macroblocos por quadro e por segundo), do menor para o maior. */
const AVC_LEVELS: ReadonlyArray<{ hex: string; maxFrameMbs: number; maxMbPerSec: number }> = [
  { hex: '1F', maxFrameMbs: 3600, maxMbPerSec: 108000 },
  { hex: '20', maxFrameMbs: 5120, maxMbPerSec: 216000 },
  { hex: '28', maxFrameMbs: 8192, maxMbPerSec: 245760 },
  { hex: '2A', maxFrameMbs: 8704, maxMbPerSec: 522240 },
  { hex: '32', maxFrameMbs: 22080, maxMbPerSec: 589824 },
  { hex: '33', maxFrameMbs: 36864, maxMbPerSec: 983040 },
  { hex: '34', maxFrameMbs: 36864, maxMbPerSec: 2073600 },
];

/** Níveis VP9 (taxa de amostras e tamanho de quadro), do menor para o maior. */
const VP9_LEVELS: ReadonlyArray<{ level: string; maxSampleRate: number; maxPicture: number }> = [
  { level: '31', maxSampleRate: 36_864_000, maxPicture: 983_040 },
  { level: '40', maxSampleRate: 83_558_400, maxPicture: 2_228_224 },
  { level: '41', maxSampleRate: 160_432_128, maxPicture: 2_228_224 },
  { level: '50', maxSampleRate: 311_951_360, maxPicture: 8_912_896 },
  { level: '51', maxSampleRate: 588_251_136, maxPicture: 8_912_896 },
];

/** Arredonda para o par mais próximo (mínimo 2), exigido por H.264 e VP9. */
function evenSize(n: number): number {
  return Math.max(2, 2 * Math.round(n / 2));
}

/** Limita a taxa de bits entre 1 e 200 Mbps. */
function clampBitrate(bps: number): number {
  if (Number.isNaN(bps)) return MIN_BITRATE;
  return Math.min(MAX_BITRATE, Math.max(MIN_BITRATE, Math.round(bps)));
}

/** Quadros-chave a cada 2 segundos. */
function keyFrameInterval(fps: number): number {
  return Math.round(fps * KEYFRAME_SECONDS);
}

/** Calcula o tamanho de saída: o lado menor vira a predefinição e a proporção do projeto se mantém. */
export function outputSize(
  projectW: number,
  projectH: number,
  resolution: ResolutionPreset,
): { width: number; height: number } {
  const target = SHORT_SIDE[resolution];
  const w = projectW > 0 ? projectW : 16;
  const h = projectH > 0 ? projectH : 9;
  if (w >= h) {
    return { width: evenSize((w * target) / h), height: evenSize(target) };
  }
  return { width: evenSize(target), height: evenSize((h * target) / w) };
}

/** Taxa de bits do vídeo em bits/s: predefinição (bits por pixel·quadro) ou valor personalizado em Mbps. */
export function videoBitrate(
  width: number,
  height: number,
  fps: number,
  preset: BitratePreset,
  customMbps: number,
): number {
  if (preset === 'custom') return clampBitrate(customMbps * 1_000_000);
  return clampBitrate(BITS_PER_PIXEL_FRAME[preset] * width * height * fps);
}

/** Codec AVC (H.264 High) com o nível escolhido pelo tamanho em macroblocos e pela taxa de macroblocos. */
export function avcCodec(width: number, height: number, fps: number): string {
  const frameMbs = Math.ceil(width / 16) * Math.ceil(height / 16);
  const mbPerSec = frameMbs * fps;
  const level =
    AVC_LEVELS.find((l) => frameMbs <= l.maxFrameMbs && mbPerSec <= l.maxMbPerSec) ??
    AVC_LEVELS[AVC_LEVELS.length - 1];
  return `avc1.6400${level?.hex ?? '34'}`;
}

/** Codec VP9 (profil 0, 8 bits) com o nível escolhido pelo tamanho do quadro e pela taxa de amostras. */
export function vp9Codec(width: number, height: number, fps: number): string {
  const picture = width * height;
  const sampleRate = picture * fps;
  const level =
    VP9_LEVELS.find((l) => picture <= l.maxPicture && sampleRate <= l.maxSampleRate) ??
    VP9_LEVELS[VP9_LEVELS.length - 1];
  return `vp09.00.${level?.level ?? '51'}.08`;
}

/** Remove caracteres inválidos em nomes de arquivo e apara os espaços das pontas. */
export function sanitizeFileName(name: string): string {
  return name.replace(INVALID_FILE_CHARS, '').trim();
}

/** Nome base do arquivo: o nome escolhido, depois o nome do projeto, depois 'video'. */
function baseFileName(fileName: string, projectName: string): string {
  return sanitizeFileName(fileName) || sanitizeFileName(projectName) || 'video';
}

/** Converte as configurações escolhidas nos números finais para o codificador. */
export function resolveExport(project: Project, settings: ExportSettings): ResolvedExport {
  const base = baseFileName(settings.fileName, project.name);
  const sized = outputSize(project.width, project.height, settings.resolution);
  const fullEndMs = Math.max(0, project.durationMs);
  const common = { startMs: 0, audioBitrate: 0, audioCodec: '', videoCodec: '' };

  switch (settings.format) {
    case 'mp4':
    case 'webm': {
      const { width, height } = sized;
      const fps = settings.fps;
      const isMp4 = settings.format === 'mp4';
      return {
        ...common,
        format: settings.format,
        width,
        height,
        fps,
        videoBitrate: videoBitrate(width, height, fps, settings.bitrate, settings.customBitrateMbps),
        audioBitrate: isMp4 ? MP4_AUDIO_BITRATE : WEBM_AUDIO_BITRATE,
        videoCodec: isMp4 ? avcCodec(width, height, fps) : vp9Codec(width, height, fps),
        audioCodec: isMp4 ? 'mp4a.40.2' : 'opus',
        keyFrameInterval: keyFrameInterval(fps),
        endMs: fullEndMs,
        fileName: `${base}.${isMp4 ? 'mp4' : 'webm'}`,
        mimeType: isMp4 ? 'video/mp4' : 'video/webm',
      };
    }
    case 'gif': {
      const width = Math.min(sized.width, GIF_MAX_WIDTH);
      const height = evenSize((sized.height * width) / sized.width);
      const fps = Math.min(settings.fps, GIF_MAX_FPS);
      return {
        ...common,
        format: 'gif',
        width,
        height,
        fps,
        videoBitrate: videoBitrate(width, height, fps, settings.bitrate, settings.customBitrateMbps),
        keyFrameInterval: keyFrameInterval(fps),
        endMs: Math.min(fullEndMs, GIF_MAX_MS),
        fileName: `${base}.gif`,
        mimeType: 'image/gif',
      };
    }
    case 'wav':
      return {
        ...common,
        format: 'wav',
        width: 0,
        height: 0,
        fps: 0,
        videoBitrate: 0,
        keyFrameInterval: 0,
        audioBitrate: WAV_BITRATE,
        audioCodec: 'pcm',
        endMs: fullEndMs,
        fileName: `${base}.wav`,
        mimeType: 'audio/wav',
      };
    case 'mp3':
      return {
        ...common,
        format: 'mp3',
        width: 0,
        height: 0,
        fps: 0,
        videoBitrate: 0,
        keyFrameInterval: 0,
        audioBitrate: MP3_BITRATE,
        audioCodec: 'mp3',
        endMs: fullEndMs,
        fileName: `${base}.mp3`,
        mimeType: 'audio/mpeg',
      };
  }
}

/** Tamanho estimado do arquivo final em bytes. */
export function estimateSizeBytes(r: ResolvedExport): number {
  const seconds = Math.max(0, r.endMs - r.startMs) / 1000;
  if (r.format === 'gif') {
    return Math.round(r.width * r.height * r.fps * seconds * GIF_BYTES_PER_PIXEL_FRAME);
  }
  if (r.format === 'wav') {
    return Math.round(WAV_BYTES_PER_SECOND * seconds);
  }
  return Math.round(((r.videoBitrate + r.audioBitrate) * seconds) / 8);
}
