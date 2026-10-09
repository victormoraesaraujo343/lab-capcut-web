/// <reference lib="webworker" />
// Worker de transcrição: carrega o Whisper (uma vez por modelo), transcreve um job por vez e devolve trechos.
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import type { TimedText } from '../captions/captionSegmenter';
import type {
  TranscribeJobRequest,
  TranscribeLanguage,
  TranscribeRequest,
  TranscribeResponse,
  WhisperModelSize,
} from '../captions/transcribeProtocol';

/** Callback de progresso da biblioteca: recebe o status de cada arquivo do modelo. */
type LoadProgress = (info: { status: string; file?: string; loaded?: number; total?: number }) => void;

/** Repositórios ONNX do Whisper no Hugging Face. */
const MODEL_IDS: Record<WhisperModelSize, string> = {
  tiny: 'onnx-community/whisper-tiny',
  base: 'onnx-community/whisper-base',
};

/** Nome por extenso do idioma, como o Whisper espera; undefined = detectar automaticamente. */
const LANGUAGE_NAMES: Record<TranscribeLanguage, string | undefined> = {
  auto: undefined,
  pt: 'portuguese',
  en: 'english',
  es: 'spanish',
};

/** Duração de cada bloco de áudio enviado ao modelo, em segundos. */
const CHUNK_LENGTH_S = 30;
/** Sobreposição entre blocos consecutivos, em segundos. */
const STRIDE_LENGTH_S = 5;
/** Duração assumida para um trecho sem fim informado pelo modelo, em ms. */
const FALLBACK_CHUNK_MS = 2000;

const scope = self as unknown as DedicatedWorkerGlobalScope;

/** Modelos já carregados (ou em carregamento), por tamanho. */
const models = new Map<WhisperModelSize, Promise<AutomaticSpeechRecognitionPipeline>>();
/** Jobs enfileirados ou em andamento. */
const pendingJobs = new Set<number>();
/** Jobs cancelados: o resultado deles é descartado. */
const cancelledJobs = new Set<number>();
/** Fila que executa um job por vez. */
let queue: Promise<void> = Promise.resolve();

/** Envia uma resposta para a thread principal. */
function post(response: TranscribeResponse): void {
  scope.postMessage(response);
}

/** Configura o runtime ONNX: pasta local, cache do navegador e uma thread se não houver isolamento. */
function configureRuntime(ortBaseUrl: string): void {
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  const wasm = env.backends.onnx.wasm;
  if (wasm === undefined) {
    throw new Error('Runtime ONNX não encontrado no ambiente.');
  }
  wasm.wasmPaths = ortBaseUrl;
  if (!crossOriginIsolated) {
    wasm.numThreads = 1;
  }
}

/** Carrega o pipeline de ASR do modelo pedido, reaproveitando o que já está carregado. */
function loadModel(model: WhisperModelSize, onProgress: LoadProgress): Promise<AutomaticSpeechRecognitionPipeline> {
  const existing = models.get(model);
  if (existing !== undefined) {
    return existing;
  }
  const loading = pipeline('automatic-speech-recognition', MODEL_IDS[model], {
    dtype: 'q8',
    progress_callback: onProgress,
  });
  models.set(model, loading);
  loading.catch(() => models.delete(model));
  return loading;
}

/** Cria o callback que soma bytes de todos os arquivos e informa a fração de download (0 a 1). */
function createDownloadProgress(report: (fraction: number) => void): LoadProgress {
  const files = new Map<string, { loaded: number; total: number }>();
  return (info) => {
    if (info.file === undefined) {
      return;
    }
    if (info.status === 'progress' && info.loaded !== undefined && info.total !== undefined) {
      files.set(info.file, { loaded: info.loaded, total: info.total });
    } else if (info.status === 'done') {
      const entry = files.get(info.file);
      if (entry !== undefined) {
        files.set(info.file, { loaded: entry.total, total: entry.total });
      }
    } else {
      return;
    }
    let loaded = 0;
    let total = 0;
    for (const entry of files.values()) {
      loaded += entry.loaded;
      total += entry.total;
    }
    report(total > 0 ? Math.min(1, loaded / total) : 0);
  };
}

/** Converte a saída do pipeline em trechos com tempos em ms; fim ausente vira início + 2 s. */
function toTimedChunks(chunks: { text: string; timestamp: [number, number | null] }[]): TimedText[] {
  return chunks.map((chunk) => {
    const startMs = Math.round(chunk.timestamp[0] * 1000);
    const endSeconds: number | null = chunk.timestamp[1];
    const endMs = endSeconds === null ? startMs + FALLBACK_CHUNK_MS : Math.round(endSeconds * 1000);
    return { text: chunk.text, startMs, endMs };
  });
}

/** Executa um job completo: carrega o modelo, transcreve e responde com os trechos ou o erro. */
async function runJob(request: TranscribeJobRequest): Promise<void> {
  const { jobId } = request;
  try {
    if (cancelledJobs.has(jobId)) {
      return;
    }
    configureRuntime(request.ortBaseUrl);
    const onDownload = createDownloadProgress((fraction) => {
      post({ type: 'progress', jobId, phase: 'download', fraction });
    });
    const asr = await loadModel(request.model, onDownload);
    if (cancelledJobs.has(jobId)) {
      return;
    }
    post({ type: 'progress', jobId, phase: 'transcribe', fraction: 0 });
    const output = await asr(request.audio, {
      language: LANGUAGE_NAMES[request.language],
      task: 'transcribe',
      return_timestamps: true,
      chunk_length_s: CHUNK_LENGTH_S,
      stride_length_s: STRIDE_LENGTH_S,
    });
    if (cancelledJobs.has(jobId)) {
      return;
    }
    const chunks = toTimedChunks(output.chunks ?? []);
    post({ type: 'done', jobId, chunks });
  } catch (error) {
    if (!cancelledJobs.has(jobId)) {
      const message = error instanceof Error ? error.message : String(error);
      post({ type: 'error', jobId, message });
    }
  } finally {
    pendingJobs.delete(jobId);
    cancelledJobs.delete(jobId);
  }
}

scope.onmessage = (event: MessageEvent<TranscribeRequest>) => {
  const request = event.data;
  if (request.type === 'cancel') {
    if (pendingJobs.has(request.jobId)) {
      cancelledJobs.add(request.jobId);
    }
    return;
  }
  pendingJobs.add(request.jobId);
  queue = queue.then(() => runJob(request));
};
