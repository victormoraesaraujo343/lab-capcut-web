/// <reference lib="webworker" />
// Worker da máscara: segmenta os quadros do trecho com MODNet (Apache-2.0) e codifica as máscaras num MP4 em tons de cinza.
import { env, pipeline, RawImage } from '@huggingface/transformers';
import type { ResolvedExport } from '../../types/export';
import type { FrameImage } from '../../types/render';
import { createExportFrameProvider } from '../export/exportFrameProvider';
import { createMuxer, type ExportMuxer } from '../export/muxers';
import {
  effectiveMatteFps,
  framesPlan,
  matteFrameTimeUs,
  matteSize,
  maskToRgba,
} from '../matte/matteFrames';
import type { MattePhase, MatteJobRequest, MatteResponse } from '../matte/matteProtocol';

/** Modelo de segmentação de retrato com licença Apache-2.0 (não usar modelos de licença não comercial). */
const MODEL_ID = 'Xenova/modnet';
/** Codec H.264 da máscara (nível 4.0 cobre o lado máximo de 512 px com folga). */
const CODEC = 'avc1.640028';
/** Taxa de bits da máscara: é cinza, então sobra qualidade com pouco dado. */
const MATTE_BITRATE = 2_000_000;
/** Intervalo entre quadros-chave, em quadros da máscara. */
const KEYFRAME_INTERVAL = 30;
/** Acima desta fila, o codificador é aguardado antes de receber outro quadro. */
const MAX_ENCODE_QUEUE = 8;
/** Tempo limite da espera por 'dequeue'. */
const QUEUE_WAIT_MS = 50;
/** Preferências de aceleração testadas nesta ordem. */
const HARDWARE_PREFERENCES: HardwareAcceleration[] = ['no-preference', 'prefer-software'];

/** Callback de progresso da biblioteca: recebe o status de cada arquivo do modelo. */
type LoadProgress = (info: { status: string; file?: string; loaded?: number; total?: number }) => void;
/** Pipeline de remoção de fundo carregado. */
type Segmenter = Awaited<ReturnType<typeof startModel>>;
/** Tamanho em pixels de uma máscara. */
interface Size {
  width: number;
  height: number;
}
/** Codificador e muxer abertos para as máscaras de um job, com os canvas de trabalho. */
interface MaskWriter {
  size: Size;
  scratch: OffscreenCanvas;
  mask: OffscreenCanvas;
  encoder: VideoEncoder;
  muxer: ExportMuxer;
  failure: { error: Error | null };
}

const scope = self as unknown as DedicatedWorkerGlobalScope;
/** Modelo carregado (ou em carregamento); null quando ainda não foi pedido ou o carregamento falhou. */
let model: Promise<Segmenter> | null = null;
/** Fila que executa um job por vez. */
let queue: Promise<void> = Promise.resolve();

/** Envia uma resposta para a thread principal; o MP4 é transferido, não copiado. */
function post(response: MatteResponse): void {
  if (response.type === 'done') {
    scope.postMessage(response, [response.data]);
    return;
  }
  scope.postMessage(response);
}

/** Configura o runtime ONNX: pasta local, cache do navegador e uma thread se não houver isolamento. */
function configureRuntime(ortBaseUrl: string): void {
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  const wasm = env.backends.onnx.wasm;
  if (wasm === undefined) throw new Error('Runtime ONNX não encontrado no ambiente.');
  wasm.wasmPaths = ortBaseUrl;
  if (!crossOriginIsolated) wasm.numThreads = 1;
}

/** Inicia o pipeline de remoção de fundo com o modelo quantizado (q8). */
function startModel(onProgress: LoadProgress) {
  return pipeline('background-removal', MODEL_ID, { dtype: 'q8', progress_callback: onProgress });
}

/** Carrega o modelo uma vez; se o carregamento falhar, a próxima tentativa refaz o download. */
function loadModel(onProgress: LoadProgress): Promise<Segmenter> {
  if (model !== null) return model;
  const loading = startModel(onProgress);
  model = loading;
  loading.catch(() => {
    model = null;
  });
  return loading;
}

