import type { Asset } from '../../types/project';
import { getObjectUrl } from '../storage/opfs';

const DEFAULT_FPS = 30;
const SEEK_TIMEOUT_MS = 3000;
const LOAD_TIMEOUT_MS = 3000;
const PLAY_TOLERANCE_MS = 150;
const MIN_RATE = 0.0625;
const MAX_RATE = 16;
/** Tempo sem ser pedido, em ms, após o qual um elemento tocando na reprodução é pausado. */
const IDLE_MS = 300;

/** Fonte de quadros por <video> escondido, um por asset. Os elementos nunca entram no DOM visível. */
export interface VideoElementSource {
  /** Devolve o <video> posicionado no instante pedido, ou null se ainda não há quadro pronto. */
  getFrame(asset: Asset, mediaTimeMs: number, exact: boolean): Promise<HTMLVideoElement | null>;
  /** Toca o <video> do asset a partir do instante na velocidade pedida; faz seek se a diferença for maior que 150ms. */
  playSync(asset: Asset, mediaTimeMs: number, rate: number): Promise<HTMLVideoElement | null>;
  /** Pausa todos os <video> e cancela a reprodução em andamento. */
  pauseAll(): void;
  /** Pausa, remove o src e esquece o <video> de um asset. */
  close(assetId: string): void;
  /** Remove o src de todos os elementos e os descarta. */
  dispose(): void;
}

interface Entry {
  element: HTMLVideoElement;
  halfFrameMs: number;
  source: Promise<boolean>;
  busy: Promise<void> | null;
  pendingTargetMs: number | null;
  /** Último instante (performance.now) em que o elemento foi pedido. */
  lastUsedMs: number;
}

/** Cria a fonte de quadros por elemento de vídeo. */
export function createVideoElementSource(): VideoElementSource {
  const entries = new Map<string, Entry>();
  /** true entre um playSync e o próximo pauseAll: sem isso, um play() atrasado tocaria depois da pausa. */
  let playing = false;

  function getEntry(asset: Asset): Entry {
    const existing = entries.get(asset.id);
    if (existing !== undefined) {
      return existing;
    }
    const element = document.createElement('video');
    element.muted = true;
    element.playsInline = true;
    element.preload = 'auto';
    const fps = Math.max(1, asset.fps ?? DEFAULT_FPS);
    const entry: Entry = {
      element,
      halfFrameMs: 500 / fps,
      source: attachSource(element, asset.opfsPath),
      busy: null,
      pendingTargetMs: null,
      lastUsedMs: performance.now(),
    };
    entries.set(asset.id, entry);
    return entry;
  }

  async function getFrame(asset: Asset, mediaTimeMs: number, exact: boolean): Promise<HTMLVideoElement | null> {
    const entry = getEntry(asset);
    entry.lastUsedMs = performance.now();
    if (!(await ensureReady(entry))) {
      return null;
    }
    const element = entry.element;
    const nearTarget = Math.abs(element.currentTime * 1000 - mediaTimeMs) <= entry.halfFrameMs;
    if (entry.busy === null && nearTarget) {
      return readyOrNull(element);
    }
    if (!exact && entry.busy !== null) {
      entry.pendingTargetMs = mediaTimeMs;
      return readyOrNull(element);
    }
    await requestSeek(entry, mediaTimeMs);
    return readyOrNull(element);
  }

  async function playSync(asset: Asset, mediaTimeMs: number, rate: number): Promise<HTMLVideoElement | null> {
    const entry = getEntry(asset);
    const now = performance.now();
    entry.lastUsedMs = now;
    playing = true;
    pauseIdle(now);
    if (!(await ensureReady(entry))) {
      return null;
    }
    // Depois do await a reprodução pode ter sido pausada: nesse caso não toca mais.
    if (!playing) {
      return null;
    }
    const element = entry.element;
    const drift = Math.abs(element.currentTime * 1000 - mediaTimeMs);
    if (drift >= PLAY_TOLERANCE_MS) {
      if (entry.busy !== null) {
        entry.pendingTargetMs = mediaTimeMs;
      } else {
        element.currentTime = mediaTimeMs / 1000;
      }
    }
    if (!isNativeRate(rate)) {
      // Velocidade que o navegador não aceita (ex.: freeze, 0): segura o quadro por seek.
      element.pause();
      return element;
    }
    element.playbackRate = rate;
    if (element.paused) {
      // Autoplay pode ser recusado pelo navegador; nesse caso a prévia segue por quadros.
      element.play().catch(() => undefined);
    }
    return element;
  }

  /** Pausa os elementos que não foram pedidos nos últimos IDLE_MS. */
  function pauseIdle(now: number): void {
    for (const entry of entries.values()) {
      if (now - entry.lastUsedMs > IDLE_MS && !entry.element.paused) {
        entry.element.pause();
      }
    }
  }

  function pauseAll(): void {
    playing = false;
    for (const entry of entries.values()) {
      entry.element.pause();
    }
  }

  function close(assetId: string): void {
    const entry = entries.get(assetId);
    if (entry === undefined) {
      return;
    }
    releaseElement(entry.element);
    entries.delete(assetId);
  }

  function dispose(): void {
    playing = false;
    for (const entry of entries.values()) {
      releaseElement(entry.element);
    }
    entries.clear();
  }

  return { getFrame, playSync, pauseAll, close, dispose };
}

