// Cache de AudioBuffers decodificados por asset, com uma única decodificação por arquivo.

import type { Asset } from '../../types/project';
import { readFile } from '../storage/opfs';

/** Cache de buffers de áudio decodificados, indexado pelo id do asset. */
export interface AudioBufferCache {
  /** Retorna o buffer decodificado do asset, ou null se não houver áudio ou a decodificação falhar. */
  get(asset: Asset): Promise<AudioBuffer | null>;
  /** Esquece todos os buffers memorizados. */
  clear(): void;
}

/** Cria um cache de buffers de áudio que decodifica cada asset no máximo uma vez. */
export function createAudioBufferCache(ctx: BaseAudioContext): AudioBufferCache {
  const entries = new Map<string, Promise<AudioBuffer | null>>();
  return {
    get(asset: Asset): Promise<AudioBuffer | null> {
      const cached = entries.get(asset.id);
      if (cached !== undefined) {
        return cached;
      }
      const pending = decodeAsset(ctx, asset);
      entries.set(asset.id, pending);
      return pending;
    },
    clear(): void {
      entries.clear();
    },
  };
}

async function decodeAsset(ctx: BaseAudioContext, asset: Asset): Promise<AudioBuffer | null> {
  if (asset.kind !== 'video' && asset.kind !== 'audio') {
    return null;
  }
  try {
    const file = await readFile(asset.opfsPath);
    const data = await file.arrayBuffer();
    return await ctx.decodeAudioData(data);
  } catch {
    return null;
  }
}