/** Cria o callback que soma os bytes dos arquivos do modelo e informa a fração do download (0 a 1). */
function downloadReporter(report: (fraction: number) => void): LoadProgress {
  const files = new Map<string, { loaded: number; total: number }>();
  return (info) => {
    if (info.file === undefined) return;
    if (info.status === 'progress' && info.loaded !== undefined && info.total !== undefined) {
      files.set(info.file, { loaded: info.loaded, total: info.total });
    } else if (info.status === 'done') {
      const entry = files.get(info.file);
      if (entry !== undefined) files.set(info.file, { loaded: entry.total, total: entry.total });
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

/** Largura e altura reais de um quadro, qualquer que seja o tipo devolvido pelo provedor. */
function frameSize(source: FrameImage): Size {
  if (source instanceof VideoFrame) return { width: source.displayWidth, height: source.displayHeight };
  return { width: source.width, height: source.height };
}

/** Escolhe a primeira configuração de codificador suportada para a máscara. */
async function resolveEncoderConfig(size: Size, rate: number): Promise<VideoEncoderConfig> {
  for (const hardwareAcceleration of HARDWARE_PREFERENCES) {
    const candidate: VideoEncoderConfig = {
      codec: CODEC,
      width: size.width,
      height: size.height,
      bitrate: MATTE_BITRATE,
      framerate: rate,
      latencyMode: 'quality',
      hardwareAcceleration,
    };
    const support = await VideoEncoder.isConfigSupported(candidate).catch(() => ({ supported: false }));
    if (support.supported) return candidate;
  }
  throw new Error('unsupported-codec');
}

/** Abre o codificador H.264 e o muxer MP4 da máscara, com canvas de trabalho do tamanho pedido. */
async function openWriter(size: Size, rate: number, startMs: number, endMs: number): Promise<MaskWriter> {
  const config = await resolveEncoderConfig(size, rate);
  const resolved: ResolvedExport = {
    format: 'mp4',
    width: size.width,
    height: size.height,
    fps: rate,
    videoBitrate: MATTE_BITRATE,
    audioBitrate: 0,
    videoCodec: CODEC,
    audioCodec: '',
    keyFrameInterval: KEYFRAME_INTERVAL,
    startMs,
    endMs,
    fileName: 'matte.mp4',
    mimeType: 'video/mp4',
  };
  const muxer = createMuxer(resolved, false);
  const failure: { error: Error | null } = { error: null };
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (error) => {
      failure.error = new Error(`encode:${error.message}`);
    },
  });
  encoder.configure(config);
  return {
    size,
    scratch: new OffscreenCanvas(size.width, size.height),
    mask: new OffscreenCanvas(size.width, size.height),
    encoder,
    muxer,
    failure,
  };
}

/** Espera o próximo 'dequeue' do codificador ou o tempo limite, o que vier primeiro. */
function waitForDequeue(encoder: VideoEncoder): Promise<void> {
  return new Promise<void>((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      encoder.removeEventListener('dequeue', done);
      resolve();
    };
    const timer = setTimeout(done, QUEUE_WAIT_MS);
    encoder.addEventListener('dequeue', done);
  });
}

/** Segmenta um quadro no tamanho da máscara e devolve o alfa do resultado, um byte por pixel. */
async function segmentFrame(segmenter: Segmenter, source: FrameImage, writer: MaskWriter): Promise<Uint8Array> {
  const { width, height } = writer.size;
  const ctx = writer.scratch.getContext('2d');
  if (ctx === null) throw new Error('canvas-2d-unavailable');
  ctx.drawImage(source, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height);
  const output = await segmenter(new RawImage(pixels.data, width, height, 4));
  if (output.width !== width || output.height !== height || output.channels !== 4) {
    throw new Error('mask-shape');
  }
  const alpha = new Uint8Array(width * height);
  for (let index = 0; index < alpha.length; index++) {
    alpha[index] = output.data[index * 4 + 3] ?? 0;
  }
  return alpha;
}

/** Desenha a máscara cinza do quadro e a envia ao codificador com o timestamp do índice. */
async function encodeMask(writer: MaskWriter, alpha: Uint8Array, index: number, rate: number): Promise<void> {
  const { width, height } = writer.size;
  const ctx = writer.mask.getContext('2d');
  if (ctx === null) throw new Error('canvas-2d-unavailable');
  ctx.putImageData(new ImageData(maskToRgba(alpha, width, height), width, height), 0, 0);
  const frame = new VideoFrame(writer.mask, {
    timestamp: matteFrameTimeUs(index, rate),
    duration: matteFrameTimeUs(1, rate),
  });
  try {
    if (writer.encoder.encodeQueueSize > MAX_ENCODE_QUEUE) await waitForDequeue(writer.encoder);
    if (writer.failure.error !== null) throw writer.failure.error;
    writer.encoder.encode(frame, { keyFrame: index % KEYFRAME_INTERVAL === 0 });
  } finally {
    frame.close();
  }
}

/** Gera a máscara de um pedido: baixa o modelo, segmenta os quadros do trecho e responde com o MP4 ou o erro. */
async function runJob(request: MatteJobRequest): Promise<void> {
  const { jobId, asset } = request;
  let phase: MattePhase = 'download';
  const provider = createExportFrameProvider();
  let writer: MaskWriter | null = null;
  try {
    configureRuntime(request.ortBaseUrl);
    const segmenter = await loadModel(
      downloadReporter((fraction) => post({ type: 'progress', jobId, phase: 'download', fraction })),
    );
    phase = 'process';
    if (asset.kind !== 'video') throw new Error('not-video');
    const endMs = asset.durationMs === undefined ? request.endMediaMs : Math.min(request.endMediaMs, asset.durationMs);
    const plan = framesPlan(request.startMediaMs, endMs, asset.fps);
    if (plan.length === 0) throw new Error('empty-range');
    const rate = effectiveMatteFps(asset.fps);
    for (let index = 0; index < plan.length; index++) {
      const timeMs = plan[index] ?? request.startMediaMs;
      const source = await provider.getFrame(asset, timeMs, { exact: true });
      // Sem quadro (fim da mídia): a máscara termina aqui.
      if (source === null) break;
      try {
        if (writer === null) {
          const dims = frameSize(source);
          writer = await openWriter(matteSize(dims.width, dims.height), rate, request.startMediaMs, endMs);
        }
        const alpha = await segmentFrame(segmenter, source, writer);
        await encodeMask(writer, alpha, index, rate);
      } finally {
        provider.releaseFrame(source);
      }
      post({ type: 'progress', jobId, phase: 'process', fraction: (index + 1) / plan.length });
    }
    if (writer === null) throw new Error('no-frames');
    await writer.encoder.flush();
    if (writer.failure.error !== null) throw writer.failure.error;
    post({ type: 'done', jobId, data: writer.muxer.finalize() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    post({ type: 'error', jobId, phase, message });
  } finally {
    if (writer !== null && writer.encoder.state !== 'closed') writer.encoder.close();
    provider.dispose();
  }
}

scope.onmessage = (event: MessageEvent<MatteJobRequest>) => {
  const request = event.data;
  queue = queue.then(() => runJob(request));
};
