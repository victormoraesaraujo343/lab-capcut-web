/** Requisição: gera miniaturas JPEG de frames e grava no armazenamento. */
export interface ThumbsRequest {
  type: 'thumbs';
  requestId: number;
  frames: ImageBitmap[];
  basePath: string;
  startIndex: number;
  targetWidth: number;
}

/** Requisição: calcula picos normalizados de forma de onda a partir dos canais. */
export interface PeaksRequest {
  type: 'peaks';
  requestId: number;
  channels: Float32Array[];
  buckets: number;
}

/** União de todas as requisições enviadas ao worker de mídia. */
export type MediaRequest = ThumbsRequest | PeaksRequest;

/** Resposta: miniaturas gravadas, na ordem das requisições. */
export interface ThumbsDoneResponse {
  type: 'thumbs-done';
  requestId: number;
  paths: string[];
}

/** Resposta: picos calculados. */
export interface PeaksDoneResponse {
  type: 'peaks-done';
  requestId: number;
  peaks: number[];
}

/** Resposta de erro para uma requisição. */
export interface MediaErrorResponse {
  type: 'error';
  requestId: number;
  message: string;
}

/** União de todas as respostas do worker de mídia. */
export type MediaResponse = ThumbsDoneResponse | PeaksDoneResponse | MediaErrorResponse;

/** Nome do arquivo de miniatura para um índice, com 4 dígitos (ex.: 0007.jpg). */
export function thumbFileName(index: number): string {
  return `${index.toString().padStart(4, '0')}.jpg`;
}
