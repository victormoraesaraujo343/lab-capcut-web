// Montagem do arquivo final: MP4 (H.264 + AAC) ou WebM (VP9 + Opus), inteiro em memória.
import { ArrayBufferTarget as Mp4Target, Muxer as Mp4Muxer } from 'mp4-muxer';
import { ArrayBufferTarget as WebmTarget, Muxer as WebmMuxer } from 'webm-muxer';
import type { ResolvedExport } from '../../types/export';

/** Taxa de amostragem usada quando o áudio não informa a sua. */
const DEFAULT_SAMPLE_RATE = 48_000;

/** Contêiner da exportação: recebe os blocos codificados e devolve o arquivo pronto. */
export interface ExportMuxer {
  /** Adiciona um bloco de vídeo codificado com os metadados do codificador. */
  addVideoChunk(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): void;
  /** Adiciona um bloco de áudio codificado com os metadados do codificador. */
  addAudioChunk(chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata): void;
  /** Fecha o arquivo e devolve os bytes (ArrayBuffer transferível). */
  finalize(): ArrayBuffer;
}

/**
 * Cria o muxer do formato escolhido. sampleRate é o do áudio mixado (o ResolvedExport não o traz).
 * Lança 'format-unsupported' para formatos que não são contêiner de vídeo.
 */
export function createMuxer(config: ResolvedExport, hasAudio: boolean, sampleRate?: number): ExportMuxer {
  const rate = sampleRate ?? DEFAULT_SAMPLE_RATE;
  if (config.format === 'mp4') {
    return createMp4(config, hasAudio, rate);
  }
  if (config.format === 'webm') {
    return createWebm(config, hasAudio, rate);
  }
  throw new Error('format-unsupported');
}

/** Muxer MP4 com faststart em memória; o primeiro quadro-chave leva o avcC via metadados do codificador. */
function createMp4(config: ResolvedExport, hasAudio: boolean, sampleRate: number): ExportMuxer {
  const target = new Mp4Target();
  const muxer = new Mp4Muxer({
    target,
    video: { codec: 'avc', width: config.width, height: config.height, frameRate: config.fps },
    audio: hasAudio ? { codec: 'aac', numberOfChannels: 2, sampleRate } : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });
  return {
    addVideoChunk: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    addAudioChunk: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    finalize: () => {
      muxer.finalize();
      return target.buffer;
    },
  };
}

/** Muxer WebM (Matroska) com VP9 e Opus. */
function createWebm(config: ResolvedExport, hasAudio: boolean, sampleRate: number): ExportMuxer {
  const target = new WebmTarget();
  const muxer = new WebmMuxer({
    target,
    video: { codec: 'V_VP9', width: config.width, height: config.height, frameRate: config.fps },
    audio: hasAudio ? { codec: 'A_OPUS', numberOfChannels: 2, sampleRate } : undefined,
    firstTimestampBehavior: 'offset',
  });
  return {
    addVideoChunk: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    addAudioChunk: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    finalize: () => {
      muxer.finalize();
      return target.buffer;
    },
  };
}
