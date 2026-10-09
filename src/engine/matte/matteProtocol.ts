// Contrato de mensagens entre o cliente da máscara e o worker de segmentação.
import type { Asset } from '../../types/project';

/** Fases da geração: baixar o modelo e segmentar os quadros. */
export type MattePhase = 'download' | 'process';

/** Pedido para gerar a máscara do trecho [startMediaMs, endMediaMs) de um asset de vídeo. */
export interface MatteJobRequest {
  type: 'generate';
  jobId: number;
  asset: Asset;
  startMediaMs: number;
  endMediaMs: number;
  /** URL da pasta public/ort/ de onde o worker carrega o runtime ONNX. */
  ortBaseUrl: string;
}

/** Progresso de uma geração. */
export interface MatteProgressResponse {
  type: 'progress';
  jobId: number;
  phase: MattePhase;
  /** Fração de 0 a 1 dentro da fase. */
  fraction: number;
}

/** Geração concluída: MP4 da máscara em tons de cinza (o buffer é transferido). */
export interface MatteDoneResponse {
  type: 'done';
  jobId: number;
  data: ArrayBuffer;
}

/** Falha de uma geração, com a fase em que ocorreu. */
export interface MatteErrorResponse {
  type: 'error';
  jobId: number;
  phase: MattePhase;
  message: string;
}

/** Mensagens da thread principal para o worker. */
export type MatteRequest = MatteJobRequest;

/** Mensagens do worker para a thread principal. */
export type MatteResponse = MatteProgressResponse | MatteDoneResponse | MatteErrorResponse;
