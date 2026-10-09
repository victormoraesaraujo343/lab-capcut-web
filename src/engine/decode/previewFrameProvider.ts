import type { Asset } from '../../types/project';
import type { FrameImage, FrameProvider, FrameRequest } from '../../types/render';
import { createImageSource, type ImageSource } from './imageSource';
import { createVideoElementSource, type VideoElementSource } from './videoElementSource';
import { canDemux, createWebCodecsSource, isWebCodecsSupported } from './webcodecsSource';

type WebCodecsSource = ReturnType<typeof createWebCodecsSource>;

/** Provedor de quadros da prévia, com aviso de reprodução para trocar seek por tocar nativamente. */
export interface PreviewFrameProvider extends FrameProvider {
  /** Avisa se a linha do tempo está tocando. A velocidade vem de cada pedido (FrameRequest.rate); o parâmetro é ignorado. */
  setPlaying(playing: boolean, rate?: number): void;
}

/** Cria o provedor da prévia: imagens por bitmap, vídeo por WebCodecs quando possível, senão por <video>. */
export function createPreviewFrameProvider(): PreviewFrameProvider {
  const images: ImageSource = createImageSource();
  const elements: VideoElementSource = createVideoElementSource();
  const fallbackIds = new Set<string>();
  const openings = new Map<string, Promise<boolean>>();
  let webcodecs: WebCodecsSource | null = null;
  let playing = false;
  let disposed = false;

  /** Devolve a fonte WebCodecs, criando-a na primeira necessidade. */
  function getWebCodecs(): WebCodecsSource {
    if (webcodecs === null) {
      webcodecs = createWebCodecsSource();
    }
    return webcodecs;
  }

  /** Diz se o vídeo deve tentar WebCodecs (suportado, demuxável e ainda não marcado como fallback). */
  function usesWebCodecs(asset: Asset): boolean {
    return asset.kind === 'video' && !fallbackIds.has(asset.id) && isWebCodecsSupported() && canDemux(asset);
  }

  /** Abre o asset no WebCodecs uma única vez; falha marca o asset como fallback permanente. */
  function ensureOpen(asset: Asset): Promise<boolean> {
    const existing = openings.get(asset.id);
    if (existing !== undefined) {
      return existing;
    }
    const opening = new Promise<boolean>((resolve) => {
      resolve(getWebCodecs().open(asset));
    })
      .catch(() => false)
      .then((ok) => {
        if (!ok) {
          fallbackIds.add(asset.id);
        }
        return ok;
      });
    openings.set(asset.id, opening);
    return opening;
  }

  /** Pede um quadro ao WebCodecs; durante a reprodução nunca exige o quadro exato. */
  async function decodeWithWebCodecs(asset: Asset, mediaTimeMs: number, exact: boolean): Promise<FrameImage | null> {
    return getWebCodecs().getFrame(asset, mediaTimeMs, playing ? false : exact);
  }

  /** Pega o quadro pelo <video>; durante a reprodução toca na velocidade do pedido em vez de dar seek. */
  function getElementFrame(asset: Asset, mediaTimeMs: number, request: FrameRequest): Promise<FrameImage | null> {
    if (playing) {
      return elements.playSync(asset, mediaTimeMs, request.rate ?? 1);
    }
    return elements.getFrame(asset, mediaTimeMs, request.exact);
  }

  async function getFrame(asset: Asset, mediaTimeMs: number, request: FrameRequest): Promise<FrameImage | null> {
    if (disposed) {
      return null;
    }
    if (asset.kind === 'image' || asset.kind === 'sticker') {
      return images.getImage(asset);
    }
    if (asset.kind !== 'video') {
      return null;
    }
    if (usesWebCodecs(asset) && (await ensureOpen(asset))) {
      try {
        return await decodeWithWebCodecs(asset, mediaTimeMs, request.exact);
      } catch {
        // Rejeição do WebCodecs (codec fechado ou erro de decodificação): o asset vira fallback permanente.
        markFallback(asset);
      }
    }
    return getElementFrame(asset, mediaTimeMs, request);
  }

  /** Marca o asset como fallback permanente e fecha a decodificação dele no WebCodecs. */
  function markFallback(asset: Asset): void {
    fallbackIds.add(asset.id);
    if (!disposed) {
      getWebCodecs().close(asset.id);
    }
  }

  function prefetch(asset: Asset, mediaTimeMs: number, direction: 1 | -1): void {
    if (disposed || !usesWebCodecs(asset)) {
      return;
    }
    // Pré-carga é melhor esforço: falhas aqui não devem virar erro na prévia.
    void ensureOpen(asset)
      .then((opened) => {
        if (opened) {
          getWebCodecs().prefetch(asset, mediaTimeMs, direction);
        }
      })
      .catch(() => undefined);
  }

  function releaseFrame(frame: FrameImage): void {
    // Bitmaps pertencem ao cache de imagens e elementos ao <video>: só VideoFrame é fechado aqui.
    if (images.owns(frame)) {
      return;
    }
    if (!('close' in frame)) {
      return;
    }
    frame.close();
  }

  function setPlaying(next: boolean): void {
    playing = next;
    if (!next) {
      elements.pauseAll();
    }
  }

  function closeAsset(assetId: string): void {
    if (!disposed) {
      getWebCodecs().close(assetId);
    }
    elements.close(assetId);
    images.close(assetId);
    openings.delete(assetId);
    fallbackIds.delete(assetId);
  }

  function dispose(): void {
    disposed = true;
    playing = false;
    elements.dispose();
    images.dispose();
    webcodecs?.dispose();
    webcodecs = null;
    openings.clear();
    fallbackIds.clear();
  }

  return { getFrame, prefetch, releaseFrame, closeAsset, dispose, setPlaying };
}
