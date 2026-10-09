// Cliente da máscara: mantém um único worker e gera o MP4 em tons de cinza do trecho de um asset.
import type { Asset } from '../../types/project';
import type { MattePhase, MatteRequest, MatteResponse } from './matteProtocol';

/** Progresso de uma geração: fase e fração 0 a 1 dentro dela. */
export interface MatteProgress {
  phase: MattePhase;
  fraction: number;
}

/** Falha de geração, com a fase em que ocorreu (download do modelo ou processamento). */
export class MatteError extends Error {
  /** Fase em que a falha aconteceu. */
  readonly phase: MattePhase;

  /** Cria a falha com a fase e a mensagem técnica. */
  constructor(phase: MattePhase, message: string) {
    super(message);
    this.name = 'MatteError';
    this.phase = phase;
  }
}

/** Geração aguardando resposta do worker. */
interface PendingMatte {
  resolve: (data: ArrayBuffer) => void;
  reject: (reason: unknown) => void;
  onProgress: (progress: MatteProgress) => void;
}

/** Worker único, criado sob demanda e reaproveitado entre gerações. */
let worker: Worker | null = null;
/** Gerações ainda sem resposta, por id. */
const pendingMattes = new Map<number, PendingMatte>();
/** Próximo id de geração. */
let nextJobId = 1;

/**
 * Gera a máscara do trecho [startMediaMs, endMediaMs) do asset e devolve o MP4 em tons de cinza.
 * Cancelar (signal) encerra o worker e rejeita com AbortError.
 */
export function generateMatte(
  asset: Asset,
  startMediaMs: number,
  endMediaMs: number,
  onProgress: (progress: MatteProgress) => void,
  signal: AbortSignal,
): Promise<ArrayBuffer> {
  if (signal.aborted) return Promise.reject(abortError());
  const jobId = nextJobId++;
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const detach = (): void => signal.removeEventListener('abort', onAbort);
    const onAbort = (): void => {
      const job = pendingMattes.get(jobId);
      if (job === undefined) return;
      pendingMattes.delete(jobId);
      // Encerra o worker de vez (a segmentação para de gastar CPU); as outras gerações em andamento falham.
      rejectAll(new MatteError('process', 'Geração interrompida por outro cancelamento.'));
      job.reject(abortError());
    };
    pendingMattes.set(jobId, {
      resolve: (data) => {
        detach();
        resolve(data);
      },
      reject: (reason) => {
        detach();
        reject(reason);
      },
      onProgress,
    });
    signal.addEventListener('abort', onAbort, { once: true });
    const request: MatteRequest = {
      type: 'generate',
      jobId,
      asset,
      startMediaMs,
      endMediaMs,
      ortBaseUrl: new URL('ort/', document.baseURI).href,
    };
    getWorker().postMessage(request);
  });
}

/** Cria o DOMException de cancelamento usado pelas gerações canceladas. */
function abortError(): DOMException {
  return new DOMException('Remoção de fundo cancelada.', 'AbortError');
}

/** Devolve o worker, criando-o na primeira chamada. */
function getWorker(): Worker {
  if (worker !== null) return worker;
  const created = new Worker(new URL('../workers/matte.worker.ts', import.meta.url), { type: 'module' });
  created.onmessage = (event: MessageEvent<MatteResponse>) => handleResponse(event.data);
  created.onerror = () => rejectAll(new MatteError('process', 'Falha no worker de máscara.'));
  worker = created;
  return created;
}

/** Encaminha a resposta do worker à geração correspondente. */
function handleResponse(response: MatteResponse): void {
  const job = pendingMattes.get(response.jobId);
  if (job === undefined) return;
  if (response.type === 'progress') {
    job.onProgress({ phase: response.phase, fraction: response.fraction });
    return;
  }
  pendingMattes.delete(response.jobId);
  if (response.type === 'done') {
    job.resolve(response.data);
  } else {
    job.reject(new MatteError(response.phase, response.message));
  }
}

/** Rejeita todas as gerações pendentes, encerra o worker (o próximo uso cria outro). */
function rejectAll(error: Error): void {
  const jobs = [...pendingMattes.values()];
  pendingMattes.clear();
  worker?.terminate();
  worker = null;
  for (const job of jobs) job.reject(error);
}
