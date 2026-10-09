/// <reference lib="webworker" />
// Worker de batidas: recebe o áudio mono de um trecho e devolve os instantes dos ataques e o BPM.
import { detectOnsets, estimateTempo } from '../audio/beatDetect';
import type { BeatsRequest, BeatsResponse } from '../audio/beatsClient';

const scope = self as unknown as DedicatedWorkerGlobalScope;

/** Analisa um pedido e responde com as batidas, ou com a mensagem de erro. */
function handleRequest(request: BeatsRequest): void {
  try {
    const onsetsMs = detectOnsets(request.mono, request.sampleRate, { sensitivity: request.sensitivity });
    const response: BeatsResponse = {
      type: 'done',
      jobId: request.jobId,
      onsetsMs,
      bpm: estimateTempo(onsetsMs),
    };
    scope.postMessage(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha na detecção de batidas.';
    const response: BeatsResponse = { type: 'error', jobId: request.jobId, message };
    scope.postMessage(response);
  }
}

scope.onmessage = (event: MessageEvent<BeatsRequest>) => handleRequest(event.data);
