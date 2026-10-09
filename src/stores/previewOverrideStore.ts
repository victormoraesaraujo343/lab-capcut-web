// Ajuste temporário de transformação durante um arrasto na prévia (ainda não gravado no projeto).
// A alça de transformação escreve aqui a cada movimento; o renderizador da prévia aplica por cima do projeto.
// Ao soltar, a alça grava de verdade (um passo no histórico) e limpa este estado.
import { create } from 'zustand';
import type { Project, Transform } from '@/types';

/** Estado do ajuste ao vivo. */
export interface PreviewOverrideState {
  /** Clipe sendo manipulado, ou null. */
  clipId: string | null;
  /** Transformação provisória do clipe. */
  transform: Transform | null;
  /** Define o ajuste provisório de um clipe. */
  setOverride: (clipId: string, transform: Transform) => void;
  /** Remove o ajuste provisório. */
  clearOverride: () => void;
}

/** Hook do ajuste ao vivo da prévia. */
export const usePreviewOverrideStore = create<PreviewOverrideState>()((set) => ({
  clipId: null,
  transform: null,
  // Define o ajuste provisório.
  setOverride: (clipId, transform) => set({ clipId, transform }),
  // Remove o ajuste provisório.
  clearOverride: () => set({ clipId: null, transform: null }),
}));

/** Devolve o projeto com o ajuste provisório aplicado (ou o próprio projeto, se não houver). */
export function applyPreviewOverride(project: Project, clipId: string | null, transform: Transform | null): Project {
  if (clipId === null || transform === null) return project;
  let changed = false;
  const tracks = project.tracks.map((track) => {
    if (!track.clips.some((c) => c.id === clipId)) return track;
    changed = true;
    return { ...track, clips: track.clips.map((c) => (c.id === clipId ? { ...c, transform } : c)) };
  });
  return changed ? { ...project, tracks } : project;
}
