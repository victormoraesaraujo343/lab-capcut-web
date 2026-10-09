import type { Asset } from '../../types/project';
import { readFile } from '../storage/opfs';
import {
  animatedMimeOf,
  animationFrameAt,
  canDecodeAnimated,
  closeAnimatedImage,
  decodeAnimatedImage,
  type AnimatedImage,
} from './animatedImage';

/** Fonte de imagens: decodifica o arquivo do OPFS uma vez; GIF/WebP animado guarda todos os quadros. */
export interface ImageSource {
  /** Devolve o bitmap do asset no instante de mídia (cache por id) ou null se não decodificar. Imagem animada: o quadro do instante. */
  getImage(asset: Asset, mediaTimeMs?: number): Promise<ImageBitmap | null>;
  /** Diz se o objeto é um bitmap do cache, que quem recebeu não deve fechar. */
  owns(image: object): boolean;
  /** Fecha o bitmap (ou os quadros) de um asset e esquece o cache dele (ex.: quando o asset sai do projeto). */
  close(assetId: string): void;
  /** Fecha todos os bitmaps do cache e recusa novos pedidos. */
  dispose(): void;
}

/** Cria a fonte de imagens com cache por asset; pedidos simultâneos compartilham a mesma promise. */
export function createImageSource(): ImageSource {
  const cache = new Map<string, Promise<ImageBitmap | null>>();
  const decoded = new Map<string, ImageBitmap>();
  const animations = new Map<string, Promise<AnimatedImage | null>>();
  const bitmaps = new Set<ImageBitmap>();
  let disposed = false;

  async function decode(asset: Asset): Promise<ImageBitmap | null> {
    try {
      const file = await readFile(asset.opfsPath);
      const bitmap = await createImageBitmap(file);
      if (disposed) {
        bitmap.close();
        return null;
      }
      bitmaps.add(bitmap);
      return bitmap;
    } catch {
      // Arquivo ausente ou formato não decodificável: a prévia segue sem essa imagem.
      return null;
    }
  }

  /** Decodifica a imagem parada (caminho antigo: um único bitmap por asset). */
  function getStill(asset: Asset): Promise<ImageBitmap | null> {
    const cached = cache.get(asset.id);
    if (cached !== undefined) {
      return cached;
    }
    const pending: Promise<ImageBitmap | null> = decode(asset).then((bitmap) => {
      if (bitmap === null) {
        if (cache.get(asset.id) === pending) {
          cache.delete(asset.id);
        }
        return null;
      }
      if (disposed || cache.get(asset.id) !== pending) {
        // Asset fechado ou descartado enquanto decodificava: não guarda o bitmap.
        bitmaps.delete(bitmap);
        bitmap.close();
        return null;
      }
      decoded.set(asset.id, bitmap);
      return bitmap;
    });
    cache.set(asset.id, pending);
    return pending;
  }

  /** Lê e decodifica a animação do asset; null se não for animada ou sem suporte (não relê o arquivo nesse caso). */
  async function loadAnimation(asset: Asset, mimeType: string): Promise<AnimatedImage | null> {
    if (!(await canDecodeAnimated(mimeType))) return null;
    try {
      const file = await readFile(asset.opfsPath);
      return await decodeAnimatedImage(file, mimeType);
    } catch {
      return null;
    }
  }

  /** Decodifica a animação uma vez por asset; o cache guarda também o resultado 'não animada' para não reler o arquivo a cada quadro. */
  function getAnimation(asset: Asset, mimeType: string): Promise<AnimatedImage | null> {
    const cached = animations.get(asset.id);
    if (cached !== undefined) {
      return cached;
    }
    const pending: Promise<AnimatedImage | null> = loadAnimation(asset, mimeType).then((animation) => {
      if (animation === null) return null;
      if (disposed || animations.get(asset.id) !== pending) {
        // Asset fechado ou descartado enquanto decodificava: não guarda os quadros.
        closeAnimatedImage(animation);
        return null;
      }
      for (const frame of animation.frames) {
        bitmaps.add(frame);
      }
      return animation;
    });
    animations.set(asset.id, pending);
    return pending;
  }

  async function getImage(asset: Asset, mediaTimeMs = 0): Promise<ImageBitmap | null> {
    if (disposed) {
      return null;
    }
    const mimeType = animatedMimeOf(asset.mimeType, asset.opfsPath);
    if (mimeType !== null) {
      const animation = await getAnimation(asset, mimeType);
      if (animation !== null) {
        return disposed ? null : animationFrameAt(animation, mediaTimeMs);
      }
    }
    return getStill(asset);
  }

  function owns(image: object): boolean {
    return bitmaps.has(image as ImageBitmap);
  }

  function close(assetId: string): void {
    cache.delete(assetId);
    const bitmap = decoded.get(assetId);
    if (bitmap !== undefined) {
      decoded.delete(assetId);
      bitmaps.delete(bitmap);
      bitmap.close();
    }
    const animation = animations.get(assetId);
    animations.delete(assetId);
    if (animation !== undefined) {
      void animation.then((loaded) => {
        if (loaded === null) return;
        for (const frame of loaded.frames) {
          bitmaps.delete(frame);
        }
        closeAnimatedImage(loaded);
      });
    }
  }

  function dispose(): void {
    disposed = true;
    for (const bitmap of bitmaps) {
      bitmap.close();
    }
    bitmaps.clear();
    decoded.clear();
    cache.clear();
    animations.clear();
  }

  return { getImage, owns, close, dispose };
}
