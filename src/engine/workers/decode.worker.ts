/// <reference lib="webworker" />
import { openAssetSession } from '../decode/decodeSession';
import type { Session } from '../decode/decodeSession';
import { decodeTo } from '../decode/decoderFeed';
import { clampSampleIndex } from '../decode/sampleIndex';
import type {
  DecodeFrameRequest,
  DecodeOpenRequest,
  DecodePrefetchRequest,
  DecodeRequest,
  DecodeResponse,
} from './decodeProtocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;

const PREFETCH_AHEAD_US = 1_000_000;
/** Quanto decodificar à frente do cursor durante a reprodução, em µs. */
const PLAYBACK_AHEAD_US = 300_000;

const sessions = new Map<string, Session>();

/** Envia uma resposta ao thread principal, transferindo os objetos listados. */
function post(response: DecodeResponse, transfer: Transferable[] = []): void {
  scope.postMessage(response, transfer);
}

/** Enfileira uma tarefa do asset; as tarefas rodam uma de cada vez. */
function enqueue(session: Session, task: () => Promise<void>): Promise<void> {
  const run = session.chain.then(task);
  session.chain = run.catch(() => undefined);
  return run;
}

/** Responde a um pedido de quadro; o VideoFrame, se houver, é transferido ao thread principal. */
function respondFrame(request: DecodeFrameRequest, frame: VideoFrame | null): void {
  post({ type: 'frame', requestId: request.requestId, frame, timeMs: request.timeMs }, frame ? [frame] : []);
}

/** Atende um pedido de quadro: usa o cache, decodifica o necessário e responde uma vez. */
async function serveFrame(session: Session, request: DecodeFrameRequest): Promise<void> {
  if (session.closed) {
    throw new Error('Asset fechado');
  }
  const targetUs = Math.round(request.timeMs * 1000);
  const tolerance = session.frameUs / 2;
  if (!request.exact && session.latestFrameId !== request.requestId) {
    // Pedido superado por um mais novo: responde com o quadro mais próximo já pronto (nunca vazio,
    // senão a camada some e pisca na prévia) e deixa a decodificação para o pedido mais novo.
    const nearest = session.cache.getNearest(targetUs, Number.POSITIVE_INFINITY);
    respondFrame(request, nearest ? nearest.item.clone() : null);
    return;
  }
  const index = clampSampleIndex(session.samples, targetUs);
  if (index < 0) {
    respondFrame(request, null);
    return;
  }
  const hit = session.cache.getNearest(targetUs, tolerance);
  if (hit) {
    respondFrame(request, hit.item.clone());
    session.cache.evictFarFrom(targetUs);
    if (!request.exact) await decodeAhead(session, targetUs);
    return;
  }
  if (!request.exact) {
    const nearest = session.cache.getNearest(targetUs, Number.POSITIVE_INFINITY);
    if (nearest) {
      respondFrame(request, nearest.item.clone());
      await decodeTo(session, index);
      session.cache.evictFarFrom(targetUs);
      await decodeAhead(session, targetUs);
      return;
    }
  }
  await decodeTo(session, index);
  const targetCts = session.samples[index]?.ctsUs ?? targetUs;
  const got = session.cache.getNearest(targetCts, 0);
  respondFrame(request, got ? got.item.clone() : null);
  session.cache.evictFarFrom(targetUs);
  if (!request.exact) await decodeAhead(session, targetUs);
}

/** Na reprodução, mantém decodificado um trecho à frente do cursor para os próximos pedidos acertarem o cache. */
async function decodeAhead(session: Session, cursorUs: number): Promise<void> {
  const aheadUs = cursorUs + PLAYBACK_AHEAD_US;
  if (session.cache.getNearest(aheadUs, session.frameUs / 2)) return;
  const index = clampSampleIndex(session.samples, aheadUs);
  if (index < 0) return;
  await decodeTo(session, index);
  session.cache.evictFarFrom(session.cursorUs);
}

