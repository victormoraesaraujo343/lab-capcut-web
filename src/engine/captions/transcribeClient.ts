// Cliente da transcrição: mantém um único worker (modelo carregado uma vez) e entrega legendas prontas.
import { segmentCaptions, type TimedText } from './captionSegmenter';
import type {
  TranscribeLanguage,
  TranscribePhase,
  TranscribeRequest,
  TranscribeResponse,
  WhisperModelSize,
} from './transcribeProtocol';
import TranscribeWorker from '../workers/transcribe.worker?worker&inline';

/** Opções de uma transcrição. */
export interface TranscribeOptions {
  language: TranscribeLanguage;
  model: WhisperModelSize;
}

/** Progresso de uma transcrição. */
export interface TranscribeProgress {
  phase: TranscribePhase;
  /** Fração de 0 a 1 dentro da fase. */
  fraction: number;
}

/** Controle de uma transcrição em andamento. */
export interface TranscribeHandle {
  /** Cancela o job; result é rejeitado com AbortError e o resultado do modelo é descartado. */
  cancel(): void;
  /** Legendas prontas, ou erro se a transcrição falhar ou for cancelada. */
  result: Promise<TimedText[]>;
}

/** Job aguardando resposta do worker. */
interface PendingJob {
  resolve: (captions: TimedText[]) => void;
  reject: (reason: unknown) => void;
  onProgress: (progress: TranscribeProgress) => void;
}

/** Worker único, criado sob demanda e reaproveitado entre transcrições. */
let worker: Worker | null = null;
/** Jobs ainda sem resposta, por id. */
const pendingJobs = new Map<number, PendingJob>();
/** Próximo id de job. */
let nextJobId = 1;

/** Inicia a transcrição do áudio mono de 16 kHz; o áudio é transferido ao worker e não pode mais ser usado pelo chamador. */
export function transcribe(
  audio: Float32Array,
  options: TranscribeOptions,
  onProgress: (progress: TranscribeProgress) => void,
): TranscribeHandle {
  const jobId = nextJobId++;
  let resolveJob: (captions: TimedText[]) => void = () => undefined;
  let rejectJob: (reason: unknown) => void = () => undefined;
  const result = new Promise<TimedText[]>((resolve, reject) => {
    resolveJob = resolve;
    rejectJob = reject;
  });
  // Evita aviso de promessa não tratada quando o chamador cancela sem aguardar o resultado.
  result.catch(() => undefined);
  pendingJobs.set(jobId, { resolve: resolveJob, reject: rejectJob, onProgress });

  const { buffer } = audio;
  const transferList: ArrayBuffer[] = buffer instanceof ArrayBuffer ? [buffer] : [];
  const request: TranscribeRequest = {
    type: 'transcribe',
    jobId,
    audio,
    language: options.language,
    model: options.model,
    ortBaseUrl: new URL('ort/', document.baseURI).href,
  };
  getWorker().postMessage(request, transferList);

  return {
    cancel: () => {
      if (!pendingJobs.delete(jobId)) {
        return;
      }
      rejectJob(new DOMException('Transcrição cancelada.', 'AbortError'));
      // Encerra o worker de vez: a inferência para de gastar CPU e o próximo pedido cria outro worker.
      disposeTranscriber();
    },
    result,
  };
}

/** Libera o worker e cancela todos os jobs pendentes; o próximo uso carrega o modelo de novo. */
export function disposeTranscriber(): void {
  for (const job of pendingJobs.values()) {
    job.reject(new DOMException('Transcrição cancelada.', 'AbortError'));
  }
  pendingJobs.clear();
  worker?.terminate();
  worker = null;
}

/** Devolve o worker, criando-o na primeira chamada. */
function getWorker(): Worker {
  if (worker !== null) {
    return worker;
  }
  const created = new TranscribeWorker();
  created.onmessage = (event: MessageEvent<TranscribeResponse>) => handleResponse(event.data);
  created.onerror = () => failAll(new Error('Falha no worker de transcrição.'));
  worker = created;
  return created;
}

/** Encaminha a resposta do worker ao job correspondente. */
function handleResponse(response: TranscribeResponse): void {
  const job = pendingJobs.get(response.jobId);
  if (job === undefined) {
    return;
  }
  if (response.type === 'progress') {
    job.onProgress({ phase: response.phase, fraction: response.fraction });
    return;
  }
  pendingJobs.delete(response.jobId);
  if (response.type === 'done') {
    job.resolve(segmentCaptions(response.chunks));
  } else {
    job.reject(new Error(response.message));
  }
}

/** Rejeita todos os jobs pendentes e descarta o worker quebrado. */
function failAll(error: Error): void {
  for (const job of pendingJobs.values()) {
    job.reject(error);
  }
  pendingJobs.clear();
  worker?.terminate();
  worker = null;
}
