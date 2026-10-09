// Store da timeline: seleção de clipes, zoom, rolagem e encaixe.
import { create } from 'zustand';

/** Zoom mínimo da timeline, em pixels por segundo. */
const MIN_ZOOM = 10;
/** Zoom máximo da timeline, em pixels por segundo. */
const MAX_ZOOM = 2000;

/** Estado e ações da timeline. */
export interface TimelineState {
  /** Ids dos clipes selecionados. */
  selectedClipIds: string[];
  /** Zoom em pixels por segundo (entre 10 e 2000). */
  zoom: number;
  /** Rolagem horizontal da timeline em pixels. */
  scrollLeft: number;
  /** Encaixe magnético ativo. */
  snapEnabled: boolean;
  /** Substitui a seleção pelos ids informados. */
  selectClips: (ids: string[]) => void;
  /** Limpa a seleção de clipes. */
  clearSelection: () => void;
  /** Define o zoom, limitado entre 10 e 2000. */
  setZoom: (z: number) => void;
  /** Define a rolagem horizontal, com mínimo 0. */
  setScrollLeft: (x: number) => void;
  /** Liga ou desliga o encaixe magnético. */
  toggleSnap: () => void;
}

/** Hook com o estado e as ações da timeline. */
export const useTimelineStore = create<TimelineState>()((set) => ({
  selectedClipIds: [],
  zoom: 100,
  scrollLeft: 0,
  snapEnabled: true,
  // Substitui a seleção de clipes.
  selectClips: (ids) => set({ selectedClipIds: [...ids] }),
  // Limpa a seleção de clipes.
  clearSelection: () => set({ selectedClipIds: [] }),
  // Define o zoom dentro dos limites.
  setZoom: (z) => set({ zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z)) }),
  // Define a rolagem sem ir abaixo de zero.
  setScrollLeft: (x) => set({ scrollLeft: Math.max(0, x) }),
  // Alterna o encaixe magnético.
  toggleSnap: () => set((state) => ({ snapEnabled: !state.snapEnabled })),
}));
