// Store do projeto atualmente aberto no editor.
import { create } from 'zustand';
import type { Project } from '@/types';

/** Estado e ações do projeto aberto. */
export interface ProjectState {
  /** Projeto aberto, ou null quando nenhum está carregado. */
  project: Project | null;
  /** Define o projeto aberto (ou remove, com null). */
  setProject: (p: Project | null) => void;
  /** Renomeia o projeto aberto e atualiza a data de alteração; não faz nada sem projeto. */
  renameProject: (name: string) => void;
}

/** Hook com o projeto aberto e suas ações. */
export const useProjectStore = create<ProjectState>()((set) => ({
  project: null,
  // Define o projeto aberto.
  setProject: (p) => set({ project: p }),
  // Renomeia o projeto aberto e marca a alteração.
  renameProject: (name) =>
    set((state) =>
      state.project === null
        ? state
        : { project: { ...state.project, name, updatedAt: Date.now() } },
    ),
}));
