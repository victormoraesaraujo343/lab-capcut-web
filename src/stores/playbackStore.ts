// Store da reprodução: posição, play/pausa, loop e qualidade da prévia.
import { create } from 'zustand';
import type { PreviewQuality } from '@/types';

/** Estado e ações da reprodução. */
export interface PlaybackState {
  /** Posição atual da reprodução em ms. */
  currentTimeMs: number;
  /** Reprodução em andamento. */
  isPlaying: boolean;
  /** Repetição em loop ativa. */
  loop: boolean;
  /** Fração de resolução da prévia. */
  quality: PreviewQuality;
  /** Move a posição para o instante informado, com mínimo 0. */
  seek: (ms: number) => void;
  /** Inicia a reprodução. */
  play: () => void;
  /** Pausa a reprodução. */
  pause: () => void;
  /** Alterna entre tocar e pausar. */
  togglePlay: () => void;
  /** Liga ou desliga o loop. */
  toggleLoop: () => void;
  /** Define a qualidade da prévia. */
  setQuality: (q: PreviewQuality) => void;
  /** Anda um quadro para trás (-1) ou para frente (1), com mínimo 0. */
  stepFrame: (direction: -1 | 1, fps: number) => void;
}

/** Hook com o estado e as ações da reprodução. */
export const usePlaybackStore = create<PlaybackState>()((set) => ({
  currentTimeMs: 0,
  isPlaying: false,
  loop: false,
  quality: 0.5,
  // Move a posição sem ir abaixo de zero.
  seek: (ms) => set({ currentTimeMs: Math.max(0, ms) }),
  // Inicia a reprodução.
  play: () => set({ isPlaying: true }),
  // Pausa a reprodução.
  pause: () => set({ isPlaying: false }),
  // Alterna entre tocar e pausar.
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  // Alterna o loop.
  toggleLoop: () => set((state) => ({ loop: !state.loop })),
  // Define a qualidade da prévia.
  setQuality: (q) => set({ quality: q }),
  // Anda um quadro (1000 / fps ms) sem ir abaixo de zero; fps inválido não faz nada.
  stepFrame: (direction, fps) => {
    if (!(fps > 0)) return;
    set((state) => ({ currentTimeMs: Math.max(0, state.currentTimeMs + direction * (1000 / fps)) }));
  },
}));
