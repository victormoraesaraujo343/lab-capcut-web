// Fonte de quadros via WebCodecs: fala com o worker de decodificação e cuida dos pedidos pendentes.
import type { Asset } from '../../types/project';
import type { DecodeRequest, DecodeResponse } from '../workers/decodeProtocol';
import { fileExtension } from '../storage/paths';

const DEMUX_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/x-m4v', 'video/webm'];
const DEMUX_EXTENSIONS = ['mp4', 'mov', 'm4v', 'webm'];

/** Fonte de quadros por WebCodecs, com a mesma forma usada pela prévia e pela exportação. */
export interface WebCodecsSource {
  /** Abre o asset no worker; resolve false se o formato ou o codec não for suportado. */
  open(asset: Asset): Promise<boolean>;
  /** Devolve o quadro no instante de mídia (ms), ou null; quem recebe deve fechar o VideoFrame. */
  getFrame(asset: Asset, mediaTimeMs: number, exact: boolean): Promise<VideoFrame | null>;
  /** Pede pré-decodificação de cerca de 1s à frente (1) ou atrás (-1) do instante. */
  prefetch(asset: Asset, mediaTimeMs: number, direction: 1 | -1): void;
  /** Fecha o asset no worker e libera seus quadros. */
  close(assetId: string): void;
  /** Encerra o worker e resolve os pedidos pendentes com null. */
  dispose(): void;
}

interface PendingOpen {
  kind: 'open';
  assetId: string;
  resolve: (ok: boolean) => void;
  reject: (error: Error) => void;
}

interface PendingFrame {
  kind: 'frame';
  assetId: string;
  exact: boolean;
  resolve: (frame: VideoFrame | null) => void;
  reject: (error: Error) => void;
}

type Pending = PendingOpen | PendingFrame;

/** Diz se o navegador tem WebCodecs (VideoDecoder). */
export function isWebCodecsSupported(): boolean {
  return typeof VideoDecoder !== 'undefined';
}

/** Diz se o asset é um MP4/MOV/M4V/WebM que o demux do worker sabe ler. */
export function canDemux(asset: Asset): boolean {
  const mime = asset.mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (DEMUX_MIME_TYPES.includes(mime)) {
    return true;
  }
  return DEMUX_EXTENSIONS.includes(fileExtension(asset.opfsPath));
}

/** Cria a fonte de quadros com um único worker de decodificação, criado na primeira necessidade. */
export function createWebCodecsSource(): WebCodecsSource {
  let worker: Worker | null = null;
  let nextRequestId = 1;
  const pending = new Map<number, Pending>();
  const openMemo = new Map<string, Promise<boolean>>();
  const readyAssets = new Set<string>();

  /** Rejeita ou resolve (com null) todos os pedidos pendentes, conforme o motivo. */
  const settleAll = (error: Error | null): void => {
    for (const entry of pending.values()) {
      if (entry.kind === 'frame') {
        if (error) {
          entry.reject(error);
        } else {
          entry.resolve(null);
        }
      } else if (error) {
        entry.reject(error);
      } else {
        entry.resolve(false);
      }
    }
    pending.clear();
  };

  /** Trata uma resposta do worker, associando-a ao pedido pelo requestId. */
  const handleResponse = (response: DecodeResponse): void => {
    const entry = pending.get(response.requestId);
    if (response.type === 'frame') {
      if (entry?.kind !== 'frame') {
        response.frame?.close();
        return;
      }
      pending.delete(response.requestId);
      entry.resolve(response.frame);
      return;
    }
    if (!entry) {
      return;
    }
    pending.delete(response.requestId);
    if (response.type === 'error') {
      entry.reject(new Error(response.message));
      return;
    }
    if (entry.kind === 'open') {
      if (response.ok) {
        readyAssets.add(entry.assetId);
      }
      entry.resolve(response.ok);
    }
  };

  /** Devolve o worker único, criando-o e ligando os eventos na primeira vez. */
  const getWorker = (): Worker => {
    if (worker) {
      return worker;
    }
    const created = new Worker(new URL('../workers/decode.worker.ts', import.meta.url), { type: 'module' });
    created.onmessage = (event: MessageEvent<DecodeResponse>) => {
      handleResponse(event.data);
    };
    created.onerror = (event: ErrorEvent) => {
      settleAll(new Error(event.message || 'Falha no worker de decodificação'));
      openMemo.clear();
      readyAssets.clear();
      created.terminate();
      worker = null;
    };
    worker = created;
    return created;
  };

  /** Envia uma requisição ao worker. */
  const post = (request: DecodeRequest): void => {
    getWorker().postMessage(request);
  };

  /** Pede a abertura do asset e aguarda a resposta. */
  const requestOpen = (asset: Asset): Promise<boolean> =>
    new Promise<boolean>((resolve, reject) => {
      const requestId = nextRequestId++;
      pending.set(requestId, { kind: 'open', assetId: asset.id, resolve, reject });
      post({ type: 'open', requestId, assetId: asset.id, opfsPath: asset.opfsPath });
    });

  /** Abre o asset uma única vez; o resultado (inclusive false) fica memoizado. */
  const openAsset = (asset: Asset): Promise<boolean> => {
    if (!isWebCodecsSupported() || !canDemux(asset)) {
      return Promise.resolve(false);
    }
    const memo = openMemo.get(asset.id);
    if (memo) {
      return memo;
    }
    const opening = requestOpen(asset);
    openMemo.set(asset.id, opening);
    return opening;
  };

  return {
    open: openAsset,
    async getFrame(asset, mediaTimeMs, exact) {
      const ready = await openAsset(asset);
      if (!ready) {
        return null;
      }
      // Pedidos superados não são descartados aqui (devolver null faria a camada sumir num quadro):
      // o worker responde os superados na hora com o quadro mais próximo já decodificado.
      return new Promise<VideoFrame | null>((resolve, reject) => {
        const requestId = nextRequestId++;
        pending.set(requestId, { kind: 'frame', assetId: asset.id, exact, resolve, reject });
        post({ type: 'frame', requestId, assetId: asset.id, timeMs: mediaTimeMs, exact });
      });
    },
    prefetch(asset, mediaTimeMs, direction) {
      if (!readyAssets.has(asset.id)) {
        return;
      }
      post({ type: 'prefetch', assetId: asset.id, timeMs: mediaTimeMs, direction });
    },
    close(assetId) {
      openMemo.delete(assetId);
      readyAssets.delete(assetId);
      for (const [requestId, entry] of pending) {
        if (entry.kind === 'frame' && entry.assetId === assetId) {
          pending.delete(requestId);
          entry.resolve(null);
        }
      }
      if (worker) {
        post({ type: 'close', assetId });
      }
    },
    dispose() {
      settleAll(null);
      openMemo.clear();
      readyAssets.clear();
      worker?.terminate();
      worker = null;
    },
  };
}
