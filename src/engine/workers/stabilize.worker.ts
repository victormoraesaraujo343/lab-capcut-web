/// <reference lib="webworker" />
// Worker de estabilização: pega os quadros do trecho em sequência, reduz cada um e estima o deslocamento entre quadros seguidos.
import { openAssetSession } from '../decode/decodeSession';
import type { Session } from '../decode/decodeSession';
import { decodeTo } from '../decode/decoderFeed';
import { clampSampleIndex } from '../decode/sampleIndex';
import { estimateShift, toGray } from '../stabilize/motionEstimate';
import type { StabilizeAnalysis, StabilizeRequest, StabilizeResponse } from '../stabilize/stabilizeClient';
import type { Shift } from '../stabilize/trajectory';

const scope = self as unknown as DedicatedWorkerGlobalScope;

/** Tolerância, em fração de quadro, para aceitar o quadro mais próximo quando o exato não está no cache. */
const NEAREST_TOLERANCE_FRAMES = 0.5;
/** Deslocamento máximo procurado entre dois quadros analisados, em px da análise. */
const MAX_SHIFT_PX = 12;

/** Envia uma resposta à thread principal. */
function post(response: StabilizeResponse): void {
  scope.postMessage(response);
}

/** Instantes de mídia de início a fim, de sampleEveryMs em sampleEveryMs (inclui o fim). */
function sampleTimes(startMs: number, endMs: number, stepMs: number): number[] {
  const step = Math.max(1, stepMs);
  const times: number[] = [];
  for (let t = startMs; t <= endMs + 1e-6; t += step) {
    times.push(t);
  }
  return times;
}

/** Quadro exato no instante de mídia (decodificado em sequência), ou null se o instante não existe no arquivo. */
async function frameAt(session: Session, mediaMs: number): Promise<VideoFrame | null> {
  const targetUs = Math.round(mediaMs * 1000);
  const index = clampSampleIndex(session.samples, targetUs);
  if (index < 0) return null;
  const targetCts = session.samples[index]?.ctsUs ?? targetUs;
  if (session.cache.getNearest(targetCts, 0) === null) {
    session.cursorUs = targetUs;
    await decodeTo(session, index);
    session.cache.evictFarFrom(targetUs);
  }
  return session.cache.getNearest(targetCts, session.frameUs * NEAREST_TOLERANCE_FRAMES)?.item ?? null;
}

/** Percorre o trecho, reduz cada quadro para a largura de análise e devolve os deslocamentos entre quadros seguidos. */
async function runAnalysis(session: Session, request: StabilizeRequest): Promise<StabilizeAnalysis> {
  const times = sampleTimes(request.startMediaMs, request.endMediaMs, request.sampleEveryMs);
  if (times.length < 2) throw new Error('stabilize-range');
  const canvas = new OffscreenCanvas(request.analysisWidth, 1);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx === null) throw new Error('stabilize-canvas');
  const timesMs: number[] = [];
  const shifts: Shift[] = [];
  let prev: Float32Array | null = null;
  let analysisHeight = 1;
  let sourceWidth = 0;
  let sourceHeight = 0;
  for (const [i, mediaMs] of times.entries()) {
    const frame = await frameAt(session, mediaMs);
    if (frame === null) throw new Error('stabilize-no-frame');
    if (i === 0) {
      sourceWidth = frame.displayWidth;
      sourceHeight = frame.displayHeight;
      analysisHeight = Math.max(1, Math.round((request.analysisWidth * sourceHeight) / Math.max(1, sourceWidth)));
      canvas.height = analysisHeight;
    }
    ctx.drawImage(frame, 0, 0, request.analysisWidth, analysisHeight);
    const pixels = ctx.getImageData(0, 0, request.analysisWidth, analysisHeight).data;
    const gray = toGray(pixels, request.analysisWidth, analysisHeight);
    shifts.push(
      prev === null ? { dx: 0, dy: 0 } : estimateShift(prev, gray, request.analysisWidth, analysisHeight, MAX_SHIFT_PX),
    );
    timesMs.push(mediaMs);
    prev = gray;
    post({ type: 'progress', fraction: (i + 1) / times.length });
  }
  return {
    timesMs,
    shifts,
    analysisWidth: request.analysisWidth,
    analysisHeight,
    sourceWidth,
    sourceHeight,
  };
}

/** Fecha a sessão e libera o decodificador e os quadros em cache. */
function closeSession(session: Session): void {
  session.closed = true;
  session.cache.clear();
  if (session.decoder && session.decoder.state !== 'closed') {
    session.decoder.close();
  }
  session.decoder = null;
}

/** Executa um pedido de análise: abre o asset, analisa e responde com o resultado ou o erro. */
async function handleAnalyze(request: StabilizeRequest): Promise<void> {
  const opened = await openAssetSession(request.assetId, request.opfsPath);
  if (!opened.ok) {
    post({ type: 'error', message: `stabilize-open:${opened.reason}` });
    return;
  }
  const session = opened.session;
  try {
    const result = await runAnalysis(session, request);
    post({ type: 'done', ...result });
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : 'stabilize-failed' });
  } finally {
    closeSession(session);
  }
}

scope.onmessage = (event: MessageEvent<StabilizeRequest>) => {
  if (event.data.type !== 'analyze') return;
  void handleAnalyze(event.data);
};
