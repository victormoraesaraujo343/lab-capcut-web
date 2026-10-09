// Salvamento automático: a cada 10 s grava um instantâneo de recuperação quando o projeto mudou, marca a sessão aberta e oferece recuperar após um travamento.

import { create } from 'zustand';
import { t } from '@/i18n/pt-BR';
import { getProject, saveProject, type RecoverySnapshot } from '@/engine/storage/db';
import {
  clearOpenMarker,
  clearSnapshot,
  findRecovery,
  hasOpenMarker,
  saveSnapshot,
  setOpenMarker,
} from '@/engine/storage/recovery';
import { cancelPendingSave, flushSave, markSaveFailed } from './projectPersistence';
import { useProjectStore } from './projectStore';
import { checkMissingMedia, useMissingMediaStore } from './relinkCommands';
import { useTimelineStore } from './timelineStore';
import { useToastStore } from './toastStore';

/** Intervalo, em ms, entre duas verificações de mudança para o instantâneo de recuperação. */
export const AUTOSAVE_INTERVAL_MS = 10_000;

/** Estado do banner de recuperação: o instantâneo oferecido, ou null quando não há oferta. */
export interface RecoveryState {
  /** Instantâneo que pode substituir o projeto aberto, ou null. */
  offer: RecoverySnapshot | null;
  /** Substitui o projeto aberto pelo instantâneo, sem item no desfazer. */
  recover: () => Promise<void>;
  /** Descarta o instantâneo oferecido. */
  discard: () => Promise<void>;
}

/** Store do banner de recuperação. */
export const useRecoveryStore = create<RecoveryState>()((set, get) => ({
  offer: null,

  // Substitui o projeto pelo instantâneo, zera o histórico e salva.
  recover: async () => {
    const offer = get().offer;
    if (offer === null) return;
    set({ offer: null });
    cancelPendingSave();
    useProjectStore.getState().setProject(offer.project);
    const timeline = useTimelineStore.getState();
    timeline.resetHistory();
    timeline.clearSelection();
    try {
      await saveProject(offer.project);
      await clearSnapshot(offer.projectId);
    } catch {
      useToastStore.getState().pushToast(t.errors.projectSave, 'error');
    }
    void checkMissingMedia(offer.project);
  },

  // Descarta o instantâneo oferecido.
  discard: async () => {
    const offer = get().offer;
    if (offer === null) return;
    set({ offer: null });
    try {
      await clearSnapshot(offer.projectId);
    } catch {
      // Se não der para apagar, a oferta volta só na próxima abertura, se o instantâneo ainda for mais novo.
    }
  },
}));

/** Sessão de salvamento automático de um projeto aberto. */
interface Session {
  /** Projeto da sessão. */
  projectId: string;
  /** Temporizador do ciclo de instantâneos. */
  intervalId: ReturnType<typeof setInterval>;
  /** updatedAt do projeto no último instantâneo gravado (ou no carregado). */
  snapshotUpdatedAt: number | undefined;
}

/** Sessão ativa, ou null quando nenhum projeto está sendo acompanhado. */
let session: Session | null = null;

/** Ao ficar oculta, a página descarrega o salvamento pendente. */
function onVisibilityChange(): void {
  if (document.visibilityState === 'hidden') {
    flushSave().catch(() => undefined);
  }
}

/** Ao sair da página, descarrega o salvamento e remove a marca de sessão, salvo se houver oferta de recuperação pendente. */
function onPageHide(): void {
  const current = session;
  if (current === null) return;
  flushSave()
    .then(() => {
      if (useRecoveryStore.getState().offer === null) clearOpenMarker(current.projectId);
    })
    .catch(() => undefined);
}

/** Ao voltar do cache do navegador, a sessão ainda está aberta: a marca volta a existir. */
function onPageShow(event: PageTransitionEvent): void {
  if (event.persisted && session !== null) setOpenMarker(session.projectId);
}

/** Um ciclo do salvamento automático: grava o instantâneo se o projeto mudou e descarrega o salvamento. */
async function tick(): Promise<void> {
  const current = session;
  if (current === null) return;
  const project = useProjectStore.getState().project;
  const changed = project !== null && project.id === current.projectId && project.updatedAt !== current.snapshotUpdatedAt;
  // Com uma oferta de recuperação pendente, o instantâneo antigo é preservado até o usuário decidir.
  if (project !== null && changed && useRecoveryStore.getState().offer === null) {
    try {
      await saveSnapshot(project);
      if (session === current) current.snapshotUpdatedAt = project.updatedAt;
    } catch {
      markSaveFailed();
    }
  }
  await flushSave().catch(() => undefined);
}

/** Procura, em segundo plano, um instantâneo mais novo que o projeto salvo e o oferece no banner. */
async function offerRecovery(current: Session, hadOpenMarker: boolean): Promise<void> {
  try {
    const saved = await getProject(current.projectId);
    if (saved === undefined || session !== current) return;
    const snapshot = await findRecovery(saved, hadOpenMarker);
    if (snapshot !== null && session === current) {
      useRecoveryStore.setState({ offer: snapshot });
    }
  } catch {
    // Sem leitura do banco não há recuperação: o editor segue normalmente.
  }
}

/** Inicia o salvamento automático do projeto aberto: marca a sessão, verifica a mídia e procura recuperação. */
export function startAutosave(projectId: string): void {
  if (session?.projectId === projectId) return;
  if (session !== null) void stopAutosave();

  const project = useProjectStore.getState().project;
  const hadOpenMarker = hasOpenMarker(projectId);
  setOpenMarker(projectId);
  const current: Session = {
    projectId,
    snapshotUpdatedAt: project?.id === projectId ? project.updatedAt : undefined,
    intervalId: setInterval(() => {
      void tick();
    }, AUTOSAVE_INTERVAL_MS),
  };
  session = current;
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);

  void offerRecovery(current, hadOpenMarker);
  if (project !== null && project.id === projectId) void checkMissingMedia(project);
}

/** Encerra o salvamento automático do projeto: salva o pendente e, se der certo, remove a marca e o instantâneo. */
export async function stopAutosave(): Promise<void> {
  const current = session;
  if (current === null) return;
  session = null;
  clearInterval(current.intervalId);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('pagehide', onPageHide);
  window.removeEventListener('pageshow', onPageShow);
  useMissingMediaStore.getState().setMissingIds([]);

  // Com oferta pendente, a marca e o instantâneo ficam para a próxima abertura oferecer de novo.
  const offerPending = useRecoveryStore.getState().offer !== null;
  useRecoveryStore.setState({ offer: null });
  if (offerPending) return;

  try {
    await flushSave();
  } catch {
    return;
  }
  // Se outra sessão começou enquanto salvava, ela cuida da marca e do instantâneo.
  if (session !== null) return;
  clearOpenMarker(current.projectId);
  await clearSnapshot(current.projectId).catch(() => undefined);
}