/** Registra um pedido de quadro e o coloca na fila do asset. */
async function handleFrame(request: DecodeFrameRequest): Promise<void> {
  const session = sessions.get(request.assetId);
  if (!session) {
    throw new Error(`Asset não aberto: ${request.assetId}`);
  }
  session.pending += 1;
  if (!request.exact) {
    session.latestFrameId = request.requestId;
  }
  session.cursorUs = Math.round(request.timeMs * 1000);
  if (!request.exact) {
    // Reprodução/scrub: responde já com o quadro pronto, sem esperar a fila; se ele estiver perto do
    // alvo, a decodificação adiantada segue por trás sem bloquear os próximos pedidos.
    const hit = session.cache.getNearest(session.cursorUs, session.frameUs / 2);
    if (hit) {
      respondFrame(request, hit.item.clone());
      session.pending -= 1;
      if (!session.aheadQueued) {
        session.aheadQueued = true;
        enqueue(session, async () => {
          try {
            await decodeAhead(session, session.cursorUs);
          } finally {
            session.aheadQueued = false;
          }
        }).catch(() => undefined);
      }
      return;
    }
  }
  await enqueue(session, async () => {
    try {
      await serveFrame(session, request);
    } finally {
      session.pending -= 1;
    }
  });
}

/** Decodifica cerca de 1s à frente (ou atrás) do cursor, só se o asset estiver ocioso. */
function handlePrefetch(request: DecodePrefetchRequest): void {
  const session = sessions.get(request.assetId);
  if (!session || session.closed || session.pending > 0) {
    return;
  }
  const targetUs = Math.round(request.timeMs * 1000) + request.direction * PREFETCH_AHEAD_US;
  const index = clampSampleIndex(session.samples, Math.max(0, targetUs));
  if (index < 0) {
    return;
  }
  const targetCts = session.samples[index]?.ctsUs ?? targetUs;
  if (session.cache.getNearest(targetCts, session.frameUs / 2)) {
    return;
  }
  session.pending += 1;
  // Erro de pré-carregamento é ignorado: decodeTo zera nextIndex e o próximo pedido refaz a decodificação.
  enqueue(session, async () => {
    try {
      await decodeTo(session, index);
      session.cache.evictFarFrom(session.cursorUs);
    } finally {
      session.pending -= 1;
    }
  }).catch(() => undefined);
}

/** Responde ao pedido de abertura com o resultado e, se ok, a largura e a altura. */
function respondOpen(requestId: number, ok: boolean, reason?: string, width?: number, height?: number): void {
  post({ type: 'opened', requestId, ok, reason, width, height });
}

/** Abre o asset (ou reaproveita a sessão existente) e responde com o resultado. */
async function handleOpen(request: DecodeOpenRequest): Promise<void> {
  const existing = sessions.get(request.assetId);
  if (existing) {
    respondOpen(request.requestId, true, undefined, existing.config.codedWidth, existing.config.codedHeight);
    return;
  }
  const result = await openAssetSession(request.assetId, request.opfsPath);
  if (!result.ok) {
    respondOpen(request.requestId, false, result.reason);
    return;
  }
  const session = result.session;
  sessions.set(request.assetId, session);
  respondOpen(request.requestId, true, undefined, session.config.codedWidth, session.config.codedHeight);
}

/** Fecha a sessão de um asset, libera o decodificador e fecha todos os quadros em cache. */
function closeAsset(assetId: string): void {
  const session = sessions.get(assetId);
  if (!session) {
    return;
  }
  session.closed = true;
  sessions.delete(assetId);
  session.cache.clear();
  if (session.decoder && session.decoder.state !== 'closed') {
    session.decoder.close();
  }
  session.decoder = null;
}

scope.onmessage = (event: MessageEvent<DecodeRequest>) => {
  const request = event.data;
  if (request.type === 'prefetch') {
    handlePrefetch(request);
    return;
  }
  if (request.type === 'close') {
    closeAsset(request.assetId);
    return;
  }
  const handler = request.type === 'open' ? handleOpen(request) : handleFrame(request);
  handler.catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    post({ type: 'error', requestId: request.requestId, message });
  });
};
