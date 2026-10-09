/// <reference lib="webworker" />
// Worker de esticamento de áudio (WSOLA): recebe os canais de um trecho e devolve os canais esticados.
import { wsolaStretch } from '../audio/timeStretch';

const scope = self as unknown as DedicatedWorkerGlobalScope;

/** Pedido de esticamento: os canais são transferidos (não copiados) ao worker. */
export interface StretchRequest {
  type: 'stretch';
  requestId: number;
  channels: Float32Array<ArrayBuffer>[];
  sampleRate: number;
  /** Taxa de esticamento (2 = metade da duração). */
  rate: number;
}

/** Resposta de sucesso: os canais esticados, transferidos de volta. */
export interface StretchDoneResponse {
  type: 'done';
  requestId: number;
  channels: Float32Array<ArrayBuffer>[];
}

/** Resposta de erro para um pedido. */
export interface StretchErrorResponse {
  type: 'error';
  requestId: number;
  message: string;
}

/** União das respostas do worker de esticamento. */
export type StretchResponse = StretchDoneResponse | StretchErrorResponse;

/** Processa um pedido: estica cada canal com o mesmo algoritmo e a mesma taxa. */
function handleRequest(request: StretchRequest): StretchDoneResponse {
  const channels = request.channels.map((channel) =>
    wsolaStretch(channel, request.sampleRate, request.rate),
  );
  return { type: 'done', requestId: request.requestId, channels };
}

scope.onmessage = (event: MessageEvent<StretchRequest>) => {
  const request = event.data;
  try {
    const response = handleRequest(request);
    scope.postMessage(response, response.channels.map((channel) => channel.buffer));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const response: StretchErrorResponse = { type: 'error', requestId: request.requestId, message };
    scope.postMessage(response);
  }
};
