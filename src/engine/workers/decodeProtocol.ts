// Mensagens entre a thread principal e o worker de decodificação de vídeo (WebCodecs).

/** Pede ao worker para abrir um arquivo de vídeo do OPFS e preparar o decodificador. */
export interface DecodeOpenRequest {
  type: 'open';
  requestId: number;
  assetId: string;
  opfsPath: string;
}

/** Pede o quadro do asset no instante de mídia indicado (em ms). */
export interface DecodeFrameRequest {
  type: 'frame';
  requestId: number;
  assetId: string;
  timeMs: number;
  /** true = precisa do quadro exato; false = aceita o mais próximo já pronto. */
  exact: boolean;
}

/** Pede pré-decodificação de cerca de 1s à frente (direction 1) ou atrás (direction -1) do instante. */
export interface DecodePrefetchRequest {
  type: 'prefetch';
  assetId: string;
  timeMs: number;
  direction: 1 | -1;
}

/** Libera o decodificador e os quadros em cache de um asset. */
export interface DecodeCloseRequest {
  type: 'close';
  assetId: string;
}

/** União de todas as requisições enviadas ao worker de decodificação. */
export type DecodeRequest = DecodeOpenRequest | DecodeFrameRequest | DecodePrefetchRequest | DecodeCloseRequest;

/** Resposta do pedido de abertura; ok:false traz o motivo. */
export interface DecodeOpenedResponse {
  type: 'opened';
  requestId: number;
  ok: boolean;
  reason?: string;
  width?: number;
  height?: number;
}

/** Resposta com o quadro pedido (VideoFrame transferido; o receptor deve fechá-lo) ou null. */
export interface DecodeFrameResponse {
  type: 'frame';
  requestId: number;
  frame: VideoFrame | null;
  timeMs: number;
}

/** Resposta de erro para uma requisição. */
export interface DecodeErrorResponse {
  type: 'error';
  requestId: number;
  message: string;
}

/** União de todas as respostas do worker de decodificação. */
export type DecodeResponse = DecodeOpenedResponse | DecodeFrameResponse | DecodeErrorResponse;
