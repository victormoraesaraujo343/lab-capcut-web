// Função única de render: prévia e exportação passam por aqui, com a mesma pipeline.
import type { Asset, Project } from '../../types/project';
import type { Compositor, FrameImage, FrameProvider, Layer } from '../../types/render';
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

/** Camada com o quadro já obtido do provider. */
interface FetchedLayer {
  /** Camada de origem. */
  layer: Layer;
  /** Quadro obtido, nunca null. */
  frame: FrameImage;
}

/** Desenha o quadro do instante na escala pedida e devolve as camadas desenhadas. */
export async function renderFrame(
  compositor: Compositor,
  project: Project,
  timelineMs: number,
  provider: FrameProvider,
  options: RenderFrameOptions,
): Promise<Layer[]> {
  if (!(options.scale > 0)) throw new Error('invalid-render-scale');
  const layers = resolveLayers(project, timelineMs);
  const assets = new Map<string, Asset>(project.assets.map((asset) => [asset.id, asset]));

  const requests: Array<{ layer: Layer; asset: Asset }> = [];
  for (const layer of layers) {
    if (!layer.assetId) continue;
    const asset = assets.get(layer.assetId);
    if (asset) requests.push({ layer, asset });
  }

  const settled = await Promise.allSettled(
    requests.map(({ layer, asset }) =>
      provider
        .getFrame(asset, layer.mediaTimeMs, { exact: options.exact, rate: layer.playbackRate })
        .then((frame) => ({ layer, frame })),
    ),
  );

  const fetched: FetchedLayer[] = [];
  let failure: { reason: unknown } | null = null;
  for (const result of settled) {
    if (result.status === 'rejected') {
      failure ??= { reason: result.reason };
    } else if (result.value.frame) {
      fetched.push({ layer: result.value.layer, frame: result.value.frame });
    }
  }
  if (failure) {
    releaseAll(provider, fetched);
    throw failure.reason;
  }

  const images = new Map<string, FrameImage>();
  for (const item of fetched) {
    images.set(item.layer.clipId, item.frame);
  }
  const drawn = fetched.map((item) => item.layer);

  try {
    compositor.draw(drawn, images, {
      width: Math.round(project.width * options.scale),
      height: Math.round(project.height * options.scale),
      background: options.background ?? '#000000',
      frameWidth: project.width,
      frameHeight: project.height,
    });
  } finally {
    releaseAll(provider, fetched);
  }
  return drawn;
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

/** Solta todos os quadros obtidos. */
function releaseAll(provider: FrameProvider, fetched: FetchedLayer[]): void {
  for (const item of fetched) {
    provider.releaseFrame(item.frame);
  }
}
