// Salvamento com atraso do projeto aberto no IndexedDB, com descarga ao sair da página e nova tentativa após falha.

import { create } from 'zustand';
import { saveProject } from '@/engine/storage/db';
import type { Project } from '@/types';

const SAVE_DELAY_MS = 400;
const RETRY_DELAY_MS = 5000;

/** Estado do salvamento mostrado no editor. */
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Estado público do salvamento: situação atual e hora do último salvamento bem-sucedido. */
export interface SaveStatusState {
  /** Situação atual do salvamento. */
  saveState: SaveState;
  /** Hora do último salvamento bem-sucedido, em timestamp (ms), ou null. */
  lastSavedAt: number | null;
}

/** Store do estado do salvamento, lida pelo indicador do editor. */
export const useSaveStatusStore = create<SaveStatusState>()(() => ({ saveState: 'idle', lastSavedAt: null }));

let pending: Project | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Agenda o salvamento do projeto em 400 ms; uma nova chamada dentro do prazo substitui a anterior. */
export function scheduleSave(project: Project): void {
  pending = project;
  useSaveStatusStore.setState({ saveState: 'saving' });
  if (timer !== undefined) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    // Se falhar, o projeto continua pendente e é tentado de novo (nova tentativa agendada).
    flushSave().catch(() => undefined);
  }, SAVE_DELAY_MS);
}

/** Salva agora o projeto pendente, se houver, e espera a gravação terminar. */
export async function flushSave(): Promise<void> {
  if (timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
  }
  const project = pending;
  pending = null;
  if (project === null) return;
  useSaveStatusStore.setState({ saveState: 'saving' });
  try {
    await saveProject(project);
    useSaveStatusStore.setState({ saveState: 'saved', lastSavedAt: Date.now() });
  } catch (error) {
    if (pending === null) pending = project;
    useSaveStatusStore.setState({ saveState: 'error' });
    scheduleRetry();
    throw error;
  }
}

/** Marca o salvamento como falho, por exemplo quando o instantâneo de recuperação não pôde ser gravado. */
export function markSaveFailed(): void {
  useSaveStatusStore.setState({ saveState: 'error' });
}

/** Descarta o salvamento pendente sem gravar nada, por exemplo ao apagar o projeto aberto. */
export function cancelPendingSave(): void {
  if (timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
  }
  pending = null;
  if (useSaveStatusStore.getState().saveState === 'saving') {
    useSaveStatusStore.setState({ saveState: 'idle' });
  }
}

/** Agenda uma nova tentativa de salvar depois de uma falha, se ainda não houver uma agendada. */
function scheduleRetry(): void {
  if (timer !== undefined) return;
  timer = setTimeout(() => {
    timer = undefined;
    flushSave().catch(() => undefined);
  }, RETRY_DELAY_MS);
}

// Descarrega o salvamento pendente ao sair da página (uma única vez, ao carregar o módulo).
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    flushSave().catch(() => undefined);
  });
}
