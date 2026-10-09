// Operações puras sobre o projeto (assets, clipes, pastas) e a importação sequencial de arquivos.

import { importOneFile, toImportErrorCode, type ImportErrorCode } from '@/engine/import/importMedia';
import { createId } from '@/engine/project/createProject';
import { deleteEntry, revokeObjectUrl } from '@/engine/storage/opfs';
import { thumbDir } from '@/engine/storage/paths';
import { computeProjectDuration, type Asset, type Folder, type Project } from '@/types';
import { saveProject } from '@/engine/storage/db';
import { findTemplate } from '@/engine/templates/templates';
import { projectFromTemplate } from '@/engine/templates/buildTemplate';
import { t } from '@/i18n/pt-BR';
import { useProjectStore } from './projectStore';
import { flushSave } from './projectPersistence';

/** Andamento da importação em curso. */
export interface ImportProgress {
  /** Quantidade de arquivos na importação. */
  total: number;
  /** Quantidade de arquivos já processados. */
  done: number;
  /** Nome do arquivo sendo processado. */
  currentName: string;
}

/** Erro de importação de um arquivo, exibido para o usuário. */
export interface ImportErrorItem {
  /** Identificador do erro na lista. */
  id: string;
  /** Nome do arquivo que falhou. */
  fileName: string;
  /** Motivo da falha. */
  code: ImportErrorCode;
}

/** Callbacks pelos quais a importação informa a store o que acontece. */
export interface ImportHooks {
  /** Diz se o projeto com este id ainda é o aberto. */
  isOpen: (projectId: string) => boolean;
  /** Recebe o andamento atual, ou null quando a importação termina. */
  onProgress: (progress: ImportProgress | null) => void;
  /** Recebe cada asset assim que a importação dele termina. */
  onAsset: (asset: Asset) => void;
  /** Recebe cada erro de importação. */
  onError: (item: ImportErrorItem) => void;
}

/** Remove do projeto o asset com o id dado e todos os clipes que o usam, e recalcula a duração. */
export function removeAssetFromProject(project: Project, assetId: string): Project {
  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.filter((clip) => clip.assetId !== assetId),
  }));
  return {
    ...project,
    assets: project.assets.filter((asset) => asset.id !== assetId),
    tracks,
    durationMs: computeProjectDuration(tracks),
  };
}

/** Acrescenta uma pasta à biblioteca de mídia do projeto. */
export function withFolderCreated(project: Project, folder: Folder): Project {
  return { ...project, folders: [...project.folders, folder] };
}

/** Troca o nome de uma pasta da biblioteca. */
export function withFolderRenamed(project: Project, folderId: string, name: string): Project {
  return {
    ...project,
    folders: project.folders.map((folder) => (folder.id === folderId ? { ...folder, name } : folder)),
  };
}

/** Remove uma pasta; os assets que estavam nela voltam para a raiz da biblioteca. */
export function withFolderDeleted(project: Project, folderId: string): Project {
  return {
    ...project,
    folders: project.folders.filter((folder) => folder.id !== folderId),
    assets: project.assets.map((asset) =>
      asset.folderId === folderId ? { ...asset, folderId: undefined } : asset,
    ),
  };
}

/** Move um asset para a pasta indicada, ou para a raiz quando folderId é undefined. */
export function withAssetFolder(project: Project, assetId: string, folderId: string | undefined): Project {
  return {
    ...project,
    assets: project.assets.map((asset) => (asset.id === assetId ? { ...asset, folderId } : asset)),
  };
}

/** Libera as object URLs em cache da mídia e das miniaturas de um asset. */
export function revokeAssetUrls(asset: Asset): void {
  revokeObjectUrl(asset.opfsPath);
  for (const thumbnail of asset.thumbnails) {
    revokeObjectUrl(thumbnail);
  }
}

/** Apaga do OPFS a mídia e a pasta de miniaturas de um asset. */
export async function removeAssetFiles(projectId: string, asset: Asset): Promise<void> {
  await deleteEntry(asset.opfsPath);
  await deleteEntry(thumbDir(projectId, asset.id));
}

/** Importa os arquivos um a um, sem paralelismo, avisando a store a cada passo; para se o projeto deixar de estar aberto. */
export async function importSequentially(
  projectId: string,
  files: readonly File[],
  hooks: ImportHooks,
): Promise<void> {
  let done = 0;
  for (const file of files) {
    if (!hooks.isOpen(projectId)) break;
    hooks.onProgress({ total: files.length, done, currentName: file.name });
    try {
      const asset = await importOneFile(projectId, file);
      if (!hooks.isOpen(projectId)) {
        await removeAssetFiles(projectId, asset);
        break;
      }
      hooks.onAsset(asset);
    } catch (error) {
      hooks.onError({ id: createId(), fileName: file.name, code: toImportErrorCode(error) });
    }
    done += 1;
  }
  hooks.onProgress(null);
}

/** Cria e salva um projeto a partir do modelo (nome = nome do modelo), abre-o no editor e devolve o id. */
export async function createProjectFromTemplate(templateId: string): Promise<string> {
  const def = findTemplate(templateId);
  if (def === undefined) throw new Error(`Modelo não encontrado: ${templateId}`);
  await flushSave();
  const project = projectFromTemplate(def, t.templates.names[def.labelKey]);
  await saveProject(project);
  useProjectStore.setState({ project });
  await useProjectStore.getState().loadProjects();
  return project.id;
}
