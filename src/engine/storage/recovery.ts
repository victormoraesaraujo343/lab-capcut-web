// Recuperação após travamento: instantâneo do projeto no IndexedDB e marca de sessão aberta no localStorage.

import { deleteRecoverySnapshot, getRecoverySnapshot, putRecoverySnapshot, type RecoverySnapshot } from './db';
import type { Project } from '@/types';

const OPEN_MARKER_PREFIX = 'capcut-web:open:';

/** Chave do localStorage que marca um projeto como aberto no editor. */
export function openMarkerKey(projectId: string): string {
  return `${OPEN_MARKER_PREFIX}${projectId}`;
}

/** Marca o projeto como aberto no editor; sem localStorage, a marca simplesmente não é gravada. */
export function setOpenMarker(projectId: string): void {
  try {
    window.localStorage.setItem(openMarkerKey(projectId), String(Date.now()));
  } catch {
    // Sem armazenamento: a recuperação deste projeto fica desligada nesta sessão.
  }
}

/** Remove a marca de projeto aberto, sinal de que o editor fechou normalmente. */
export function clearOpenMarker(projectId: string): void {
  try {
    window.localStorage.removeItem(openMarkerKey(projectId));
  } catch {
    // Sem armazenamento: nada a remover.
  }
}

/** Diz se a marca de projeto aberto existe, ou seja, se a sessão anterior não foi encerrada. */
export function hasOpenMarker(projectId: string): boolean {
  try {
    return window.localStorage.getItem(openMarkerKey(projectId)) !== null;
  } catch {
    return false;
  }
}

/** Grava o instantâneo de recuperação com a cópia atual do projeto. */
export async function saveSnapshot(project: Project): Promise<void> {
  await putRecoverySnapshot({ projectId: project.id, savedAt: Date.now(), project });
}

/** Lê o instantâneo de recuperação do projeto, ou undefined se não houver. */
export async function getSnapshot(projectId: string): Promise<RecoverySnapshot | undefined> {
  return getRecoverySnapshot(projectId);
}

/** Apaga o instantâneo de recuperação do projeto. */
export async function clearSnapshot(projectId: string): Promise<void> {
  await deleteRecoverySnapshot(projectId);
}

/** Diz se o instantâneo deve ser oferecido: a sessão anterior não terminou e o instantâneo é mais novo que o projeto salvo. */
export function shouldOfferRecovery(
  saved: Project,
  snapshot: RecoverySnapshot | undefined,
  hadOpenMarker: boolean,
): boolean {
  if (!hadOpenMarker || snapshot === undefined) return false;
  return snapshot.project.updatedAt > saved.updatedAt;
}

/** Devolve o instantâneo a oferecer ao abrir o projeto salvo, ou null quando não há nada a recuperar. */
export async function findRecovery(saved: Project, hadOpenMarker: boolean): Promise<RecoverySnapshot | null> {
  const snapshot = hadOpenMarker ? await getSnapshot(saved.id) : undefined;
  return shouldOfferRecovery(saved, snapshot, hadOpenMarker) && snapshot !== undefined ? snapshot : null;
}

/** Formata um timestamp como HH:MM no fuso local, no padrão brasileiro. */
export function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
