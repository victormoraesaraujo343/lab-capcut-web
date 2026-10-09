// Tipos da exportação: configurações escolhidas, mensagens do worker e áudio mixado.
// Contrato compartilhado entre o diálogo de exportação, o cliente, o worker e os codificadores.
import type { Project } from './project';

/** Formatos de saída. 'mp4' = H.264 + AAC; 'webm' = VP9 + Opus; 'gif' até 15 s; 'wav'/'mp3' só áudio. */
export type ExportFormat = 'mp4' | 'webm' | 'gif' | 'wav' | 'mp3';

/** Predefinições de resolução (lado menor do quadro). */
export type ResolutionPreset = '720p' | '1080p' | '1440p' | '4k';

/** Predefinições de taxa de bits. */
export type BitratePreset = 'low' | 'medium' | 'high' | 'custom';

/** Configuração escolhida pela pessoa no diálogo. */
export interface ExportSettings {
  format: ExportFormat;
  resolution: ResolutionPreset;
  fps: 24 | 30 | 60;
  bitrate: BitratePreset;
  /** Usado quando bitrate = 'custom', em Mbps. */
  customBitrateMbps: number;
  /** Nome do arquivo sem extensão. */
  fileName: string;
}

/** Configuração resolvida para o codificador (números finais). */
export interface ResolvedExport {
  format: ExportFormat;
  /** Largura de saída em px (par). */
  width: number;
  /** Altura de saída em px (par). */
  height: number;
  fps: number;
  /** Taxa de bits do vídeo em bits/s. */
  videoBitrate: number;
  /** Taxa de bits do áudio em bits/s. */
  audioBitrate: number;
  /** Codec WebCodecs do vídeo (ex. 'avc1.640028', 'vp09.00.40.08'); vazio para formatos só de áudio. */
  videoCodec: string;
  /** Codec WebCodecs do áudio (ex. 'mp4a.40.2', 'opus'); vazio para GIF. */
  audioCodec: string;
  /** Intervalo entre quadros-chave, em quadros. */
  keyFrameInterval: number;
  /** Intervalo exportado da linha do tempo, em ms. */
  startMs: number;
  endMs: number;
  /** Nome final do arquivo com extensão. */
  fileName: string;
  /** Tipo MIME do arquivo final. */
  mimeType: string;
}

/** Áudio já mixado do projeto (feito na thread principal com OfflineAudioContext), pronto para codificar. */
export interface MixedAudio {
  sampleRate: number;
  /** Um Float32Array por canal (2 = estéreo). */
  channels: Float32Array[];
}

/** Mensagem da thread principal para o worker de exportação. */
export type ExportRequest =
  | { type: 'start'; jobId: number; project: Project; config: ResolvedExport; audio: MixedAudio | null }
  | { type: 'cancel'; jobId: number };

/** Fases da exportação mostradas na barra de progresso. */
export type ExportPhase = 'preparing' | 'audio' | 'video' | 'finalizing';

/** Mensagem do worker de exportação para a thread principal. */
export type ExportResponse =
  | { type: 'progress'; jobId: number; phase: ExportPhase; done: number; total: number }
  | { type: 'done'; jobId: number; data: ArrayBuffer; mimeType: string; fileName: string }
  | { type: 'error'; jobId: number; code: ExportErrorCode; message: string }
  | { type: 'cancelled'; jobId: number };

/** Códigos de erro mostrados em pt-BR pelo diálogo. */
export type ExportErrorCode = 'unsupported-codec' | 'no-webcodecs' | 'decode' | 'encode' | 'memory' | 'empty' | 'generic';
