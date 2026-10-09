// Store da timeline: seleção de clipes, zoom, rolagem, encaixe, ferramenta, área de transferência e histórico.
import { create } from 'zustand';
import type { Track } from '@/types';
import {
  createHistory,
  diffTracks,
  pushEntry,
  redo as redoHistory,
  undo as undoHistory,
  type HistoryState,
} from '@/engine/timeline/history';
import type { ClipboardData } from '@/engine/timeline/selectionOps';
import { useProjectStore } from './projectStore';
import { usePlaybackStore } from './playbackStore';

/** Zoom mínimo da timeline, em pixels por segundo. */
const MIN_ZOOM = 10;
/** Zoom máximo da timeline, em pixels por segundo. */
const MAX_ZOOM = 2000;

/** Ferramenta ativa na timeline: seleção ou lâmina. */
export type TimelineTool = 'select' | 'blade';

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
  /** Histórico de desfazer e refazer das edições da timeline. */
  history: HistoryState;
  /** Conteúdo copiado ou recortado, ou null. */
  clipboard: ClipboardData | null;
  /** Ferramenta ativa. */
  tool: TimelineTool;
  /** Substitui a seleção pelos ids informados. */
  selectClips: (ids: string[]) => void;
  /** Limpa a seleção de clipes. */
  clearSelection: () => void;
  /** Alterna um clipe na seleção (ctrl+clique). */
  toggleClipSelection: (id: string) => void;
  /** Define o zoom, limitado entre 10 e 2000. */
  setZoom: (z: number) => void;
  /** Multiplica o zoom por um fator, dentro dos limites. */
  zoomBy: (factor: number) => void;
  /** Define a rolagem horizontal, com mínimo 0. */
  setScrollLeft: (x: number) => void;
  /** Liga ou desliga o encaixe magnético. */
  toggleSnap: () => void;
  /** Define a ferramenta ativa. */
  setTool: (tool: TimelineTool) => void;
  /** Guarda o conteúdo copiado. */
  setClipboard: (data: ClipboardData | null) => void;
  /** Aplica uma edição às trilhas do projeto, registra no histórico e opcionalmente muda a seleção. */
  edit: (label: string, fn: (tracks: Track[]) => Track[], nextSelection?: string[]) => void;
  /** Desfaz a última edição. */
  undo: () => void;
  /** Refaz a edição desfeita mais recente. */
  redo: () => void;
  /** Esvazia o histórico de desfazer e refazer. */
  resetHistory: () => void;
}

/** Ids de todos os clipes das trilhas dadas. */
function allClipIds(tracks: Track[]): Set<string> {
  return new Set(tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
}

/** Hook com o estado e as ações da timeline. */
export const useTimelineStore = create<TimelineState>()((set, get) => ({
  selectedClipIds: [],
  zoom: 100,
  scrollLeft: 0,
  snapEnabled: true,
  history: createHistory(),
  clipboard: null,
  tool: 'select',
  // Substitui a seleção de clipes.
  selectClips: (ids) => set({ selectedClipIds: [...ids] }),
  // Limpa a seleção de clipes.
  clearSelection: () => set({ selectedClipIds: [] }),
  // Liga ou desliga um clipe na seleção.
  toggleClipSelection: (id) =>
    set((state) => ({
      selectedClipIds: state.selectedClipIds.includes(id)
        ? state.selectedClipIds.filter((clipId) => clipId !== id)
        : [...state.selectedClipIds, id],
    })),
  // Define o zoom dentro dos limites.
  setZoom: (z) => set({ zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z)) }),
  // Multiplica o zoom atual pelo fator.
  zoomBy: (factor) => get().setZoom(get().zoom * factor),
  // Define a rolagem sem ir abaixo de zero.
  setScrollLeft: (x) => set({ scrollLeft: Math.max(0, x) }),
  // Alterna o encaixe magnético.
  toggleSnap: () => set((state) => ({ snapEnabled: !state.snapEnabled })),
  // Define a ferramenta ativa.
  setTool: (tool) => set({ tool }),
  // Guarda o conteúdo copiado.
  setClipboard: (data) => set({ clipboard: data }),
  // Aplica uma edição: sem mudança não entra no histórico.
  edit: (label, fn, nextSelection) => {
    const project = useProjectStore.getState().project;
    if (project === null) return;
    const before = project.tracks;
    const after = fn(before);
    const entry = diffTracks(before, after, label);
    if (entry === null) return;
    set({ history: pushEntry(get().history, entry) });
    useProjectStore.getState().setTracks(after);
    if (nextSelection) get().selectClips(nextSelection);
  },
  // Desfaz a última edição e tira da seleção os clipes que deixaram de existir.
  undo: () => {
    const project = useProjectStore.getState().project;
    if (project === null) return;
    const result = undoHistory(get().history, project.tracks);
    if (result === null) return;
    applyHistoryResult(result.history, result.tracks);
  },
  // Refaz a edição desfeita mais recente e tira da seleção os clipes que deixaram de existir.
  redo: () => {
    const project = useProjectStore.getState().project;
    if (project === null) return;
    const result = redoHistory(get().history, project.tracks);
    if (result === null) return;
    applyHistoryResult(result.history, result.tracks);
  },
  // Esvazia o histórico.
  resetHistory: () => set({ history: createHistory() }),
}));

/** Grava o histórico e as trilhas resultantes de desfazer ou refazer, limpando a seleção órfã. */
function applyHistoryResult(history: HistoryState, tracks: Track[]): void {
  const store = useTimelineStore.getState();
  const existing = allClipIds(tracks);
  useProjectStore.getState().setTracks(tracks);
  useTimelineStore.setState({
    history,
    selectedClipIds: store.selectedClipIds.filter((id) => existing.has(id)),
  });
}

// Ao trocar de projeto, zera histórico, seleção, área de transferência e ferramenta, e para a reprodução na origem.
// Ao remover um asset (a contagem cai no mesmo projeto), o histórico e a seleção também deixam de valer:
// removeAsset tira clipes sem passar pelo histórico, então um desfazer traria clipes órfãos de volta.
useProjectStore.subscribe((state, previous) => {
  const switched = state.project?.id !== previous.project?.id;
  const assetRemoved =
    !switched &&
    state.project !== null &&
    previous.project !== null &&
    state.project.assets.length < previous.project.assets.length;
  if (!switched && !assetRemoved) return;
  const timeline = useTimelineStore.getState();
  timeline.resetHistory();
  timeline.clearSelection();
  useTimelineStore.setState({ clipboard: null });
  if (!switched) return;
  useTimelineStore.setState({ tool: 'select' });
  usePlaybackStore.getState().pause();
  usePlaybackStore.getState().seek(0);
});
