// Cliente do worker de esticamento: um único worker, criado na primeira necessidade, com pedidos por requestId.
import type { StretchRequest, StretchResponse } from '../workers/stretch.worker';
import StretchWorker from '../workers/stretch.worker?worker&inline';

interface PendingStretch {
  resolve: (channels: Float32Array<ArrayBuffer>[]) => void;
  reject: (error: Error) => void;
}

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, PendingStretch>();

/** Devolve o worker único, criando-o na primeira necessidade. */
function getWorker(): Worker {
  if (worker !== null) {
    return worker;
  }
  const created = new StretchWorker();
  created.onmessage = (event: MessageEvent<StretchResponse>) => {
    const response = event.data;
    const entry = pending.get(response.requestId);
    if (entry === undefined) {
      return;
    }
    pending.delete(response.requestId);
    if (response.type === 'error') {
      entry.reject(new Error(response.message));
    } else {
      entry.resolve(response.channels);
    }
  };
  created.onerror = (event: ErrorEvent) => {
    rejectAll(new Error(event.message || 'Falha no worker de esticamento de áudio'));
    worker = null;
    created.terminate();
  };
  worker = created;
  return created;
}

/** Rejeita todos os pedidos pendentes com o mesmo erro. */
function rejectAll(error: Error): void {
  for (const entry of pending.values()) {
    entry.reject(error);
  }
  pending.clear();
}

/**
 * Estica cada canal pelo worker (WSOLA, tom preservado) e devolve os canais novos.
 * Os canais de entrada são transferidos ao worker: o chamador não pode mais usá-los depois.
 */
export function stretchChannels(
  channels: Float32Array<ArrayBuffer>[],
  sampleRate: number,
  rate: number,
): Promise<Float32Array<ArrayBuffer>[]> {
  const requestId = nextRequestId++;
  const target = getWorker();
  const request: StretchRequest = { type: 'stretch', requestId, channels, sampleRate, rate };
  return new Promise<Float32Array<ArrayBuffer>[]>((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    target.postMessage(request, channels.map((channel) => channel.buffer));
  });
}
