// Função única de render: prévia e exportação passam por aqui, com a mesma pipeline.
import type { Asset, Project } from '../../types/project';
import type { Compositor, FrameImage, FrameProvider, Layer, TextRasterizer } from '../../types/render';
import { createTextRasterizer } from '../text/textRasterizer';
import { resolveLayers } from './composition';

/** Opções de um quadro composto: escala do quadro de saída, precisão e cor de fundo. */
export interface RenderFrameOptions {
  /** Fator de escala sobre o tamanho do projeto (ex.: 0.5 para prévia leve). */
  scale: number;
  /** true = quadro exato (exportação); false = aceita o mais próximo pronto (prévia). */
  exact: boolean;
  /** Cor de fundo CSS; padrão '#000000'. */
  background?: string;
}

/** Pedido de quadro de mídia: a chave é a da imagem no compositor (clipId ou `${clipId}:matte`). */
interface FrameJob {
  /** Chave da imagem no mapa do compositor. */
  key: string;
  /** Asset de origem. */
  asset: Asset;
  /** Instante de mídia pedido, em ms. */
  mediaTimeMs: number;
  /** Velocidade de reprodução da mídia. */
  rate: number;
}

/** Rasterizador padrão do contexto (thread principal ou worker), criado só na primeira camada de texto. */
let sharedRasterizer: TextRasterizer | null = null;

/** Devolve o rasterizador padrão do contexto, criando-o preguiçosamente. */
function defaultRasterizer(): TextRasterizer {
  sharedRasterizer ??= createTextRasterizer();
  return sharedRasterizer;
}

/** Camada e, se houver transição, a que entra: as duas precisam de imagem. */
function layerFamily(layer: Layer): Layer[] {
  return layer.transition ? [layer, layer.transition.incoming] : [layer];
}

/** Lista os quadros a buscar: a imagem de cada camada (e da que entra) e a máscara de recorte, quando houver. */
function collectJobs(layers: Layer[], assets: Map<string, Asset>): FrameJob[] {
  const jobs: FrameJob[] = [];
  for (const layer of layers) {
    for (const item of layerFamily(layer)) {
      const asset = item.assetId ? assets.get(item.assetId) : undefined;
      if (asset) jobs.push({ key: item.clipId, asset, mediaTimeMs: item.mediaTimeMs, rate: item.playbackRate });
      if (item.matte) {
        const matteAsset = assets.get(item.matte.assetId);
        if (matteAsset) jobs.push({ key: `${item.clipId}:matte`, asset: matteAsset, mediaTimeMs: item.matte.mediaTimeMs, rate: 1 });
      }
    }
  }
  return jobs;
}

/**
 * Desenha o quadro do instante na escala pedida e devolve as camadas desenhadas.
 * Camadas de texto são rasterizadas pelo rasterizador (dono do próprio cache), não pelo provider.
 */
export async function renderFrame(
  compositor: Compositor,
  project: Project,
  timelineMs: number,
  provider: FrameProvider,
  options: RenderFrameOptions,
  textRasterizer?: TextRasterizer,
): Promise<Layer[]> {
  if (!(options.scale > 0)) throw new Error('invalid-render-scale');
  const layers = resolveLayers(project, timelineMs);
  const assets = new Map<string, Asset>(project.assets.map((asset) => [asset.id, asset]));
  const jobs = collectJobs(layers, assets);

  const settled = await Promise.allSettled(
    jobs.map((job) =>
      provider
        .getFrame(job.asset, job.mediaTimeMs, { exact: options.exact, rate: job.rate })
        .then((frame) => ({ key: job.key, frame })),
    ),
  );

  const frames = new Map<string, FrameImage>();
  const owned: FrameImage[] = [];
  let failure: { reason: unknown } | null = null;
  for (const result of settled) {
    if (result.status === 'rejected') {
      failure ??= { reason: result.reason };
    } else if (result.value.frame) {
      frames.set(result.value.key, result.value.frame);
      owned.push(result.value.frame);
    }
  }
  if (failure) {
    releaseAll(provider, owned);
    throw failure.reason;
  }

  try {
    const { drawn, images } = assembleLayers(layers, frames, () => textRasterizer ?? defaultRasterizer());
    compositor.draw(drawn, images, {
      width: Math.round(project.width * options.scale),
      height: Math.round(project.height * options.scale),
      background: options.background ?? '#000000',
      frameWidth: project.width,
      frameHeight: project.height,
    });
    return drawn;
  } finally {
    releaseAll(provider, owned);
  }
}

/** Põe uma camada no mapa de imagens (texto é rasterizado; mídia usa o quadro obtido e a máscara). Null sem imagem. */
function place(
  layer: Layer,
  frames: Map<string, FrameImage>,
  images: Map<string, FrameImage>,
  rasterizer: () => TextRasterizer,
): Layer | null {
  if (layer.text) {
    const surface = rasterizer().rasterize(layer.text.data, layer.text.reveal);
    images.set(layer.clipId, surface);
    return { ...layer, sourceWidth: surface.width, sourceHeight: surface.height };
  }
  const frame = frames.get(layer.clipId);
  if (frame === undefined) return null;
  images.set(layer.clipId, frame);
  const matte = frames.get(`${layer.clipId}:matte`);
  if (matte !== undefined) images.set(`${layer.clipId}:matte`, matte);
  return layer;
}

/**
 * Junta as camadas na ordem de resolução: quadros obtidos e textos rasterizados.
 * Transição: a camada que sai carrega a que entra (já com imagem própria); a que entra não vai separada na lista.
 */
function assembleLayers(
  layers: Layer[],
  frames: Map<string, FrameImage>,
  rasterizer: () => TextRasterizer,
): { drawn: Layer[]; images: Map<string, FrameImage> } {
  const drawn: Layer[] = [];
  const images = new Map<string, FrameImage>();
  for (const layer of layers) {
    const transition = layer.transition;
    if (!transition) {
      const placed = place(layer, frames, images, rasterizer);
      if (placed) drawn.push(placed);
      continue;
    }
    const outgoing = place(layer, frames, images, rasterizer);
    const incoming = place(transition.incoming, frames, images, rasterizer);
    if (!outgoing && !incoming) continue;
    drawn.push({ ...(outgoing ?? layer), transition: { ...transition, incoming: incoming ?? transition.incoming } });
  }
  return { drawn, images };
}

/** Pré-carrega quadros ao redor do instante para as camadas que estão tocando. */
export function prefetchAround(project: Project, timelineMs: number, provider: FrameProvider, direction: 1 | -1): void {
  const assets = new Map<string, Asset>(project.assets.map((asset) => [asset.id, asset]));
  for (const layer of resolveLayers(project, timelineMs)) {
    if (!layer.assetId) continue;
    const asset = assets.get(layer.assetId);
    if (asset) provider.prefetch(asset, layer.mediaTimeMs, direction);
  }
}

/** Solta todos os quadros obtidos do provider. */
function releaseAll(provider: FrameProvider, frames: FrameImage[]): void {
  for (const frame of frames) {
    provider.releaseFrame(frame);
  }
}
