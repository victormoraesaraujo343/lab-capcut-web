// Salvamento com atraso do projeto aberto no IndexedDB, com descarga ao sair da página.

import { saveProject } from '@/engine/storage/db';
import type { Project } from '@/types';

const SAVE_DELAY_MS = 400;

let pending: Project | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Agenda o salvamento do projeto em 400 ms; uma nova chamada dentro do prazo substitui a anterior. */
export function scheduleSave(project: Project): void {
  pending = project;
  if (timer !== undefined) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    // Se falhar, o projeto continua pendente e é tentado de novo na próxima alteração ou descarga.
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
  try {
    await saveProject(project);
  } catch (error) {
    if (pending === null) pending = project;
    throw error;
  }
}

/** Descarta o salvamento pendente sem gravar nada, por exemplo ao apagar o projeto aberto. */
export function cancelPendingSave(): void {
  if (timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
  }
  pending = null;
}

// Descarrega o salvamento pendente ao sair da página (uma única vez, ao carregar o módulo).
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    flushSave().catch(() => undefined);
  });
}