/** Pausa o elemento e remove a fonte dele, liberando o arquivo. */
function releaseElement(element: HTMLVideoElement): void {
  element.pause();
  element.removeAttribute('src');
  element.load();
}

/** Define o src do elemento com a URL do OPFS; devolve false se o arquivo não puder ser lido. */
async function attachSource(element: HTMLVideoElement, opfsPath: string): Promise<boolean> {
  try {
    element.src = await getObjectUrl(opfsPath);
    return true;
  } catch {
    return false;
  }
}

/** Espera o elemento ter dados para desenhar quadro; false se a fonte falhou ou demorou demais. */
async function ensureReady(entry: Entry): Promise<boolean> {
  if (!(await entry.source)) {
    return false;
  }
  if (entry.element.readyState >= 2) {
    return true;
  }
  await waitForEvent(entry.element, 'loadeddata', LOAD_TIMEOUT_MS);
  return entry.element.readyState >= 2;
}

/** Inicia (ou reaproveita) a sequência de seeks; o alvo mais recente sempre vence. */
function requestSeek(entry: Entry, targetMs: number): Promise<void> {
  entry.pendingTargetMs = targetMs;
  if (entry.busy === null) {
    entry.busy = drainSeeks(entry).finally(() => {
      entry.busy = null;
    });
  }
  return entry.busy;
}

/** Executa seeks enquanto houver alvo pendente, esperando cada 'seeked' (ou o timeout). */
async function drainSeeks(entry: Entry): Promise<void> {
  while (entry.pendingTargetMs !== null) {
    const target = entry.pendingTargetMs;
    entry.pendingTargetMs = null;
    entry.element.currentTime = target / 1000;
    await waitForEvent(entry.element, 'seeked', SEEK_TIMEOUT_MS);
  }
}

/** Devolve o elemento se ele já tem quadro para desenhar, senão null. */
function readyOrNull(element: HTMLVideoElement): HTMLVideoElement | null {
  return element.readyState >= 2 ? element : null;
}

/** Resolve true no evento, false em erro ou timeout. */
function waitForEvent(element: HTMLVideoElement, type: 'seeked' | 'loadeddata', timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => done(false), timeoutMs);
    const onOk = (): void => done(true);
    const onError = (): void => done(false);
    function done(ok: boolean): void {
      clearTimeout(timer);
      element.removeEventListener(type, onOk);
      element.removeEventListener('error', onError);
      resolve(ok);
    }
    element.addEventListener(type, onOk);
    element.addEventListener('error', onError);
  });
}

/** Diz se o navegador aceita a velocidade para tocar nativamente (0.0625 a 16). */
function isNativeRate(rate: number): boolean {
  return Number.isFinite(rate) && rate >= MIN_RATE && rate <= MAX_RATE;
}
