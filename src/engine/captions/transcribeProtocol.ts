// Contrato de mensagens entre o cliente de transcrição e o worker do Whisper.
import type { TimedText } from './captionSegmenter';

/** Idiomas aceitos pela transcrição; 'auto' deixa o modelo detectar. */
export type TranscribeLanguage = 'auto' | 'pt' | 'en' | 'es';

/** Tamanhos de modelo Whisper disponíveis. */
export type WhisperModelSize = 'tiny' | 'base';

/** Fases mostradas no progresso: baixar o modelo e transcrever o áudio. */
export type TranscribePhase = 'download' | 'transcribe';

/** Pedido de transcrição do áudio mono de 16 kHz. */
export interface TranscribeJobRequest {
  type: 'transcribe';
  jobId: number;
  audio: Float32Array;
  language: TranscribeLanguage;
  model: WhisperModelSize;
  /** URL da pasta public/ort/ de onde o worker carrega o runtime ONNX. */
  ortBaseUrl: string;
}

/** Pedido para marcar um job como cancelado. */
export interface TranscribeCancelRequest {
  type: 'cancel';
  jobId: number;
}

/** Mensagens da thread principal para o worker. */
export type TranscribeRequest = TranscribeJobRequest | TranscribeCancelRequest;

/** Progresso de um job. */
export interface TranscribeProgressResponse {
  type: 'progress';
  jobId: number;
  phase: TranscribePhase;
  /** Fração de 0 a 1 dentro da fase. */
  fraction: number;
}

/** Job concluído com os trechos de texto e seus tempos. */
export interface TranscribeDoneResponse {
  type: 'done';
  jobId: number;
  chunks: TimedText[];
}

/** Falha de um job, com mensagem técnica. */
export interface TranscribeErrorResponse {
  type: 'error';
  jobId: number;
  message: string;
}

/** Mensagens do worker para a thread principal. */
export type TranscribeResponse = TranscribeProgressResponse | TranscribeDoneResponse | TranscribeErrorResponse;
