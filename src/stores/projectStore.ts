// Store do projeto aberto e da lista de projetos: abrir, criar, importar mídia e gerenciar pastas.
import { create } from 'zustand';
import { t } from '@/i18n/pt-BR';
import { createId, createProject } from '@/engine/project/createProject';
import {
  deleteProject,
  duplicateProject,
  getProject,
  listProjects,
  renameProjectInDb,
  saveProject,
  type ProjectSummary,
} from '@/engine/storage/db';
import { computeProjectDuration, type Asset, type AspectRatio, type Project, type Track } from '@/types';
import { sizeForAspect } from '@/engine/project/aspect';
import {
  importSequentially,
  removeAssetFiles,
  removeAssetFromProject,
  revokeAssetUrls,
  withAssetFolder,
  withFolderCreated,
  withFolderDeleted,
  withFolderRenamed,
  type ImportErrorItem,
  type ImportProgress,
} from './projectActions';
import { cancelPendingSave, flushSave, scheduleSave } from './projectPersistence';

export type { ImportErrorItem, ImportProgress } from './projectActions';

/** Estado e ações do projeto aberto e da lista de projetos. */
export interface ProjectState {
  /** Projeto aberto, ou null quando nenhum está carregado. */
  project: Project | null;
  /** Resumos de todos os projetos, do mais recente para o mais antigo. */
  projects: ProjectSummary[];
  /** Verdadeiro depois da primeira carga da lista de projetos. */
  projectsLoaded: boolean;
  /** Andamento da importação em curso, ou null. */
  importProgress: ImportProgress | null;
  /** Erros da importação ainda não dispensados pelo usuário. */
  importErrors: ImportErrorItem[];
  /** Define o projeto aberto (ou remove, com null). */
  setProject: (p: Project | null) => void;
  /** Renomeia o projeto aberto e agenda o salvamento; não faz nada sem projeto. */
  renameProject: (name: string) => void;
  /** Troca as trilhas do projeto aberto, recalcula a duração e agenda o salvamento. */
  setTracks: (tracks: Track[]) => void;
  /** Recarrega a lista de projetos do banco. */
  loadProjects: () => Promise<void>;
  /** Cria um projeto, salva e o abre. */
  createNewProject: (name?: string) => Promise<void>;
  /** Abre o projeto salvo com o id dado, salvando antes o que estiver pendente. */
  openProject: (id: string) => Promise<void>;
  /** Salva o projeto aberto e fecha-o. */
  closeProject: () => Promise<void>;
  /** Duplica um projeto salvo, com o sufixo "(cópia)" no nome. */
  duplicateProjectById: (id: string) => Promise<void>;
  /** Apaga um projeto salvo, com a mídia dele. */
  deleteProjectById: (id: string) => Promise<void>;
  /** Renomeia um projeto salvo; se for o aberto, atualiza também o estado. */
  renameProjectById: (id: string, name: string) => Promise<void>;
  /** Importa arquivos um a um para o projeto aberto, sem paralelismo; cada asset entra já na pasta dada. */
  importFiles: (files: File[], folderId?: string) => Promise<void>;
  /** Remove um asset do projeto, os clipes que o usam e os arquivos dele no OPFS. */
  removeAsset: (assetId: string) => Promise<void>;
  /** Tira um erro de importação da lista. */
  dismissImportError: (id: string) => void;
  /** Cria uma pasta na biblioteca e devolve o id; sem projeto aberto, nada é criado. */
  createFolder: (name: string) => string;
  /** Renomeia uma pasta da biblioteca. */
  renameFolder: (id: string, name: string) => void;
  /** Apaga uma pasta; os assets dela voltam para a raiz. */
  deleteFolder: (id: string) => void;
  /** Move um asset para uma pasta, ou para a raiz com undefined. */
  moveAssetToFolder: (assetId: string, folderId: string | undefined) => void;
  /** Troca a proporção do projeto aberto e ajusta largura e altura ao preset dela. */
  setAspectRatio: (aspect: AspectRatio) => void;
}

/** Fila das importações: cada lote começa só depois do anterior terminar. */
let importQueue: Promise<void> = Promise.resolve();

