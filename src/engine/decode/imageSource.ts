import type { Asset } from '../../types/project';
import { readFile } from '../storage/opfs';

/** Fonte de imagens estáticas: decodifica o arquivo do OPFS uma vez e guarda o ImageBitmap. */
export interface ImageSource {
  /** Devolve o bitmap do asset (cache por id) ou null se não decodificar. GIF animado: fica só o 1º quadro. */
  getImage(asset: Asset): Promise<ImageBitmap | null>;
  /** Diz se o objeto é um bitmap do cache, que quem recebeu não deve fechar. */
  owns(image: object): boolean;
  /** Fecha o bitmap de um asset e esquece o cache dele (ex.: quando o asset sai do projeto). */
  close(assetId: string): void;
  /** Fecha todos os bitmaps do cache e recusa novos pedidos. */
  dispose(): void;
}

/** Cria a fonte de imagens com cache por asset; pedidos simultâneos compartilham a mesma promise. */
export function createImageSource(): ImageSource {
  const cache = new Map<string, Promise<ImageBitmap | null>>();
  const decoded = new Map<string, ImageBitmap>();
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

  function getImage(asset: Asset): Promise<ImageBitmap | null> {
    if (disposed) {
      return Promise.resolve(null);
    }
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
  }

  function dispose(): void {
    disposed = true;
    for (const bitmap of bitmaps) {
      bitmap.close();
    }
    bitmaps.clear();
    decoded.clear();
    cache.clear();
  }

  return { getImage, owns, close, dispose };
}
