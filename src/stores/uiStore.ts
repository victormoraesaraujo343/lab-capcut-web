// Store da interface: tema e tamanhos dos painéis.
import { create } from 'zustand';
import type { PanelSizes, Theme } from '@/types';

/** Limites de largura dos painéis laterais, em pixels. */
const SIDE_PANEL_LIMITS = { min: 200, max: 600 } as const;
/** Limites de altura da timeline, em pixels. */
const TIMELINE_LIMITS = { min: 150, max: 600 } as const;

/** Estado e ações da interface. */
export interface UiState {
  /** Tema visual atual. */
  theme: Theme;
  /** Tamanhos dos painéis em pixels. */
  panelSizes: PanelSizes;
  /** Define o tema. */
  setTheme: (t: Theme) => void;
  /** Alterna entre tema escuro e claro. */
  toggleTheme: () => void;
  /** Define o tamanho de um painel, respeitando os limites de cada um. */
  setPanelSize: (key: keyof PanelSizes, value: number) => void;
}

/** Hook com o estado e as ações da interface. */
export const useUiStore = create<UiState>()((set) => ({
  theme: 'dark',
  panelSizes: { mediaWidth: 300, inspectorWidth: 300, timelineHeight: 280 },
  // Define o tema.
  setTheme: (t) => set({ theme: t }),
  // Alterna o tema.
  toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
  // Define um tamanho de painel dentro do seu limite.
  setPanelSize: (key, value) => {
    const limits = key === 'timelineHeight' ? TIMELINE_LIMITS : SIDE_PANEL_LIMITS;
    const clamped = Math.min(limits.max, Math.max(limits.min, value));
    set((state) => ({ panelSizes: { ...state.panelSizes, [key]: clamped } }));
  },
}));
