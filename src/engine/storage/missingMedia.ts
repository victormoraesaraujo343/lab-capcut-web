// Verificação de mídia ausente: diz quais arquivos do projeto sumiram do OPFS.

import { fileExists } from './opfs';
import type { Asset, Project } from '@/types';

/** Diz se o asset é mídia do usuário que tem arquivo; figurinhas e arquivos gerados pelo editor ficam de fora. */
function isUserMedia(asset: Asset): boolean {
  return asset.opfsPath.length > 0 && asset.role === undefined && asset.kind !== 'sticker';
}

/** Devolve os ids dos assets do projeto cujo arquivo não existe mais no OPFS; assets sem arquivo são ignorados. */
export async function findMissingAssets(project: Project): Promise<string[]> {
  const missing: string[] = [];
  for (const asset of project.assets) {
    if (!isUserMedia(asset)) continue;
    if (!(await fileExists(asset.opfsPath))) missing.push(asset.id);
  }
  return missing;
}
