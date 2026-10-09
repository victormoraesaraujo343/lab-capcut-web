// Cliente da estabilização: roda a análise de movimento num worker (um worker por análise, encerrado ao fim ou ao cancelar).
import type { Asset } from '../../types/project';
import type { Shift } from './trajectory';

/** Intervalo entre amostras analisadas, em ms de mídia. */
const SAMPLE_EVERY_MS = 66;
/** Largura, em pixels, em que cada quadro é reduzido para a análise. */
const ANALYSIS_WIDTH = 160;

/** Pedido enviado ao worker de estabilização. */
export interface StabilizeRequest {
  type: 'analyze';
  assetId: string;
  opfsPath: string;
  startMediaMs: number;
  endMediaMs: number;
  sampleEveryMs: number;
  analysisWidth: number;
}

/** Mensagens do worker: progresso (fração 0..1), resultado final ou erro. */
export type StabilizeResponse =
  | { type: 'progress'; fraction: number }
  | ({ type: 'done' } & StabilizeAnalysis)
  | { type: 'error'; message: string };

/** Resultado da análise: deslocamentos por amostra (em px da análise) e as dimensões envolvidas. */
export interface StabilizeAnalysis {
  /** Instante de mídia de cada amostra, em ms. */
  timesMs: number[];
  /** Deslocamento de cada amostra em relação à anterior (a primeira é zero). */
  shifts: Shift[];
  analysisWidth: number;
  analysisHeight: number;
  /** Largura e altura do quadro original, já com rotação aplicada. */
  sourceWidth: number;
  sourceHeight: number;
}

/** Analisa o movimento do asset entre os instantes de mídia dados; cancelar via signal encerra o worker. */
export function analyzeClip(
  asset: Asset,
  startMediaMs: number,
  endMediaMs: number,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<StabilizeAnalysis> {
  return new Promise<StabilizeAnalysis>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Estabilização cancelada.', 'AbortError'));
      return;
    }
    const worker = new Worker(new URL('../workers/stabilize.worker.ts', import.meta.url), { type: 'module' });
    const finish = (): void => {
      signal.removeEventListener('abort', onAbort);
      worker.terminate();
    };
    const onAbort = (): void => {
      finish();
      reject(new DOMException('Estabilização cancelada.', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort);
    worker.onmessage = (event: MessageEvent<StabilizeResponse>) => {
      const response = event.data;
      if (response.type === 'progress') {
        onProgress(response.fraction);
        return;
      }
      finish();
      if (response.type === 'done') {
        const { timesMs, shifts, analysisWidth, analysisHeight, sourceWidth, sourceHeight } = response;
        resolve({ timesMs, shifts, analysisWidth, analysisHeight, sourceWidth, sourceHeight });
      } else {
        reject(new Error(response.message));
      }
    };
    worker.onerror = () => {
      finish();
      reject(new Error('stabilize-worker'));
    };
    const request: StabilizeRequest = {
      type: 'analyze',
      assetId: asset.id,
      opfsPath: asset.opfsPath,
      startMediaMs,
      endMediaMs,
      sampleEveryMs: SAMPLE_EVERY_MS,
      analysisWidth: ANALYSIS_WIDTH,
    };
    worker.postMessage(request);
  });
}
