import type { Asset } from '../../types/project';
import type { FrameImage, FrameProvider, FrameRequest } from '../../types/render';
import { createImageSource, type ImageSource } from './imageSource';
import { createVideoElementSource, type VideoElementSource } from './videoElementSource';
import { canDemux, createWebCodecsSource, isWebCodecsSupported } from './webcodecsSource';
import { findProxy } from '../proxy/proxyPolicy';
import { useProjectStore } from '../../stores/projectStore';
import { useProxySettingsStore } from '../../stores/proxySettingsStore';

type WebCodecsSource = ReturnType<typeof createWebCodecsSource>;

/** Quantos decodificadores, no máximo, um mesmo vídeo ganha ao tocar em vários clipes ao mesmo tempo. */
const MAX_LANES = 2;

/** Pedinte que ocupa uma vaga de decodificador de um vídeo, com o último uso. */
interface LaneSlot {
  lane: string;
  lastUse: number;
}

/** Provedor de quadros da prévia, com aviso de reprodução para trocar seek por tocar nativamente. */
export interface PreviewFrameProvider extends FrameProvider {
  /** Avisa se a linha do tempo está tocando. A velocidade vem de cada pedido (FrameRequest.rate); o parâmetro é ignorado. */
  setPlaying(playing: boolean, rate?: number): void;
}

/** Opções do provedor da prévia; sem elas, vale a preferência salva e o projeto aberto. */
export interface PreviewFrameProviderOptions {
  /** Diz se as cópias leves podem ser usadas agora. */
  proxiesEnabled?: () => boolean;
  /** Acha a cópia leve pronta de um vídeo (undefined = sem cópia). */
  findReadyProxy?: (asset: Asset) => Asset | undefined;
}

/** Preferência salva da prévia leve. */
function defaultProxiesEnabled(): boolean {
  return useProxySettingsStore.getState().enabled;
}

/** Cópia leve pronta do vídeo no projeto aberto. */
function defaultFindReadyProxy(asset: Asset): Asset | undefined {
  const project = useProjectStore.getState().project;
  return project === null ? undefined : findProxy(project, asset.id);
}

/** Cria o provedor da prévia: imagens por bitmap, vídeo por WebCodecs quando possível, senão por <video>. Com a prévia leve ligada, vídeos decodificam a cópia 540p quando ela existe. */
export function createPreviewFrameProvider(options: PreviewFrameProviderOptions = {}): PreviewFrameProvider {
  const proxiesEnabled = options.proxiesEnabled ?? defaultProxiesEnabled;
  const findReadyProxy = options.findReadyProxy ?? defaultFindReadyProxy;
  // Cópia leve usada no lugar de cada vídeo original (para fechar a cópia junto com a origem).
  const proxyOf = new Map<string, string>();
  const images: ImageSource = createImageSource();
  const elements: VideoElementSource = createVideoElementSource();
  const fallbackIds = new Set<string>();
  const openings = new Map<string, Promise<boolean>>();
  const laneSlots = new Map<string, LaneSlot[]>();
  let laneClock = 0;
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

  /**
   * Asset que o pedinte usa no WebCodecs: a 1ª vaga é o próprio asset; a 2ª é uma cópia com id "<id>#2" (outro
   * decodificador do mesmo arquivo). Assim dois clipes do mesmo vídeo tocando juntos não ficam disputando um decodificador.
   * Sem vaga livre, o pedinte toma a vaga usada há mais tempo.
   */
  function laneAsset(asset: Asset, lane: string | undefined): Asset {
    if (lane === undefined) return asset;
    const slots = laneSlots.get(asset.id) ?? [];
    laneSlots.set(asset.id, slots);
    laneClock += 1;
    let index = slots.findIndex((slot) => slot.lane === lane);
    if (index === -1 && slots.length < MAX_LANES) {
      index = slots.push({ lane, lastUse: laneClock }) - 1;
    } else if (index === -1) {
      index = slots.reduce((oldest, slot, i) => (slot.lastUse < (slots[oldest]?.lastUse ?? Infinity) ? i : oldest), 0);
      slots[index] = { lane, lastUse: laneClock };
    }
    const slot = slots[index];
    if (slot !== undefined) slot.lastUse = laneClock;
    return index === 0 ? asset : { ...asset, id: `${asset.id}#${index + 1}` };
  }

  /** Diz qual asset decodificar: a cópia leve pronta quando a prévia leve está ligada; senão o próprio original. */
  function sourceFor(original: Asset): Asset {
    if (!proxiesEnabled()) {
      return original;
    }
    const proxy = findReadyProxy(original);
    if (proxy === undefined) {
      return original;
    }
    proxyOf.set(original.id, proxy.id);
    return proxy;
  }

  async function getFrame(requested: Asset, mediaTimeMs: number, request: FrameRequest): Promise<FrameImage | null> {
    if (disposed) {
      return null;
    }
    if (requested.kind === 'image' || requested.kind === 'sticker') {
      return images.getImage(requested, mediaTimeMs);
    }
    if (requested.kind !== 'video') {
      return null;
    }
    // A camada (tamanho, caixa de seleção) continua usando o original; só a decodificação troca de fonte.
    const asset = sourceFor(requested);
    const decoder = usesWebCodecs(asset) ? laneAsset(asset, request.lane) : null;
    if (decoder !== null && (await ensureOpen(decoder))) {
      try {
        return await decodeWithWebCodecs(decoder, mediaTimeMs, request.exact);
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
      for (const id of laneIds(asset.id)) getWebCodecs().close(id);
    }
    laneSlots.delete(asset.id);
  }

  function prefetch(requested: Asset, mediaTimeMs: number, direction: 1 | -1, lane?: string): void {
    if (disposed || requested.kind !== 'video') {
      return;
    }
    const asset = sourceFor(requested);
    if (!usesWebCodecs(asset)) {
      return;
    }
    // Pré-carga é melhor esforço: falhas aqui não devem virar erro na prévia.
    const decoder = laneAsset(asset, lane);
    void ensureOpen(decoder)
      .then((opened) => {
        if (opened) {
          getWebCodecs().prefetch(decoder, mediaTimeMs, direction);
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
    // Fecha também a cópia leve usada no lugar desta origem, se houver.
    const proxyId = proxyOf.get(assetId);
    proxyOf.delete(assetId);
    const ids = proxyId === undefined ? laneIds(assetId) : [...laneIds(assetId), ...laneIds(proxyId)];
    laneSlots.delete(assetId);
    if (proxyId !== undefined) laneSlots.delete(proxyId);
    for (const id of ids) {
      if (!disposed) {
        getWebCodecs().close(id);
      }
      elements.close(id);
      images.close(id);
      openings.delete(id);
      fallbackIds.delete(id);
    }
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
    proxyOf.clear();
    laneSlots.clear();
  }

  /** Ids de todos os decodificadores (vagas) de um asset. */
  function laneIds(assetId: string): string[] {
    const ids = [assetId];
    for (let index = 1; index < MAX_LANES; index += 1) ids.push(`${assetId}#${index + 1}`);
    return ids;
  }

  return { getFrame, prefetch, releaseFrame, closeAsset, dispose, setPlaying };
}
