// Mídia ausente: verifica os arquivos ao abrir o projeto e relocaliza um arquivo escolhido pelo usuário no mesmo caminho.

import { create } from 'zustand';
import { t } from '@/i18n/pt-BR';
import { readMediaMetadata } from '@/engine/decode/metadata';
import { findMissingAssets } from '@/engine/storage/missingMedia';
import { revokeObjectUrl, writeFile } from '@/engine/storage/opfs';
import type { Asset, Project } from '@/types';
import { useProjectStore } from './projectStore';
import { useToastStore } from './toastStore';

/** Diferença de duração, em ms, acima da qual o arquivo escolhido é avisado como possivelmente diferente. */
const DURATION_TOLERANCE_MS = 1000;

/** Store com os ids das mídias do projeto aberto cujo arquivo sumiu. */
export interface MissingMediaState {
  /** Ids dos assets sem arquivo no OPFS. */
  missingIds: string[];
  /** Substitui a lista de ids ausentes. */
  setMissingIds: (ids: string[]) => void;
}

/** Hook com a lista de mídias ausentes do projeto aberto. */
export const useMissingMediaStore = create<MissingMediaState>()((set) => ({
  missingIds: [],

  // Substitui a lista de ids ausentes.
  setMissingIds: (ids) => set({ missingIds: ids }),
}));

/** Verifica no OPFS quais mídias do projeto sumiram e guarda os ids; ignora o resultado se outro projeto já estiver aberto. */
export async function checkMissingMedia(project: Project): Promise<void> {
  try {
    const ids = await findMissingAssets(project);
    if (useProjectStore.getState().project?.id === project.id) {
      useMissingMediaStore.getState().setMissingIds(ids);
    }
  } catch {
    // Sem OPFS não dá para verificar: nenhuma mídia é marcada como ausente.
  }
}

/** Lê a duração do arquivo escolhido; undefined para figurinhas ou quando a leitura falha. */
async function probeDurationMs(file: File, asset: Asset): Promise<number | undefined> {
  if (asset.kind === 'sticker') return undefined;
  try {
    const metadata = await readMediaMetadata(file, asset.kind);
    return metadata.durationMs;
  } catch {
    return undefined;
  }
}

/** Grava o arquivo escolhido no mesmo caminho do asset ausente e o tira da lista; avisa se a duração for muito diferente, mas mantém. */
export async function relinkAsset(assetId: string, file: File): Promise<void> {
  const asset = useProjectStore.getState().project?.assets.find((item) => item.id === assetId);
  if (asset === undefined) return;

  const newDurationMs = await probeDurationMs(file, asset);
  await writeFile(asset.opfsPath, file);
  revokeObjectUrl(asset.opfsPath);
  useMissingMediaStore.setState((state) => ({
    missingIds: state.missingIds.filter((id) => id !== assetId),
  }));

  const originalDurationMs = asset.durationMs;
  if (
    newDurationMs !== undefined &&
    originalDurationMs !== undefined &&
    Math.abs(newDurationMs - originalDurationMs) > DURATION_TOLERANCE_MS
  ) {
    useToastStore.getState().pushToast(t.missingMedia.durationWarning, 'info');
  }
}