/** Hook com o projeto aberto, a lista de projetos e suas ações. */
export const useProjectStore = create<ProjectState>()((set, get) => {
  /** Aplica uma mudança ao projeto aberto, marca a data de alteração e agenda o salvamento. */
  const updateProject = (change: (p: Project) => Project): void => {
    const current = get().project;
    if (current === null) return;
    const next: Project = { ...change(current), updatedAt: Date.now() };
    set({ project: next });
    scheduleSave(next);
  };

  /** Recarrega a lista de projetos e marca como carregada. */
  const refreshList = async (): Promise<void> => {
    const projects = await listProjects();
    set({ projects, projectsLoaded: true });
  };

  return {
    project: null,
    projects: [],
    projectsLoaded: false,
    importProgress: null,
    importErrors: [],

    // Define o projeto aberto.
    setProject: (p) => set({ project: p }),

    // Renomeia o projeto aberto e agenda o salvamento.
    renameProject: (name) => updateProject((p) => ({ ...p, name })),

    // Troca as trilhas e recalcula a duração do projeto.
    setTracks: (tracks) =>
      updateProject((p) => ({ ...p, tracks, durationMs: computeProjectDuration(tracks) })),

    // Recarrega a lista de projetos.
    loadProjects: () => refreshList(),

    // Cria, salva e abre um projeto novo.
    createNewProject: async (name) => {
      await flushSave();
      const project = createProject(name ?? t.home.untitled);
      await saveProject(project);
      set({ project });
      await refreshList();
    },

    // Abre um projeto salvo.
    openProject: async (id) => {
      await flushSave();
      const project = await getProject(id);
      if (!project) throw new Error(`Projeto não encontrado: ${id}`);
      set({ project });
    },

    // Fecha o projeto aberto, salvando antes e liberando as URLs da mídia dele.
    closeProject: async () => {
      await flushSave();
      get().project?.assets.forEach(revokeAssetUrls);
      set({ project: null });
      await refreshList();
    },

    // Duplica um projeto salvo.
    duplicateProjectById: async (id) => {
      await flushSave();
      const source = await getProject(id);
      if (!source) throw new Error(`Projeto não encontrado: ${id}`);
      await duplicateProject(id, `${source.name} ${t.home.copySuffix}`);
      await refreshList();
    },

    // Apaga um projeto salvo e, se ele estiver aberto, fecha-o sem salvar; libera as URLs da mídia dele.
    deleteProjectById: async (id) => {
      const opened = get().project?.id === id ? get().project : null;
      const source = opened ?? (await getProject(id));
      source?.assets.forEach(revokeAssetUrls);
      if (opened !== null) {
        cancelPendingSave();
        set({ project: null });
      }
      await deleteProject(id);
      await refreshList();
    },

    // Renomeia um projeto salvo, pelo estado se ele estiver aberto.
    renameProjectById: async (id, name) => {
      if (get().project?.id === id) {
        updateProject((p) => ({ ...p, name }));
        await flushSave();
      } else {
        await renameProjectInDb(id, name);
      }
      await refreshList();
    },

    // Importa os arquivos na ordem, em fila; cada asset entra já na pasta dada, se ela ainda existir.
    importFiles: (files, folderId) => {
      const projectId = get().project?.id;
      if (projectId === undefined || files.length === 0) return Promise.resolve();
      const run = importQueue.then(() =>
        importSequentially(projectId, files, {
          isOpen: (id) => get().project?.id === id,
          onProgress: (importProgress) => set({ importProgress }),
          onAsset: (asset: Asset) =>
            updateProject((p) => {
              const inFolder = folderId !== undefined && p.folders.some((folder) => folder.id === folderId);
              const entry: Asset = inFolder ? { ...asset, folderId } : asset;
              return { ...p, assets: [...p.assets, entry] };
            }),
          onError: (item) => set((state) => ({ importErrors: [...state.importErrors, item] })),
        }),
      );
      importQueue = run.catch(() => undefined);
      return run;
    },

    // Remove o asset, seus clipes, seus arquivos e as URLs de mídia dele.
    removeAsset: async (assetId) => {
      const project = get().project;
      const asset = project?.assets.find((a) => a.id === assetId);
      if (project === null || asset === undefined) return;
      revokeAssetUrls(asset);
      updateProject((p) => removeAssetFromProject(p, assetId));
      await removeAssetFiles(project.id, asset);
    },

    // Tira um erro da lista de importação.
    dismissImportError: (id) =>
      set((state) => ({ importErrors: state.importErrors.filter((item) => item.id !== id) })),

    // Cria uma pasta na biblioteca.
    createFolder: (name) => {
      const id = createId();
      updateProject((p) => withFolderCreated(p, { id, name }));
      return id;
    },

    // Renomeia uma pasta.
    renameFolder: (id, name) => updateProject((p) => withFolderRenamed(p, id, name)),

    // Apaga uma pasta.
    deleteFolder: (id) => updateProject((p) => withFolderDeleted(p, id)),

    // Move um asset entre pastas.
    moveAssetToFolder: (assetId, folderId) => updateProject((p) => withAssetFolder(p, assetId, folderId)),

    // Troca a proporção e o tamanho do projeto aberto.
    setAspectRatio: (aspect) =>
      updateProject((p) => ({ ...p, aspectRatio: aspect, ...sizeForAspect(aspect, p) })),
  };
});
